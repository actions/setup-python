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
  IGraalPyManifestAsset,
  IGraalPyManifestRelease,
  createSymlinkInFolder,
  isNightlyKeyword
} from './utils';

export async function installGraalPy(
  graalpyVersion: string,
  architecture: string,
  allowPreReleases: boolean,
  releases: IGraalPyManifestRelease[] | undefined
) {
  let downloadDir;

  releases = releases ?? (await getAvailableGraalPyVersions());

  if (!releases || releases.length === 0) {
    throw new Error('No release was found in GraalPy version.json');
  }

  let releaseData = findRelease(releases, graalpyVersion, architecture, false);

  if (allowPreReleases && (!releaseData || !releaseData.foundAsset)) {
    // check for pre-release
    core.info(
      [
        `Stable GraalPy version ${graalpyVersion} with arch ${architecture} not found`,
        `Trying pre-release versions`
      ].join(os.EOL)
    );
    releaseData = findRelease(releases, graalpyVersion, architecture, true);
  }

  if (!releaseData || !releaseData.foundAsset) {
    throw new Error(
      `GraalPy version ${graalpyVersion} with arch ${architecture} not found`
    );
  }

  const {foundAsset, resolvedGraalPyVersion} = releaseData;
  const downloadUrl = `${foundAsset.browser_download_url}`;

  core.info(`Downloading GraalPy from "${downloadUrl}" ...`);

  try {
    const graalpyPath = await tc.downloadTool(downloadUrl);

    core.info('Extracting downloaded archive...');
    downloadDir = await tc.extractTar(graalpyPath);

    // root folder in archive can have unpredictable name so just take the first folder
    // downloadDir is unique folder under TEMP and can't contain any other folders
    const archiveName = fs.readdirSync(downloadDir)[0];

    const toolDir = path.join(downloadDir, archiveName);
    let installDir = toolDir;
    if (!isNightlyKeyword(resolvedGraalPyVersion)) {
      installDir = await tc.cacheDir(
        toolDir,
        'GraalPy',
        resolvedGraalPyVersion,
        architecture
      );
    }

    const binaryPath = getGraalPyBinaryPath(installDir);
    await createGraalPySymlink(binaryPath, resolvedGraalPyVersion);
    await installPip(binaryPath);

    return {installDir, resolvedGraalPyVersion};
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

export async function getAvailableGraalPyVersions() {
  const url = 'https://api.github.com/repos/oracle/graalpython/releases';
  const http: httpm.HttpClient = new httpm.HttpClient('tool-cache');

  const response = await http.getJson<IGraalPyManifestRelease[]>(url);
  if (!response.result) {
    throw new Error(
      `Unable to retrieve the list of available GraalPy versions from '${url}'`
    );
  }

  return response.result;
}

async function createGraalPySymlink(
  graalpyBinaryPath: string,
  graalpyVersion: string
) {
  const version = semver.coerce(graalpyVersion)!;
  const pythonBinaryPostfix = semver.major(version);
  const pythonMinor = semver.minor(version);
  const graalpyMajorMinorBinaryPostfix = `${pythonBinaryPostfix}.${pythonMinor}`;
  const binaryExtension = IS_WINDOWS ? '.exe' : '';

  core.info('Creating symlinks...');
  createSymlinkInFolder(
    graalpyBinaryPath,
    `graalpy${binaryExtension}`,
    `python${pythonBinaryPostfix}${binaryExtension}`,
    true
  );

  createSymlinkInFolder(
    graalpyBinaryPath,
    `graalpy${binaryExtension}`,
    `python${binaryExtension}`,
    true
  );

  createSymlinkInFolder(
    graalpyBinaryPath,
    `graalpy${binaryExtension}`,
    `graalpy${graalpyMajorMinorBinaryPostfix}${binaryExtension}`,
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

export function graalPyTagToVersion(tag: string) {
  const versionPattern = /.*-(\d+\.\d+\.\d+(?:\.\d+)?)((?:a|b|rc))?(\d*)?/;
  const match = tag.match(versionPattern);
  if (match && match[2]) {
    return `${match[1]}-${match[2]}.${match[3]}`;
  } else if (match) {
    return match[1];
  } else {
    return tag.replace(/.*-/, '');
  }
}

export function findRelease(
  releases: IGraalPyManifestRelease[],
  graalpyVersion: string,
  architecture: string,
  includePrerelease: boolean
) {
  const options = {includePrerelease: includePrerelease};
  const filterReleases = releases.filter(item => {
    const isVersionSatisfied = semver.satisfies(
      graalPyTagToVersion(item.tag_name),
      graalpyVersion,
      options
    );
    return (
      isVersionSatisfied && !!findAsset(item, architecture, process.platform)
    );
  });

  if (filterReleases.length === 0) {
    return null;
  }

  const sortedReleases = filterReleases.sort((previous, current) => {
    return (
      semver.compare(
        semver.coerce(graalPyTagToVersion(current.tag_name))!,
        semver.coerce(graalPyTagToVersion(previous.tag_name))!
      ) ||
      semver.compare(
        semver.coerce(graalPyTagToVersion(current.tag_name))!,
        semver.coerce(graalPyTagToVersion(previous.tag_name))!
      )
    );
  });

  const foundRelease = sortedReleases[0];
  const foundAsset = findAsset(foundRelease, architecture, process.platform);

  return {
    foundAsset,
    resolvedGraalPyVersion: graalPyTagToVersion(foundRelease.tag_name)
  };
}

/** Get GraalPy binary location from the tool of installation directory
 *  - On Linux and macOS, the Python interpreter is in 'bin'.
 *  - On Windows, it is in the installation root.
 */
export function getGraalPyBinaryPath(installDir: string) {
  const _binDir = path.join(installDir, 'bin');
  return IS_WINDOWS ? installDir : _binDir;
}

export function findAsset(
  item: IGraalPyManifestRelease,
  architecture: string,
  platform: string
) {
  const graalpyArch =
    architecture === 'x64'
      ? 'amd64'
      : architecture === 'arm64'
      ? 'aarch64'
      : architecture;
  const graalpyPlatform =
    platform === 'win32'
      ? 'windows'
      : platform === 'darwin'
      ? 'macos'
      : platform;
    if (item.assets) {
    return item.assets.find((file: IGraalPyManifestAsset) => {
      const match_data = file.name.match(
        '.*(macos|linux|windows)-(amd64|aarch64).tar.gz$'
      );
      return (
        match_data &&
        match_data[1] === graalpyPlatform &&
        match_data[2] === graalpyArch
      );
    });
  } else {
    return undefined;
  }
}
