import * as path from 'path';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';
import {ExecOptions} from '@actions/exec/lib/interfaces';
import {IS_WINDOWS, IS_LINUX} from './utils';

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

  return foundRelease;
}

export function getManifest(): Promise<tc.IToolRelease[]> {
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
  const downloadUrl = release.files[0].download_url;

  core.info(`Download from "${downloadUrl}"`);
  let pythonPath = '';
  try {
    pythonPath = await tc.downloadTool(downloadUrl, undefined, AUTH);
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
    throw err;
  }
}
