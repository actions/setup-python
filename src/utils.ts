import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';

export const IS_WINDOWS = process.platform === 'win32';
export const IS_LINUX = process.platform === 'linux';

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
