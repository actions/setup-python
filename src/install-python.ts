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
