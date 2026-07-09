import * as path from 'path';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';
import * as httpm from '@actions/http-client';
import * as fs from 'fs';
import * as semver from 'semver';
import {ExecOptions} from '@actions/exec/lib/interfaces';
import {IS_WINDOWS, IS_LINUX, getDownloadFileName} from './utils';
import {IToolRelease} from '@actions/tool-cache';

const TOKEN = core.getInput('token');
const AUTH = !TOKEN ? undefined : `token ${TOKEN}`;
const MANIFEST_REPO_OWNER = 'actions';
const MANIFEST_REPO_NAME = 'python-versions';
const MANIFEST_REPO_BRANCH = 'main';
export const MANIFEST_URL = `https://raw.githubusercontent.com/${MANIFEST_REPO_OWNER}/${MANIFEST_REPO_NAME}/${MANIFEST_REPO_BRANCH}/versions-manifest.json`;

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
  const status =
    (err as {httpStatusCode?: number}).httpStatusCode ??
    (err as {statusCode?: number}).statusCode;
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

  try {
    return await fetchValidManifest('the raw URL', getManifestFromURL);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Fail loudly so the action doesn't exit 0 without installing Python.
    throw new Error(
      `Failed to fetch the Python versions manifest. The response was empty, truncated, or invalid, and all retries were exhausted. ${message}`
    );
  }
}

export function getManifestFromRepo(): Promise<tc.IToolRelease[]> {
  core.debug(
    `Getting manifest from ${MANIFEST_REPO_OWNER}/${MANIFEST_REPO_NAME}@${MANIFEST_REPO_BRANCH}`
  );
  return tc.getManifestFromRepo(
    MANIFEST_REPO_OWNER,
    MANIFEST_REPO_NAME,
    AUTH,
    MANIFEST_REPO_BRANCH
  );
}

export async function getManifestFromURL(): Promise<tc.IToolRelease[]> {
  core.debug('Falling back to fetching the manifest using raw URL.');

  const http: httpm.HttpClient = new httpm.HttpClient('tool-cache');
  const response = await http.getJson<tc.IToolRelease[]>(MANIFEST_URL);
  if (!response.result) {
    throw new Error(`Unable to get manifest from ${MANIFEST_URL}`);
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
    pythonPath = await tc.downloadTool(downloadUrl, fileName, AUTH);
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
