interface InstalledVersion {
  impl: string;
  version: string;
}
/**
 * Python's prelease versions look like `3.7.0b2`.
 * This is the one part of Python versioning that does not look like semantic versioning, which specifies `3.7.0-b2`.
 * If the version spec contains prerelease versions, we need to convert them to the semantic version equivalent.
 */
export declare function pythonVersionToSemantic(versionSpec: string): string;
export declare function findPythonVersion(
  version: string,
  architecture: string
): Promise<InstalledVersion>;
export {};
