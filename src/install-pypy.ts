import * as path from 'path';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as semver from 'semver';
import * as httpm from '@actions/http-client';
import * as exec from '@actions/exec';
import fs from 'fs';

import {
  IS_WINDOWS,
  WINDOWS_ARCHS,
  WINDOWS_PLATFORMS,
  IPyPyManifestRelease,
  createSymlinkInFolder,
  isNightlyKeyword,
  writeExactPyPyVersionFile
} from './utils';

export async function installPyPy(
  pypyVersion: string,
  pythonVersion: string,
  architecture: string
) {
  let downloadDir;

  const releases = await getAvailablePyPyVersions();
  if (!releases || releases.length === 0) {
    throw new Error('No release was found in PyPy version.json');
  }

  const releaseData = findRelease(
    releases,
    pythonVersion,
    pypyVersion,
    architecture
  );

  if (!releaseData || !releaseData.foundAsset) {
    throw new Error(
      `PyPy version ${pythonVersion} (${pypyVersion}) with arch ${architecture} not found`
    );
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
    throw new Error(
      `Unable to retrieve the list of available PyPy versions from '${url}'`
    );
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

  await exec.exec(
    `${pythonLocation}/python -m pip install --ignore-installed pip`
  );
}

export function findRelease(
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
      (IS_WINDOWS
        ? isArchPresentForWindows(item)
        : isArchPresentForMacOrLinux(item, architecture, process.platform));
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
  const foundAsset = IS_WINDOWS
    ? findAssetForWindows(foundRelease)
    : findAssetForMacOrLinux(foundRelease, architecture, process.platform);

  return {
    foundAsset,
    resolvedPythonVersion: foundRelease.python_version,
    resolvedPyPyVersion: foundRelease.pypy_version
  };
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

export function isArchPresentForWindows(item: any) {
  return item.files.some(
    (file: any) =>
      WINDOWS_ARCHS.includes(file.arch) &&
      WINDOWS_PLATFORMS.includes(file.platform)
  );
}

export function isArchPresentForMacOrLinux(
  item: any,
  architecture: string,
  platform: string
) {
  return item.files.some(
    (file: any) => file.arch === architecture && file.platform === platform
  );
}

export function findAssetForWindows(releases: any) {
  return releases.files.find(
    (item: any) =>
      WINDOWS_ARCHS.includes(item.arch) &&
      WINDOWS_PLATFORMS.includes(item.platform)
  );
}

export function findAssetForMacOrLinux(
  releases: any,
  architecture: string,
  platform: string
) {
  return releases.files.find(
    (item: any) => item.arch === architecture && item.platform === platform
  );
}
