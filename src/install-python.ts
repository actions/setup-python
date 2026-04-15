import * as path from 'path';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';
import * as httpm from '@actions/http-client';
import {ExecOptions} from '@actions/exec/lib/interfaces';
import {IS_WINDOWS, IS_LINUX, getDownloadFileName} from './utils';
import {IToolRelease} from '@actions/tool-cache';

const DEFAULT_REPO_OWNER = 'actions';
const DEFAULT_REPO_NAME = 'python-versions';
const DEFAULT_REPO_BRANCH = 'main';
const DEFAULT_MIRROR = `https://raw.githubusercontent.com/${DEFAULT_REPO_OWNER}/${DEFAULT_REPO_NAME}/${DEFAULT_REPO_BRANCH}`;

// Matches https://raw.githubusercontent.com/{owner}/{repo}/{branch}
const REPO_COORDS_RE =
  /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/?$/;

function getToken(): string {
  return core.getInput('token');
}

function getMirrorToken(): string {
  return core.getInput('mirror-token');
}

function getMirror(): string {
  const raw = (core.getInput('mirror') || DEFAULT_MIRROR)
    .trim()
    .replace(/\/+$/, '');
  try {
    new URL(raw);
  } catch {
    throw new Error(`Invalid 'mirror' URL: "${raw}"`);
  }
  return raw;
}

export function getManifestUrl(): string {
  return `${getMirror()}/versions-manifest.json`;
}

function resolveRepoCoords(): {
  owner: string;
  repo: string;
  branch: string;
} | null {
  const m = REPO_COORDS_RE.exec(getMirror());
  return m ? {owner: m[1], repo: m[2], branch: m[3]} : null;
}

function authForUrl(url: string): string | undefined {
  const mirrorToken = getMirrorToken();
  if (mirrorToken) return `token ${mirrorToken}`;
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return undefined;
  }
  const token = getToken();
  if (
    token &&
    (host === 'github.com' ||
      host.endsWith('.github.com') ||
      host.endsWith('.githubusercontent.com'))
  )
    return `token ${token}`;
  return undefined;
}

export async function findReleaseFromManifest(
  semanticVersionSpec: string,
  architecture: string,
  manifest: tc.IToolRelease[] | null
): Promise<tc.IToolRelease | undefined> {
  if (!manifest) {
    manifest = await getManifest();
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
export async function getManifest(): Promise<tc.IToolRelease[]> {
  try {
    const repoManifest = await getManifestFromRepo();
    if (
      Array.isArray(repoManifest) &&
      repoManifest.length &&
      repoManifest.every(isIToolRelease)
    ) {
      return repoManifest;
    }
    throw new Error(
      'The repository manifest is invalid or does not include any valid tool release (IToolRelease) entries.'
    );
  } catch (err) {
    core.debug('Fetching the manifest via the API failed.');
    if (err instanceof Error) {
      core.debug(err.message);
    } else {
      core.error('An unexpected error occurred while fetching the manifest.');
    }
  }
  return await getManifestFromURL();
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
  // api.github.com is a GitHub-owned URL. Prefer MIRROR_TOKEN (the user provided token), fall back to TOKEN.
  const token = getToken();
  const mirrorToken = getMirrorToken();
  const auth = !mirrorToken
    ? !token
      ? undefined
      : `token ${token}`
    : `token ${mirrorToken}`;
  return tc.getManifestFromRepo(coords.owner, coords.repo, auth, coords.branch);
}

export async function getManifestFromURL(): Promise<tc.IToolRelease[]> {
  core.debug('Falling back to fetching the manifest using raw URL.');

  const manifestUrl = getManifestUrl();
  const http: httpm.HttpClient = new httpm.HttpClient('tool-cache');
  const response = await http.getJson<tc.IToolRelease[]>(manifestUrl);
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
        core.error(data.toString().trim());
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
