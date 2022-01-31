export declare const IS_WINDOWS: boolean;
export declare const IS_LINUX: boolean;
export declare const WINDOWS_ARCHS: string[];
export declare const WINDOWS_PLATFORMS: string[];
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
export declare function createSymlinkInFolder(
  folderPath: string,
  sourceName: string,
  targetName: string,
  setExecutable?: boolean
): void;
export declare function validateVersion(version: string): boolean;
export declare function isNightlyKeyword(pypyVersion: string): boolean;
export declare function getPyPyVersionFromPath(installDir: string): string;
/**
 * In tool-cache, we put PyPy to '<toolcache_root>/PyPy/<python_version>/x64'
 * There is no easy way to determine what PyPy version is located in specific folder
 * 'pypy --version' is not reliable enough since it is not set properly for preview versions
 * "7.3.3rc1" is marked as '7.3.3' in 'pypy --version'
 * so we put PYPY_VERSION file to PyPy directory when install it to VM and read it when we need to know version
 * PYPY_VERSION contains exact version from 'versions.json'
 */
export declare function readExactPyPyVersionFile(installDir: string): string;
export declare function writeExactPyPyVersionFile(
  installDir: string,
  resolvedPyPyVersion: string
): void;
/**
 * Python version should be specified explicitly like "x.y" (2.7, 3.6, 3.7)
 * "3.x" or "3" are not supported
 * because it could cause ambiguity when both PyPy version and Python version are not precise
 */
export declare function validatePythonVersionFormatForPyPy(
  version: string
): boolean;
export declare function isGhes(): boolean;
