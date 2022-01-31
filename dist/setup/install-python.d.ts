import * as tc from '@actions/tool-cache';
export declare const MANIFEST_URL: string;
export declare function findReleaseFromManifest(
  semanticVersionSpec: string,
  architecture: string
): Promise<tc.IToolRelease | undefined>;
export declare function installCpythonFromRelease(
  release: tc.IToolRelease
): Promise<void>;
