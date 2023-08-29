import * as path from 'path';
import * as pypyInstall from './install-pypy';
import {
  IS_WINDOWS,
  WINDOWS_ARCHS,
  validateVersion,
  getPyPyVersionFromPath,
  readExactPyPyVersionFile,
  validatePythonVersionFormatForPyPy,
  IPyPyManifestRelease,
  getBinaryDirectory
} from './utils';

import * as semver from 'semver';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';

interface IPyPyVersionSpec {
  pypyVersion: string;
  pythonVersion: string;
}

export async function findPyPyVersion(
  versionSpec: string,
  architecture: string,
  updateEnvironment: boolean,
  checkLatest: boolean,
  allowPreReleases: boolean
): Promise<{resolvedPyPyVersion: string; resolvedPythonVersion: string}> {
  let resolvedPyPyVersion = '';
  let resolvedPythonVersion = '';
  let installDir: string | null;
  let releases: IPyPyManifestRelease[] | undefined;

  const pypyVersionSpec = parsePyPyVersion(versionSpec);

  if (checkLatest) {
    releases = await pypyInstall.getAvailablePyPyVersions();
    if (releases && releases.length > 0) {
      const releaseData = pypyInstall.findRelease(
        releases,
        pypyVersionSpec.pythonVersion,
        pypyVersionSpec.pypyVersion,
        architecture,
        false
      );

      if (releaseData) {
        core.info(
          `Resolved as PyPy ${releaseData.resolvedPyPyVersion} with Python (${releaseData.resolvedPythonVersion})`
        );
        pypyVersionSpec.pythonVersion = releaseData.resolvedPythonVersion;
        pypyVersionSpec.pypyVersion = releaseData.resolvedPyPyVersion;
      } else {
        core.info(
          `Failed to resolve PyPy ${pypyVersionSpec.pypyVersion} with Python (${pypyVersionSpec.pythonVersion}) from manifest`
        );
      }
    }
  }

  ({installDir, resolvedPythonVersion, resolvedPyPyVersion} = findPyPyToolCache(
    pypyVersionSpec.pythonVersion,
    pypyVersionSpec.pypyVersion,
    architecture
  ));

  if (!installDir) {
    ({installDir, resolvedPythonVersion, resolvedPyPyVersion} =
      await pypyInstall.installPyPy(
        pypyVersionSpec.pypyVersion,
        pypyVersionSpec.pythonVersion,
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
  core.setOutput('python-version', 'pypy' + resolvedPyPyVersion);
  core.setOutput('python-path', pythonPath);

  return {resolvedPyPyVersion, resolvedPythonVersion};
}

export function findPyPyToolCache(
  pythonVersion: string,
  pypyVersion: string,
  architecture: string
) {
  let resolvedPyPyVersion = '';
  let resolvedPythonVersion = '';
  let installDir: string | null = IS_WINDOWS
    ? findPyPyInstallDirForWindows(pythonVersion)
    : tc.find('PyPy', pythonVersion, architecture);

  if (installDir) {
    // 'tc.find' finds tool based on Python version but we also need to check
    // whether PyPy version satisfies requested version.
    resolvedPythonVersion = getPyPyVersionFromPath(installDir);
    resolvedPyPyVersion = readExactPyPyVersionFile(installDir);

    const isPyPyVersionSatisfies = semver.satisfies(
      resolvedPyPyVersion,
      pypyVersion
    );
    if (!isPyPyVersionSatisfies) {
      installDir = null;
      resolvedPyPyVersion = '';
      resolvedPythonVersion = '';
    }
  }

  if (!installDir) {
    core.info(
      `PyPy version ${pythonVersion} (${pypyVersion}) was not found in the local cache`
    );
  }

  return {installDir, resolvedPythonVersion, resolvedPyPyVersion};
}

export function parsePyPyVersion(versionSpec: string): IPyPyVersionSpec {
  const versions = versionSpec.split('-').filter(item => !!item);

  if (/^(pypy)(.+)/.test(versions[0])) {
    const pythonVersion = versions[0].replace('pypy', '');
    versions.splice(0, 1, 'pypy', pythonVersion);
  }

  if (versions.length < 2 || versions[0] != 'pypy') {
    throw new Error(
      "Invalid 'version' property for PyPy. PyPy version should be specified as 'pypy<python-version>' or 'pypy-<python-version>'. See README for examples and documentation."
    );
  }

  const pythonVersion = versions[1];
  let pypyVersion: string;
  if (versions.length > 2) {
    pypyVersion = pypyInstall.pypyVersionToSemantic(versions[2]);
  } else {
    pypyVersion = 'x';
  }

  if (!validateVersion(pythonVersion) || !validateVersion(pypyVersion)) {
    throw new Error(
      "Invalid 'version' property for PyPy. Both Python version and PyPy versions should satisfy SemVer notation. See README for examples and documentation."
    );
  }

  if (!validatePythonVersionFormatForPyPy(pythonVersion)) {
    throw new Error(
      "Invalid format of Python version for PyPy. Python version should be specified in format 'x.y'. See README for examples and documentation."
    );
  }

  return {
    pypyVersion: pypyVersion,
    pythonVersion: pythonVersion
  };
}

export function findPyPyInstallDirForWindows(pythonVersion: string): string {
  let installDir = '';

  WINDOWS_ARCHS.forEach(
    architecture =>
      (installDir = installDir || tc.find('PyPy', pythonVersion, architecture))
  );

  return installDir;
}
