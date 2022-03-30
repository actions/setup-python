import * as cache from '@actions/cache';
import * as core from '@actions/core';
import fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';

export const IS_WINDOWS = process.platform === 'win32';
export const IS_LINUX = process.platform === 'linux';
export const WINDOWS_ARCHS = ['x86', 'x64'];
export const WINDOWS_PLATFORMS = ['win32', 'win64'];
const PYPY_VERSION_FILE = 'PYPY_VERSION';

export interface IPyPyManifestAsset {
  filename: string;
  arch: string;
  platform: string;
  download_url: string;
}

export interface IPyPyManifestRelease {
  pypy_version: string;
  python_version: string;
  stable: boolean;
  latest_pypy: boolean;
  files: IPyPyManifestAsset[];
}

/** create Symlinks for downloaded PyPy
 *  It should be executed only for downloaded versions in runtime, because
 *  toolcache versions have this setup.
 */
export function createSymlinkInFolder(
  folderPath: string,
  sourceName: string,
  targetName: string,
  setExecutable = false
) {
  const sourcePath = path.join(folderPath, sourceName);
  const targetPath = path.join(folderPath, targetName);
  if (fs.existsSync(targetPath)) {
    return;
  }

  fs.symlinkSync(sourcePath, targetPath);
  if (!IS_WINDOWS && setExecutable) {
    fs.chmodSync(targetPath, '755');
  }
}

export function validateVersion(version: string) {
  return isNightlyKeyword(version) || Boolean(semver.validRange(version));
}

export function isNightlyKeyword(pypyVersion: string) {
  return pypyVersion === 'nightly';
}

export function getPyPyVersionFromPath(installDir: string) {
  return path.basename(path.dirname(installDir));
}

/**
 * In tool-cache, we put PyPy to '<toolcache_root>/PyPy/<python_version>/x64'
 * There is no easy way to determine what PyPy version is located in specific folder
 * 'pypy --version' is not reliable enough since it is not set properly for preview versions
 * "7.3.3rc1" is marked as '7.3.3' in 'pypy --version'
 * so we put PYPY_VERSION file to PyPy directory when install it to VM and read it when we need to know version
 * PYPY_VERSION contains exact version from 'versions.json'
 */
export function readExactPyPyVersionFile(installDir: string) {
  let pypyVersion = '';
  let fileVersion = path.join(installDir, PYPY_VERSION_FILE);
  if (fs.existsSync(fileVersion)) {
    pypyVersion = fs.readFileSync(fileVersion).toString();
  }

  return pypyVersion;
}

export function writeExactPyPyVersionFile(
  installDir: string,
  resolvedPyPyVersion: string
) {
  const pypyFilePath = path.join(installDir, PYPY_VERSION_FILE);
  fs.writeFileSync(pypyFilePath, resolvedPyPyVersion);
}

/**
 * Python version should be specified explicitly like "x.y" (2.7, 3.6, 3.7)
 * "3.x" or "3" are not supported
 * because it could cause ambiguity when both PyPy version and Python version are not precise
 */
export function validatePythonVersionFormatForPyPy(version: string) {
  const re = /^\d+\.\d+$/;
  return re.test(version);
}

export function isGhes(): boolean {
  const ghUrl = new URL(
    process.env['GITHUB_SERVER_URL'] || 'https://github.com'
  );
  return ghUrl.hostname.toUpperCase() !== 'GITHUB.COM';
}

export function isCacheFeatureAvailable(): boolean {
  if (!cache.isFeatureAvailable()) {
    if (isGhes()) {
      throw new Error(
        'Caching is only supported on GHES version >= 3.5. If you are on a version >= 3.5, please check with your GHES admin if the Actions cache service is enabled or not.'
      );
    } else {
      core.warning(
        'The runner was not able to contact the cache service. Caching will be skipped'
      );
    }

    return false;
  }

  return true;
}
