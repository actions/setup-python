import * as path from 'path';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as semver from 'semver';
import * as httpm from '@actions/http-client';
import * as exec from '@actions/exec';
import * as fs from 'fs';

import {
  IS_WINDOWS,
  IPyPyManifestRelease,
  createSymlinkInFolder,
  isNightlyKeyword
} from './utils';

const PYPY_VERSION_FILE = 'PYPY_VERSION';

export async function installPyPy(
  pypyVersion: string,
  pythonVersion: string,
  architecture: string
) {
  let downloadDir;

  const releases = await getAvailablePyPyVersions();
  if (!releases || releases.length === 0) {
    core.setFailed('No release was found in PyPy version.json');
    process.exit();
  }

  const releaseData = findRelease(
    releases,
    pythonVersion,
    pypyVersion,
    architecture
  );

  if (!releaseData || !releaseData.foundAsset) {
    core.setFailed(
      `PyPy version ${pythonVersion} (${pypyVersion}) with arch ${architecture} not found`
    );
    process.exit();
  }

  const {foundAsset, resolvedPythonVersion, resolvedPyPyVersion} = releaseData;
  let downloadUrl = `${foundAsset.download_url}`;

  core.info(`Downloading PyPy from "${downloadUrl}" ...`);
  const pypyPath = await tc.downloadTool(downloadUrl);

  core.info('Extracting downloaded archive...');
  if (IS_WINDOWS) {
    downloadDir = await tc.extractZip(pypyPath);
  } else {
    downloadDir = await tc.extractTar(pypyPath, undefined, 'x');
  }

  // root folder in archive can have unpredictable name so just take the first folder
  // downloadDir is unique folder under TEMP and can't contain any other folders
  const archiveName = fs.readdirSync(downloadDir)[0];

  const toolDir = path.join(downloadDir, archiveName);
  let installDir = toolDir;
  if (!isNightlyKeyword(resolvedPyPyVersion)) {
    installDir = await tc.cacheDir(
      toolDir,
      'PyPy',
      resolvedPythonVersion,
      architecture
    );
  }

  writeExactPyPyVersionFile(installDir, resolvedPyPyVersion);

  const binaryPath = getPyPyBinaryPath(installDir);
  await createPyPySymlink(binaryPath, resolvedPythonVersion);
  await installPip(binaryPath);

  return {installDir, resolvedPythonVersion, resolvedPyPyVersion};
}

async function getAvailablePyPyVersions() {
  const url = 'https://downloads.python.org/pypy/versions.json';
  const http: httpm.HttpClient = new httpm.HttpClient('tool-cache');

  const response = await http.getJson<IPyPyManifestRelease[]>(url);
  if (!response.result) {
    core.setFailed(
      `Unable to retrieve the list of available PyPy versions from '${url}'`
    );
    process.exit();
  }

  return response.result;
}

async function createPyPySymlink(
  pypyBinaryPath: string,
  pythonVersion: string
) {
  const version = semver.coerce(pythonVersion)!;
  const pythonBinaryPostfix = semver.major(version);
  const pypyBinaryPostfix = pythonBinaryPostfix === 2 ? '' : '3';
  let binaryExtension = IS_WINDOWS ? '.exe' : '';

  core.info('Creating symlinks...');
  createSymlinkInFolder(
    pypyBinaryPath,
    `pypy${pypyBinaryPostfix}${binaryExtension}`,
    `python${pythonBinaryPostfix}${binaryExtension}`,
    true
  );

  createSymlinkInFolder(
    pypyBinaryPath,
    `pypy${pypyBinaryPostfix}${binaryExtension}`,
    `python${binaryExtension}`,
    true
  );
}

async function installPip(pythonLocation: string) {
  core.info('Installing and updating pip');
  const pythonBinary = path.join(pythonLocation, 'python');
  await exec.exec(`${pythonBinary} -m ensurepip`);
  // TO-DO should we skip updating of pip ?
  await exec.exec(
    `${pythonLocation}/python -m pip install --ignore-installed pip`
  );
}

function findRelease(
  releases: IPyPyManifestRelease[],
  pythonVersion: string,
  pypyVersion: string,
  architecture: string
) {
  const filterReleases = releases.filter(item => {
    const isPythonVersionSatisfied = semver.satisfies(
      semver.coerce(item.python_version)!,
      pythonVersion
    );
    const isPyPyNightly =
      isNightlyKeyword(pypyVersion) && isNightlyKeyword(item.pypy_version);
    const isPyPyVersionSatisfied =
      isPyPyNightly ||
      semver.satisfies(pypyVersionToSemantic(item.pypy_version), pypyVersion);
    const isArchPresent =
      item.files &&
      item.files.some(
        file => file.arch === architecture && file.platform === process.platform
      );
    return isPythonVersionSatisfied && isPyPyVersionSatisfied && isArchPresent;
  });

  if (filterReleases.length === 0) {
    return null;
  }

  const sortedReleases = filterReleases.sort((previous, current) => {
    return (
      semver.compare(
        semver.coerce(pypyVersionToSemantic(current.pypy_version))!,
        semver.coerce(pypyVersionToSemantic(previous.pypy_version))!
      ) ||
      semver.compare(
        semver.coerce(current.python_version)!,
        semver.coerce(previous.python_version)!
      )
    );
  });

  const foundRelease = sortedReleases[0];
  const foundAsset = foundRelease.files.find(
    item => item.arch === architecture && item.platform === process.platform
  );

  return {
    foundAsset,
    resolvedPythonVersion: foundRelease.python_version,
    resolvedPyPyVersion: foundRelease.pypy_version
  };
}

// helper functions

/**
 * In tool-cache, we put PyPy to '<toolcache_root>/PyPy/<python_version>/x64'
 * There is no easy way to determine what PyPy version is located in specific folder
 * 'pypy --version' is not reliable enough since it is not set properly for preview versions
 * "7.3.3rc1" is marked as '7.3.3' in 'pypy --version'
 * so we put PYPY_VERSION file to PyPy directory when install it to VM and read it when we need to know version
 * PYPY_VERSION contains exact version from 'versions.json'
 */
export function readExactPyPyVersion(installDir: string) {
  let pypyVersion = '';
  let fileVersion = path.join(installDir, PYPY_VERSION_FILE);
  if (fs.existsSync(fileVersion)) {
    pypyVersion = fs.readFileSync(fileVersion).toString();
    core.debug(`Version from ${PYPY_VERSION_FILE} file is ${pypyVersion}`);
  }

  return pypyVersion;
}

function writeExactPyPyVersionFile(
  installDir: string,
  resolvedPyPyVersion: string
) {
  const pypyFilePath = path.join(installDir, PYPY_VERSION_FILE);
  fs.writeFileSync(pypyFilePath, resolvedPyPyVersion);
}

/** Get PyPy binary location from the tool of installation directory
 *  - On Linux and macOS, the Python interpreter is in 'bin'.
 *  - On Windows, it is in the installation root.
 */
export function getPyPyBinaryPath(installDir: string) {
  const _binDir = path.join(installDir, 'bin');
  return IS_WINDOWS ? installDir : _binDir;
}

export function pypyVersionToSemantic(versionSpec: string) {
  const prereleaseVersion = /(\d+\.\d+\.\d+)((?:a|b|rc))(\d*)/g;
  return versionSpec.replace(prereleaseVersion, '$1-$2.$3');
}
