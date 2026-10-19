import * as path from 'path';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';
import {ExecOptions} from '@actions/exec';
import * as httpm from '@actions/http-client';
import * as fs from 'fs';
import * as semver from 'semver';
import {IS_WINDOWS, IS_LINUX, getDownloadFileName} from './utils.js';
import {IToolRelease} from '@actions/tool-cache';

const DEFAULT_REPO_OWNER = 'actions';
const DEFAULT_REPO_NAME = 'python-versions';
const DEFAULT_REPO_BRANCH = 'main';
const DEFAULT_MIRROR = `https://raw.githubusercontent.com/${DEFAULT_REPO_OWNER}/${DEFAULT_REPO_NAME}/${DEFAULT_REPO_BRANCH}`;

// Matches https://raw.githubusercontent.com/{owner}/{repo}/{branch} and the
// equivalent https://raw.githubusercontent.com/{owner}/{repo}/refs/heads/{branch}
// form, capturing the bare branch in both. The GitHub tree API wants the bare
// branch, so the optional refs/heads/ prefix is consumed, not captured.
const REPO_COORDS_RE =
  /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(?:refs\/heads\/)?([^/]+)\/?$/;

function getToken(): string {
  return core.getInput('token');
}

function getMirrorToken(): string {
  return core.getInput('mirror-token');
}

// Memoized per raw input value so the mirror is validated once per run rather
// than on every call. `getManifestUrl()` is also used to build the "version not
// found" message in find-python.ts, where re-validating would replace the real
// cause with an invalid-mirror error.
const mirrorCache = new Map<string, {url: string} | {error: Error}>();

function getMirror(): string {
  const input = core.getInput('mirror') || DEFAULT_MIRROR;
  let resolved = mirrorCache.get(input);

  if (!resolved) {
    const url = input.trim().replace(/\/+$/, '');
    try {
      new URL(url);
      resolved = {url};
    } catch {
      resolved = {error: new Error(`Invalid 'mirror' URL: "${url}"`)};
    }
    mirrorCache.set(input, resolved);
  }

  if ('error' in resolved) throw resolved.error;
  return resolved.url;
}

export function getManifestUrl(): string {
  return `${getMirror()}/versions-manifest.json`;
}

// Whether the user set `mirror` to something other than the built-in default.
// action.yml gives `mirror` a default, so core.getInput('mirror') is never
// empty; callers that want "did the user opt into a custom mirror" must compare
// against DEFAULT_MIRROR rather than test for a falsy input. Normalizes the
// same way getMirror() does but never throws, so a warning path can call it
// even when the mirror is malformed.
export function isMirrorCustomized(): boolean {
  const input = core.getInput('mirror');
  if (!input) return false;
  return input.trim().replace(/\/+$/, '') !== DEFAULT_MIRROR;
}

// Origin (scheme + host + port) of the mirror, so `mirror-token` is matched
// against the exact origin the user nominated. Comparing origin rather than
// host alone means a manifest served over https that points a download_url at
// http://same-host/... does NOT get the token — the scheme must match too.
// Deliberately not wrapped in try/catch: an invalid mirror throws here just as
// it does in getManifestUrl(), so both agree a bad mirror is fatal.
function getMirrorOrigin(): string {
  return new URL(getMirror()).origin;
}

function isGitHubHost(host: string): boolean {
  return (
    host === 'github.com' ||
    host.endsWith('.github.com') ||
    host.endsWith('.githubusercontent.com')
  );
}

// Warned at most once per distinct mirror; resolveRepoCoords() is called from
// several paths within a single run.
const warnedMirrors = new Set<string>();

export function resolveRepoCoords(): {
  owner: string;
  repo: string;
  branch: string;
} | null {
  const mirror = getMirror();
  const m = REPO_COORDS_RE.exec(mirror);
  if (m) return {owner: m[1], repo: m[2], branch: m[3]};

  // A raw.githubusercontent.com URL that doesn't parse is a branch name
  // containing a slash (e.g. .../{owner}/{repo}/feature/riscv), which is
  // indistinguishable from a deeper path. getMirror() succeeded above, so the
  // URL is well-formed and this parse cannot throw.
  const isRawGitHub = new URL(mirror).host === 'raw.githubusercontent.com';
  if (!warnedMirrors.has(mirror) && isRawGitHub) {
    warnedMirrors.add(mirror);
    core.warning(
      `Could not parse owner/repo/branch out of mirror "${mirror}", so the manifest will be fetched directly from the raw URL instead of through the GitHub REST API. ` +
        `The request is still authenticated with your token, because raw.githubusercontent.com is a GitHub host. ` +
        `Branch names containing '/' are not supported for the REST API path; use a branch without a slash if you want the manifest fetched through the API.`
    );
  }

  return null;
}

// Mirror origin with `mirror-token` set gets the token verbatim, so internal
// mirrors can choose their own scheme (Bearer, Basic, ...). GitHub hosts get
// `token ${token}`. Anything else is anonymous — neither credential is sent to
// a host the user didn't nominate.
function authForUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  const mirrorToken = getMirrorToken();
  if (mirrorToken && parsed.origin === getMirrorOrigin()) return mirrorToken;

  const token = getToken();
  if (token && isGitHubHost(parsed.host)) return `token ${token}`;

  return undefined;
}

