import * as os from 'os';
import * as path from 'path';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as semver from 'semver';
import * as httpm from '@actions/http-client';
import * as ifm from '@actions/http-client/interfaces';
import * as exec from '@actions/exec';
import fs from 'fs';

import {
  IS_WINDOWS,
  IGraalPyManifestRelease,
  createSymlinkInFolder,
  isNightlyKeyword,
  getBinaryDirectory,
  getNextPageUrl
} from './utils';

const TOKEN = core.getInput('token');
const AUTH = !TOKEN ? undefined : `token ${TOKEN}`;

export async function installGraalPy(
  graalpyVersion: string,
  architecture: string,
  allowPreReleases: boolean,
  releases: IGraalPyManifestRelease[] | undefined
) {
  let downloadDir;

  releases = releases ?? (await getAvailableGraalPyVersions());

  if (!releases || !releases.length) {
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
    const graalpyPath = await tc.downloadTool(downloadUrl, undefined, AUTH);

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

    const binaryPath = getBinaryDirectory(installDir);
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
  const http: httpm.HttpClient = new httpm.HttpClient('tool-cache');

  const headers: ifm.IHeaders = {};
  if (AUTH) {
    headers.authorization = AUTH;
  }

  let url: string | null =
    'https://api.github.com/repos/oracle/graalpython/releases';
  const result: IGraalPyManifestRelease[] = [];
  do {
    const response: ifm.ITypedResponse<IGraalPyManifestRelease[]> =
      await http.getJson(url, headers);
    if (!response.result) {
      throw new Error(
        `Unable to retrieve the list of available GraalPy versions from '${url}'`
      );
    }
    result.push(...response.result);
    url = getNextPageUrl(response);
  } while (url);

  return result;
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
  core.info(
    "Installing pip (GraalPy doesn't update pip because it uses a patched version of pip)"
  );
  const pythonBinary = path.join(pythonLocation, 'python');
  await exec.exec(`${pythonBinary} -m ensurepip --default-pip`);
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

  if (!filterReleases.length) {
    return null;
  }

  const sortedReleases = filterReleases.sort((previous, current) =>
    semver.compare(
      semver.coerce(graalPyTagToVersion(current.tag_name))!,
      semver.coerce(graalPyTagToVersion(previous.tag_name))!
    )
  );

  const foundRelease = sortedReleases[0];
  const foundAsset = findAsset(foundRelease, architecture, process.platform);

  return {
    foundAsset,
    resolvedGraalPyVersion: graalPyTagToVersion(foundRelease.tag_name)
  };
}

export function toGraalPyPlatform(platform: string) {
  switch (platform) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'macos';
  }
  return platform;
}

export function toGraalPyArchitecture(architecture: string) {
  switch (architecture) {
    case 'x64':
      return 'amd64';
    case 'arm64':
      return 'aarch64';
  }
  return architecture;
}

export function findAsset(
  item: IGraalPyManifestRelease,
  architecture: string,
  platform: string
) {
  const graalpyArch = toGraalPyArchitecture(architecture);
  const graalpyPlatform = toGraalPyPlatform(platform);
  const found = item.assets.filter(
    file =>
      file.name.startsWith('graalpy') &&
      file.name.endsWith(`-${graalpyPlatform}-${graalpyArch}.tar.gz`)
  );
  /*
  In the future there could be more variants of GraalPy for a single release. Pick the shortest name, that one is the most likely to be the primary variant.
  */
  found.sort((f1, f2) => f1.name.length - f2.name.length);
  return found[0];
}
