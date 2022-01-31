interface IPyPyVersionSpec {
  pypyVersion: string;
  pythonVersion: string;
}
export declare function findPyPyVersion(
  versionSpec: string,
  architecture: string
): Promise<{
  resolvedPyPyVersion: string;
  resolvedPythonVersion: string;
}>;
export declare function findPyPyToolCache(
  pythonVersion: string,
  pypyVersion: string,
  architecture: string
): {
  installDir: string | null;
  resolvedPythonVersion: string;
  resolvedPyPyVersion: string;
};
export declare function parsePyPyVersion(versionSpec: string): IPyPyVersionSpec;
export declare function findPyPyInstallDirForWindows(
  pythonVersion: string
): string;
export {};
