import * as os from 'os';
import * as path from 'path';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as semver from 'semver';
import * as httpm from '@actions/http-client';
import * as exec from '@actions/exec';
import fs from 'fs';

import {
  IS_WINDOWS,
  WINDOWS_PLATFORMS,
  IPyPyManifestRelease,
  createSymlinkInFolder,
  isNightlyKeyword,
  writeExactPyPyVersionFile,
  getBinaryDirectory
} from './utils';

export async function installPyPy(
  pypyVersion: string,
  pythonVersion: string,
  architecture: string,
  allowPreReleases: boolean,
  releases: IPyPyManifestRelease[] | undefined
) {
  let downloadDir;

  releases = releases ?? (await getAvailablePyPyVersions());

  if (!releases || releases.length === 0) {
    throw new Error('No release was found in PyPy version.json');
  }

  let releaseData = findRelease(
    releases,
    pythonVersion,
    pypyVersion,
    architecture,
    false
  );

  if (allowPreReleases && (!releaseData || !releaseData.foundAsset)) {
    // check for pre-release
    core.info(
      [
        `Stable PyPy version ${pythonVersion} (${pypyVersion}) with arch ${architecture} not found`,
        `Trying pre-release versions`
      ].join(os.EOL)
    );
    releaseData = findRelease(
      releases,
      pythonVersion,
      pypyVersion,
      architecture,
      true
    );
  }

  if (!releaseData || !releaseData.foundAsset) {
    throw new Error(
      `PyPy version ${pythonVersion} (${pypyVersion}) with arch ${architecture} not found`
    );
  }

  const {foundAsset, resolvedPythonVersion, resolvedPyPyVersion} = releaseData;
  const downloadUrl = `${foundAsset.download_url}`;

  core.info(`Downloading PyPy from "${downloadUrl}" ...`);

  try {
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

    const binaryPath = getBinaryDirectory(installDir);
    await createPyPySymlink(binaryPath, resolvedPythonVersion);
    await installPip(binaryPath);

    return {installDir, resolvedPythonVersion, resolvedPyPyVersion};
  } catch (err) {
    if (err instanceof Error) {
      // Rate limit?
      if (
        err instanceof tc.HTTPError &&
        (err.httpStatusCode === 403 || err.httpStatusCode === 429)
      ) {
        core.info(
          `Received HTTP status code ${err.httpStatusCode}.  This usually indicates the rate limit has been exceeded`
        );
      } else {
        core.info(err.message);
      }
      if (err.stack !== undefined) {
        core.debug(err.stack);
      }
    }
    throw err;
  }
}

export async function getAvailablePyPyVersions() {
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
  const pythonMinor = semver.minor(version);
  const pypyBinaryPostfix = pythonBinaryPostfix === 2 ? '' : '3';
  const pypyMajorMinorBinaryPostfix = `${pythonBinaryPostfix}.${pythonMinor}`;
  const binaryExtension = IS_WINDOWS ? '.exe' : '';

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

  createSymlinkInFolder(
    pypyBinaryPath,
    `pypy${pypyBinaryPostfix}${binaryExtension}`,
    `pypy${pypyMajorMinorBinaryPostfix}${binaryExtension}`,
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
  architecture: string,
  includePrerelease: boolean
) {
  const options = {includePrerelease: includePrerelease};
  const filterReleases = releases.filter(item => {
    const isPythonVersionSatisfied = semver.satisfies(
      semver.coerce(item.python_version)!,
      pythonVersion
    );
    const isPyPyNightly =
      isNightlyKeyword(pypyVersion) && isNightlyKeyword(item.pypy_version);
    const isPyPyVersionSatisfied =
      isPyPyNightly ||
      semver.satisfies(
        pypyVersionToSemantic(item.pypy_version),
        pypyVersion,
        options
      );
    const isArchPresent =
      item.files &&
      (IS_WINDOWS
        ? isArchPresentForWindows(item, architecture)
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
    ? findAssetForWindows(foundRelease, architecture)
    : findAssetForMacOrLinux(foundRelease, architecture, process.platform);

  return {
    foundAsset,
    resolvedPythonVersion: foundRelease.python_version,
    resolvedPyPyVersion: foundRelease.pypy_version.trim()
  };
}

export function pypyVersionToSemantic(versionSpec: string) {
  const prereleaseVersion = /(\d+\.\d+\.\d+)((?:a|b|rc))(\d*)/g;
  return versionSpec.replace(prereleaseVersion, '$1-$2.$3');
}

export function isArchPresentForWindows(item: any, architecture: string) {
  architecture = replaceX32toX86(architecture);
  return item.files.some(
    (file: any) =>
      WINDOWS_PLATFORMS.includes(file.platform) && file.arch === architecture
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

export function findAssetForWindows(releases: any, architecture: string) {
  architecture = replaceX32toX86(architecture);
  return releases.files.find(
    (item: any) =>
      WINDOWS_PLATFORMS.includes(item.platform) && item.arch === architecture
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

function replaceX32toX86(architecture: string): string {
  // convert x32 to x86 because os.arch() returns x32 for 32-bit systems but PyPy releases json has x86 arch value.
  if (architecture === 'x32') {
    architecture = 'x86';
  }
  return architecture;
}
