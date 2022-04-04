import * as path from 'path';
import * as pypyInstall from './install-pypy';
import {
  IS_WINDOWS,
  WINDOWS_ARCHS,
  validateVersion,
  getPyPyVersionFromPath,
  readExactPyPyVersionFile,
  validatePythonVersionFormatForPyPy
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
  architecture: string
): Promise<{resolvedPyPyVersion: string; resolvedPythonVersion: string}> {
  let resolvedPyPyVersion = '';
  let resolvedPythonVersion = '';
  let installDir: string | null;

  const pypyVersionSpec = parsePyPyVersion(versionSpec);

  ({installDir, resolvedPythonVersion, resolvedPyPyVersion} = findPyPyToolCache(
    pypyVersionSpec.pythonVersion,
    pypyVersionSpec.pypyVersion,
    architecture
  ));

  if (!installDir) {
    ({
      installDir,
      resolvedPythonVersion,
      resolvedPyPyVersion
    } = await pypyInstall.installPyPy(
      pypyVersionSpec.pypyVersion,
      pypyVersionSpec.pythonVersion,
      architecture
    ));
  }

  const pipDir = IS_WINDOWS ? 'Scripts' : 'bin';
  const _binDir = path.join(installDir, pipDir);
  const pythonLocation = pypyInstall.getPyPyBinaryPath(installDir);
  core.exportVariable('pythonLocation', pythonLocation);
  core.addPath(pythonLocation);
  core.addPath(_binDir);
  core.setOutput('python-version', 'pypy' + resolvedPyPyVersion.trim());

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

  if (versions.length < 2 || versions[0] != 'pypy') {
    throw new Error(
      "Invalid 'version' property for PyPy. PyPy version should be specified as 'pypy-<python-version>'. See README for examples and documentation."
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
