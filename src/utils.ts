/* eslint no-unsafe-finally: "off" */
import * as cache from '@actions/cache';
import * as core from '@actions/core';
import fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import * as toml from '@iarna/toml';
import * as exec from '@actions/exec';
import * as ifm from '@actions/http-client/interfaces';

export const IS_WINDOWS = process.platform === 'win32';
export const IS_LINUX = process.platform === 'linux';
export const IS_MAC = process.platform === 'darwin';
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

export interface IGraalPyManifestAsset {
  name: string;
  browser_download_url: string;
}

export interface IGraalPyManifestRelease {
  tag_name: string;
  assets: IGraalPyManifestAsset[];
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
  const fileVersion = path.join(installDir, PYPY_VERSION_FILE);
  if (fs.existsSync(fileVersion)) {
    pypyVersion = fs.readFileSync(fileVersion).toString().trim();
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
 * Python version should be specified explicitly like "x.y" (3.10, 3.11, etc)
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
  if (cache.isFeatureAvailable()) {
    return true;
  }

  if (isGhes()) {
    core.warning(
      'Caching is only supported on GHES version >= 3.5. If you are on a version >= 3.5, please check with your GHES admin if the Actions cache service is enabled or not.'
    );
    return false;
  }

  core.warning(
    'The runner was not able to contact the cache service. Caching will be skipped'
  );
  return false;
}

export function logWarning(message: string): void {
  const warningPrefix = '[warning]';
  core.info(`${warningPrefix}${message}`);
}

async function getWindowsInfo() {
  const {stdout} = await exec.getExecOutput(
    'powershell -command "(Get-CimInstance -ClassName Win32_OperatingSystem).Caption"',
    undefined,
    {
      silent: true
    }
  );

  const windowsVersion = stdout.trim().split(' ')[3];

  return {osName: 'Windows', osVersion: windowsVersion};
}

async function getMacOSInfo() {
  const {stdout} = await exec.getExecOutput('sw_vers', ['-productVersion'], {
    silent: true
  });

  const macOSVersion = stdout.trim();

  return {osName: 'macOS', osVersion: macOSVersion};
}

export async function getLinuxInfo() {
  const {stdout} = await exec.getExecOutput('lsb_release', ['-i', '-r', '-s'], {
    silent: true
  });

  const [osName, osVersion] = stdout.trim().split('\n');

  core.debug(`OS Name: ${osName}, Version: ${osVersion}`);

  return {osName: osName, osVersion: osVersion};
}

export async function getOSInfo() {
  let osInfo;
  try {
    if (IS_WINDOWS) {
      osInfo = await getWindowsInfo();
    } else if (IS_LINUX) {
      osInfo = await getLinuxInfo();
    } else if (IS_MAC) {
      osInfo = await getMacOSInfo();
    }
  } catch (err) {
    const error = err as Error;
    core.debug(error.message);
  } finally {
    return osInfo;
  }
}

/**
 * Extract a value from an object by following the keys path provided.
 * If the value is present, it is returned. Otherwise undefined is returned.
 */
function extractValue(obj: any, keys: string[]): string | undefined {
  if (keys.length > 0) {
    const value = obj[keys[0]];
    if (keys.length > 1 && value !== undefined) {
      return extractValue(value, keys.slice(1));
    } else {
      return value;
    }
  } else {
    return;
  }
}

/**
 * Python version extracted from the TOML file.
 * If the `project` key is present at the root level, the version is assumed to
 * be specified according to PEP 621 in `project.requires-python`.
 * Otherwise, if the `tool` key is present at the root level, the version is
 * assumed to be specified using poetry under `tool.poetry.dependencies.python`.
 * If none is present, returns an empty list.
 */
export function getVersionInputFromTomlFile(versionFile: string): string[] {
  core.debug(`Trying to resolve version form ${versionFile}`);

  const pyprojectFile = fs.readFileSync(versionFile, 'utf8');
  const pyprojectConfig = toml.parse(pyprojectFile);
  let keys = [];

  if ('project' in pyprojectConfig) {
    // standard project metadata (PEP 621)
    keys = ['project', 'requires-python'];
  } else {
    // python poetry
    keys = ['tool', 'poetry', 'dependencies', 'python'];
  }
  const versions = [];
  const version = extractValue(pyprojectConfig, keys);
  if (version !== undefined) {
    versions.push(version);
  }

  core.info(`Extracted ${versions} from ${versionFile}`);
  const rawVersions = Array.from(versions, version =>
    version.split(',').join(' ')
  );
  const validatedVersions = rawVersions
    .map(item => semver.validRange(item, true))
    .filter((versionRange, index) => {
      if (!versionRange) {
        core.debug(
          `The version ${rawVersions[index]} is not valid SemVer range`
        );
      }

      return !!versionRange;
    }) as string[];
  return validatedVersions;
}

/**
 * Python version extracted from a plain text file.
 */
export function getVersionInputFromPlainFile(versionFile: string): string[] {
  core.debug(`Trying to resolve version form ${versionFile}`);
  const version = fs.readFileSync(versionFile, 'utf8').trim();
  core.info(`Resolved ${versionFile} as ${version}`);
  return [version];
}

/**
 * Python version extracted from a plain or TOML file.
 */
export function getVersionInputFromFile(versionFile: string): string[] {
  if (versionFile.endsWith('.toml')) {
    return getVersionInputFromTomlFile(versionFile);
  } else {
    return getVersionInputFromPlainFile(versionFile);
  }
}

/**
 * Get the directory containing interpreter binary from installation directory of PyPy or GraalPy
 *  - On Linux and macOS, the Python interpreter is in 'bin'.
 *  - On Windows, it is in the installation root.
 */
export function getBinaryDirectory(installDir: string) {
  return IS_WINDOWS ? installDir : path.join(installDir, 'bin');
}

/**
 * Extract next page URL from a HTTP response "link" header. Such headers are used in GitHub APIs.
 */
export function getNextPageUrl<T>(response: ifm.ITypedResponse<T>) {
  const responseHeaders = <ifm.IHeaders>response.headers;
  const linkHeader = responseHeaders.link;
  if (typeof linkHeader === 'string') {
    for (const link of linkHeader.split(/\s*,\s*/)) {
      const match = link.match(/<([^>]+)>(.*)/);
      if (match) {
        const url = match[1];
        for (const param of match[2].split(/\s*;\s*/)) {
          if (param.match(/rel="?next"?/)) {
            return url;
          }
        }
      }
    }
  }
  return null;
}