interface LinuxOsRelease {
  id: string;
  versionId: string;
}

function getLinuxOsRelease(): LinuxOsRelease | null {
  try {
    const content = fs.readFileSync('/etc/os-release', 'utf8');
    const lines = content.split('\n');
    let id = '';
    let versionId = '';
    for (const line of lines) {
      const parts = line.split('=');
      if (parts.length === 2) {
        const key = parts[0].trim();
        const value = parts[1].trim().replace(/^"/, '').replace(/"$/, '');
        if (key === 'ID') id = value;
        if (key === 'VERSION_ID') versionId = value;
      }
    }
    if (id && versionId) {
      return {id, versionId};
    }
    return null;
  } catch {
    return null;
  }
}

function findRhelRelease(
  semanticVersionSpec: string,
  architecture: string,
  manifest: tc.IToolRelease[],
  osVersion: string
): tc.IToolRelease | undefined {
  for (const candidate of manifest) {
    const version = candidate.version;
    core.debug(`check ${version} satisfies ${semanticVersionSpec}`);

    if (!semver.satisfies(version, semanticVersionSpec)) continue;

    const file = candidate.files.find(item => {
      core.debug(
        `${item.arch}===${architecture} && ${item.platform}===rhel && ${item.platform_version}===${osVersion}`
      );
      const archMatch = item.arch === architecture;
      const platformMatch = item.platform === 'rhel';
      const versionMatch =
        !item.platform_version ||
        item.platform_version === osVersion ||
        osVersion.startsWith(item.platform_version);
      return archMatch && platformMatch && versionMatch;
    });

    if (file) {
      core.debug(`matched ${candidate.version}`);
      const result = Object.assign({}, candidate);
      result.files = [file];
      return result;
    }
  }
  return undefined;
}

const MANIFEST_FETCH_MAX_ATTEMPTS = 3;
const MANIFEST_FETCH_RETRY_BASE_DELAY_MS = 1000;

export async function findReleaseFromManifest(
  semanticVersionSpec: string,
  architecture: string,
  manifest: tc.IToolRelease[] | null
): Promise<tc.IToolRelease | undefined> {
  if (!manifest) {
    manifest = await getManifest();
  }

  // On RHEL, tc.findFromManifest() won't match because os.platform() returns 'linux'
  // but manifest entries use platform 'rhel'. Use custom filtering for RHEL.
  if (IS_LINUX) {
    const osRelease = getLinuxOsRelease();
    if (osRelease && osRelease.id === 'rhel') {
      core.debug(
        `Detected RHEL ${osRelease.versionId}, using custom manifest filtering`
      );
      return findRhelRelease(
        semanticVersionSpec,
        architecture,
        manifest,
        osRelease.versionId
      );
    }
  }

  const foundRelease = await tc.findFromManifest(
    semanticVersionSpec,
    false,
    manifest,
    architecture
  );

  return foundRelease;
}

function isIToolRelease(obj: any): obj is IToolRelease {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.version === 'string' &&
    typeof obj.stable === 'boolean' &&
    Array.isArray(obj.files) &&
    obj.files.every(
      (file: any) =>
        typeof file.filename === 'string' &&
        typeof file.platform === 'string' &&
        typeof file.arch === 'string' &&
        typeof file.download_url === 'string'
    )
  );
}

