import * as path from 'path';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';
import * as httpm from '@actions/http-client';
import {ExecOptions} from '@actions/exec/lib/interfaces';
import {IS_WINDOWS, IS_LINUX, getDownloadFileName} from './utils';

const TOKEN = core.getInput('token');
const AUTH = !TOKEN ? undefined : `token ${TOKEN}`;
const MANIFEST_REPO_OWNER = 'actions';
const MANIFEST_REPO_NAME = 'python-versions';
const MANIFEST_REPO_BRANCH = 'main';
export const MANIFEST_URL = `https://raw.githubusercontent.com/${MANIFEST_REPO_OWNER}/${MANIFEST_REPO_NAME}/${MANIFEST_REPO_BRANCH}/versions-manifest.json`;

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
  core.info(`Found release: ${JSON.stringify(foundRelease)}`);
  return foundRelease;
}

export async function getManifest(): Promise<tc.IToolRelease[]> {
  try {
    const manifestFromRepo = await getManifestFromRepo();
    core.info('Successfully fetched the manifest from the repo.');
    core.info(`Manifest from repo: ${JSON.stringify(manifestFromRepo)}`);
    validateManifest(manifestFromRepo);
    return manifestFromRepo;
  } catch (err) {
    logError('Fetching the manifest via the API failed.', err);
  }
  try {
    const manifestFromURL = await getManifestFromURL();
    core.info('Successfully fetched the manifest from the URL.');
    core.info(`Manifest from URL: ${JSON.stringify(manifestFromURL)}`);
    return manifestFromURL;
  } catch (err) {
    logError('Fetching the manifest via the URL failed.', err);
    // Rethrow the error or return a default value
    throw new Error(
      'Failed to fetch the manifest from both the repo and the URL.'
    );
  }
}

function validateManifest(manifest: any): void {
  if (!Array.isArray(manifest) || !manifest.every(isValidManifestEntry)) {
    throw new Error('Invalid manifest response');
  }
}

function isValidManifestEntry(entry: any): boolean {
  return (
    typeof entry.version === 'string' &&
    typeof entry.stable === 'boolean' &&
    typeof entry.release_url === 'string' &&
    Array.isArray(entry.files) &&
    entry.files.every(isValidFileEntry)
  );
}

function isValidFileEntry(file: any): boolean {
  return (
    typeof file.filename === 'string' &&
    typeof file.arch === 'string' &&
    typeof file.platform === 'string' &&
    (typeof file.platform_version === 'string' ||
      file.platform_version === undefined) &&
    typeof file.download_url === 'string'
  );
}

export function getManifestFromRepo(): Promise<tc.IToolRelease[]> {
  core.info(
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

  const script = IS_WINDOWS ? 'powershell ./setup.ps1' : 'bash ./setup.sh';
  await exec.exec(script, [], options);
}

export async function installCpythonFromRelease(release: tc.IToolRelease) {
  const downloadUrl = release.files[0].download_url;

  core.info(`Download from "${downloadUrl}"`);
  try {
    const fileName = getDownloadFileName(downloadUrl);
    const pythonPath = await tc.downloadTool(downloadUrl, fileName, AUTH);
    core.info('Extract downloaded archive');
    const pythonExtractedFolder = IS_WINDOWS
      ? await tc.extractZip(pythonPath)
      : await tc.extractTar(pythonPath);

    core.info('Execute installation script');
    await installPython(pythonExtractedFolder);
  } catch (err) {
    handleDownloadError(err);
    throw err;
  }

  function handleDownloadError(err: any): void {
    if (err instanceof tc.HTTPError) {
      // Rate limit?
      if (err.httpStatusCode === 403 || err.httpStatusCode === 429) {
        core.info(
          `Received HTTP status code ${err.httpStatusCode}.  This usually indicates the rate limit has been exceeded`
        );
      } else {
        core.info(err.message);
      }
      if (err.stack) {
        core.debug(err.stack);
      }
    }
  }
}

function logError(message: string, err: any): void {
  core.info(message);
  if (err instanceof Error) {
    core.info(err.message);
  }
}
