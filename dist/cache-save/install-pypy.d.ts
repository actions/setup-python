import {IPyPyManifestRelease} from './utils';
export declare function installPyPy(
  pypyVersion: string,
  pythonVersion: string,
  architecture: string
): Promise<{
  installDir: string;
  resolvedPythonVersion: string;
  resolvedPyPyVersion: string;
}>;
export declare function findRelease(
  releases: IPyPyManifestRelease[],
  pythonVersion: string,
  pypyVersion: string,
  architecture: string
): {
  foundAsset: any;
  resolvedPythonVersion: string;
  resolvedPyPyVersion: string;
} | null;
/** Get PyPy binary location from the tool of installation directory
 *  - On Linux and macOS, the Python interpreter is in 'bin'.
 *  - On Windows, it is in the installation root.
 */
export declare function getPyPyBinaryPath(installDir: string): string;
export declare function pypyVersionToSemantic(versionSpec: string): string;
export declare function isArchPresentForWindows(item: any): any;
export declare function isArchPresentForMacOrLinux(
  item: any,
  architecture: string,
  platform: string
): any;
export declare function findAssetForWindows(releases: any): any;
export declare function findAssetForMacOrLinux(
  releases: any,
  architecture: string,
  platform: string
): any;
