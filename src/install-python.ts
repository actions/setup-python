import * as path from 'path';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';
import {ExecOptions} from '@actions/exec/lib/interfaces';

const AUTH_TOKEN = core.getInput('token');
const MANIFEST_REPO_OWNER = 'actions';
const MANIFEST_REPO_NAME = 'python-versions';
export const MANIFEST_URL = `https://raw.githubusercontent.com/${MANIFEST_REPO_OWNER}/${MANIFEST_REPO_NAME}/master/versions-manifest.json`;

const IS_WINDOWS = process.platform === 'win32';

export async function findReleaseFromManifest(
  semanticVersionSpec: string,
  architecture: string
): Promise<tc.IToolRelease | undefined> {
  const manifest: tc.IToolRelease[] = await tc.getManifestFromRepo(
    MANIFEST_REPO_OWNER,
    MANIFEST_REPO_NAME,
    AUTH_TOKEN
  );
  return await tc.findFromManifest(
    semanticVersionSpec,
    true,
    manifest,
    architecture
  );
}

async function installPython(workingDirectory: string) {
  const options: ExecOptions = {
    cwd: workingDirectory,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        core.debug(data.toString().trim());
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
  const pythonPath = await tc.downloadTool(downloadUrl, undefined, AUTH_TOKEN);
  const fileName = path.basename(pythonPath, '.zip');
  core.info('Extract downloaded archive');
  let pythonExtractedFolder;
  if (IS_WINDOWS) {
    pythonExtractedFolder = await tc.extractZip(pythonPath, `./${fileName}`);
  } else {
    pythonExtractedFolder = await tc.extractTar(pythonPath, `./${fileName}`);
  }

  core.info('Execute installation script');
  await installPython(pythonExtractedFolder);
}