// Rejects empty or truncated manifest responses.
function isValidManifest(manifest: unknown): manifest is tc.IToolRelease[] {
  return (
    Array.isArray(manifest) &&
    manifest.length > 0 &&
    manifest.every(isIToolRelease)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// HTTP 403/429 from http-client (`statusCode`) or tool-cache (`httpStatusCode`).
function isRateLimitError(err: unknown): boolean {
  const e = err as
    {httpStatusCode?: number; statusCode?: number} | null | undefined;
  const status = e?.httpStatusCode ?? e?.statusCode;
  return status === 403 || status === 429;
}

// Fetches and validates a manifest, retrying transient failures with backoff.
async function fetchValidManifest(
  source: string,
  fetcher: () => Promise<tc.IToolRelease[]>
): Promise<tc.IToolRelease[]> {
  let lastError: Error | undefined;
  let attempts = 0;

  for (let attempt = 1; attempt <= MANIFEST_FETCH_MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    try {
      const manifest = await fetcher();
      if (isValidManifest(manifest)) {
        return manifest;
      }
      throw new Error(
        `The manifest fetched from ${source} is empty, truncated, or does not contain any valid tool release entries.`
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      core.debug(
        `Attempt ${attempt}/${MANIFEST_FETCH_MAX_ATTEMPTS} to fetch the manifest from ${source} failed: ${lastError.message}`
      );

      // Rate limits won't clear within the backoff window; fall back instead.
      if (isRateLimitError(err)) {
        core.debug(
          `${source} is rate-limited; skipping retries for this source.`
        );
        break;
      }

      if (attempt < MANIFEST_FETCH_MAX_ATTEMPTS) {
        const delay = MANIFEST_FETCH_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
        core.debug(`Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `Failed to fetch a valid manifest from ${source} after ${attempts} attempt(s): ${lastError?.message}`
  );
}

export async function getManifest(): Promise<tc.IToolRelease[]> {
  // Only GitHub repo mirrors can be fetched via the API. Checking up front
  // avoids burning MANIFEST_FETCH_MAX_ATTEMPTS with backoff on a throw that
  // could never succeed.
  if (resolveRepoCoords()) {
    try {
      return await fetchValidManifest('the GitHub API', getManifestFromRepo);
    } catch (err) {
      core.debug('Fetching the manifest via the API failed.');
      if (err instanceof Error) {
        core.debug(err.message);
      } else {
        core.debug('An unexpected error occurred while fetching the manifest.');
      }
    }
  } else {
    core.debug(
      `Mirror "${getMirror()}" is not a GitHub repo URL; fetching the manifest by URL.`
    );
  }

  try {
    return await fetchValidManifest('the raw URL', getManifestFromURL);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Fail loudly so the action doesn't exit 0 without installing Python.
    throw new Error(
      `Failed to fetch the Python versions manifest. The response was empty, truncated, or invalid, and all retries were exhausted. ${message}`,
      {cause: err}
    );
  }
}

export function getManifestFromRepo(): Promise<tc.IToolRelease[]> {
  const coords = resolveRepoCoords();
  if (!coords) {
    throw new Error(
      `Mirror "${getMirror()}" is not a GitHub repo URL; falling back to raw URL fetch.`
    );
  }
  core.debug(
    `Getting manifest from ${coords.owner}/${coords.repo}@${coords.branch}`
  );
  // This only runs for GitHub repo mirrors, where `mirror-token` is the user's
  // explicit intent for that repo. The target is always api.github.com, which
  // requires the `token ` prefix, so the host rule in authForUrl() doesn't
  // apply here.
  const token = getToken();
  const mirrorToken = getMirrorToken();
  const auth = mirrorToken
    ? `token ${mirrorToken}`
    : token
      ? `token ${token}`
      : undefined;
  return tc.getManifestFromRepo(coords.owner, coords.repo, auth, coords.branch);
}

export async function getManifestFromURL(): Promise<tc.IToolRelease[]> {
  core.debug('Falling back to fetching the manifest using raw URL.');

  const manifestUrl = getManifestUrl();
  const http: httpm.HttpClient = new httpm.HttpClient('tool-cache');
  const auth = authForUrl(manifestUrl);
  const response = await http.getJson<tc.IToolRelease[]>(
    manifestUrl,
    auth ? {authorization: auth} : undefined
  );
  if (!response.result) {
    throw new Error(`Unable to get manifest from ${manifestUrl}`);
  }
  return response.result;
}

async function installPython(workingDirectory: string) {
  const options: ExecOptions = {
    cwd: workingDirectory,
    env: {
      ...process.env,
      ...(IS_LINUX && {LD_LIBRARY_PATH: path.join(workingDirectory, 'lib')})
    },
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        core.info(data.toString().trim());
      },
      stderr: (data: Buffer) => {
        const msg = data.toString().trim();
        if (/^WARNING:/im.test(msg)) {
          core.warning(msg);
        } else {
          core.error(msg);
        }
      }
    }
  };

  if (IS_WINDOWS) {
    await exec.exec('powershell', ['./setup.ps1'], options);
  } else {
    await exec.exec('bash', ['./setup.sh'], options);
  }
}

export async function installCpythonFromRelease(release: tc.IToolRelease) {
  if (!release.files || release.files.length === 0) {
    throw new Error('No files found in the release to download.');
  }
  const downloadUrl = release.files[0].download_url;

  core.info(`Download from "${downloadUrl}"`);
  let pythonPath = '';
  try {
    const fileName = getDownloadFileName(downloadUrl);
    pythonPath = await tc.downloadTool(
      downloadUrl,
      fileName,
      authForUrl(downloadUrl)
    );
    core.info('Extract downloaded archive');
    let pythonExtractedFolder;
    if (IS_WINDOWS) {
      pythonExtractedFolder = await tc.extractZip(pythonPath);
    } else {
      pythonExtractedFolder = await tc.extractTar(pythonPath);
    }

    core.info('Execute installation script');
    await installPython(pythonExtractedFolder);
  } catch (err) {
    if (err instanceof tc.HTTPError) {
      // Rate limit?
      if (err.httpStatusCode === 403) {
        core.error(
          `Received HTTP status code 403. This indicates a permission issue or restricted access.`
        );
      } else if (err.httpStatusCode === 429) {
        core.info(
          `Received HTTP status code 429.  This usually indicates the rate limit has been exceeded`
        );
      } else {
        core.info(err.message);
      }
      if (err.stack) {
        core.debug(err.stack);
      }
    }
    throw err;
  }
}
