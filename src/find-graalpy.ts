import * as path from 'path';
import * as graalpyInstall from './install-graalpy';
import {
  IS_WINDOWS,
  validateVersion,
  IGraalPyManifestRelease,
  getBinaryDirectory
} from './utils';

import * as semver from 'semver';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';

export async function findGraalPyVersion(
  versionSpec: string,
  architecture: string,
  updateEnvironment: boolean,
  checkLatest: boolean,
  allowPreReleases: boolean
): Promise<string> {
  let resolvedGraalPyVersion = '';
  let installDir: string | null;
  let releases: IGraalPyManifestRelease[] | undefined;

  let graalpyVersionSpec = parseGraalPyVersion(versionSpec);

  if (checkLatest) {
    releases = await graalpyInstall.getAvailableGraalPyVersions();
    if (releases && releases.length > 0) {
      const releaseData = graalpyInstall.findRelease(
        releases,
        graalpyVersionSpec,
        architecture,
        false
      );

      if (releaseData) {
        core.info(`Resolved as GraalPy ${releaseData.resolvedGraalPyVersion}`);
        graalpyVersionSpec = releaseData.resolvedGraalPyVersion;
      } else {
        core.info(
          `Failed to resolve GraalPy ${graalpyVersionSpec} from manifest`
        );
      }
    }
  }

  ({installDir, resolvedGraalPyVersion} = findGraalPyToolCache(
    graalpyVersionSpec,
    architecture
  ));

  if (!installDir) {
    ({installDir, resolvedGraalPyVersion} = await graalpyInstall.installGraalPy(
      graalpyVersionSpec,
      architecture,
      allowPreReleases,
      releases
    ));
  }

  const pipDir = IS_WINDOWS ? 'Scripts' : 'bin';
  const _binDir = path.join(installDir, pipDir);
  const binaryExtension = IS_WINDOWS ? '.exe' : '';
  const pythonPath = path.join(
    IS_WINDOWS ? installDir : _binDir,
    `python${binaryExtension}`
  );
  const pythonLocation = getBinaryDirectory(installDir);
  if (updateEnvironment) {
    core.exportVariable('pythonLocation', installDir);
    // https://cmake.org/cmake/help/latest/module/FindPython.html#module:FindPython
    core.exportVariable('Python_ROOT_DIR', installDir);
    // https://cmake.org/cmake/help/latest/module/FindPython2.html#module:FindPython2
    core.exportVariable('Python2_ROOT_DIR', installDir);
    // https://cmake.org/cmake/help/latest/module/FindPython3.html#module:FindPython3
    core.exportVariable('Python3_ROOT_DIR', installDir);
    core.exportVariable('PKG_CONFIG_PATH', pythonLocation + '/lib/pkgconfig');
    core.addPath(pythonLocation);
    core.addPath(_binDir);
  }
  core.setOutput('python-version', 'graalpy' + resolvedGraalPyVersion);
  core.setOutput('python-path', pythonPath);

  return resolvedGraalPyVersion;
}

export function findGraalPyToolCache(
  graalpyVersion: string,
  architecture: string
) {
  let resolvedGraalPyVersion = '';
  let installDir: string | null = tc.find(
    'GraalPy',
    graalpyVersion,
    architecture
  );

  if (installDir) {
    // 'tc.find' finds tool based on Python version but we also need to check
    // whether GraalPy version satisfies requested version.
    resolvedGraalPyVersion = path.basename(path.dirname(installDir));

    const isGraalPyVersionSatisfies = semver.satisfies(
      resolvedGraalPyVersion,
      graalpyVersion
    );
    if (!isGraalPyVersionSatisfies) {
      installDir = null;
      resolvedGraalPyVersion = '';
    }
  }

  if (!installDir) {
    core.info(
      `GraalPy version ${graalpyVersion} was not found in the local cache`
    );
  }

  return {installDir, resolvedGraalPyVersion};
}

export function parseGraalPyVersion(versionSpec: string): string {
  const versions = versionSpec.split('-').filter(item => !!item);

  if (/^(graalpy)(.+)/.test(versions[0])) {
    const version = versions[0].replace('graalpy', '');
    versions.splice(0, 1, 'graalpy', version);
  }

  if (versions.length < 2 || versions[0] != 'graalpy') {
    throw new Error(
      "Invalid 'version' property for GraalPy. GraalPy version should be specified as 'graalpy<python-version>' or 'graalpy-<python-version>'. See README for examples and documentation."
    );
  }

  const pythonVersion = versions[1];

  if (!validateVersion(pythonVersion)) {
    throw new Error(
      "Invalid 'version' property for GraalPy. GraalPy versions should satisfy SemVer notation. See README for examples and documentation."
    );
  }

  return pythonVersion;
}
