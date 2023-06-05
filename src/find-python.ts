import * as os from 'os';
import * as path from 'path';
import {IS_WINDOWS, IS_LINUX, getOSInfo} from './utils';

import * as semver from 'semver';

import * as installer from './install-python';

import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';

// Python has "scripts" or "bin" directories where command-line tools that come with packages are installed.
// This is where pip is, along with anything that pip installs.
// There is a separate directory for `pip install --user`.
//
// For reference, these directories are as follows:
//   macOS / Linux:
//      <sys.prefix>/bin (by default /usr/local/bin, but not on hosted agents -- see the `else`)
//      (--user) ~/.local/bin
//   Windows:
//      <Python installation dir>\Scripts
//      (--user) %APPDATA%\Python\PythonXY\Scripts
// See https://docs.python.org/3/library/sysconfig.html

function binDir(installDir: string): string {
  if (IS_WINDOWS) {
    return path.join(installDir, 'Scripts');
  } else {
    return path.join(installDir, 'bin');
  }
}

export async function useCpythonVersion(
  version: string,
  architecture: string,
  updateEnvironment: boolean,
  checkLatest: boolean,
  allowPreReleases: boolean
): Promise<InstalledVersion> {
  let manifest: tc.IToolRelease[] | null = null;
  const desugaredVersionSpec = desugarDevVersion(version);
  let semanticVersionSpec = pythonVersionToSemantic(
    desugaredVersionSpec,
    allowPreReleases
  );
  core.debug(`Semantic version spec of ${version} is ${semanticVersionSpec}`);

  if (checkLatest) {
    manifest = await installer.getManifest();
    const resolvedVersion = (
      await installer.findReleaseFromManifest(
        semanticVersionSpec,
        architecture,
        manifest
      )
    )?.version;

    if (resolvedVersion) {
      semanticVersionSpec = resolvedVersion;
      core.info(`Resolved as '${semanticVersionSpec}'`);
    } else {
      core.info(
        `Failed to resolve version ${semanticVersionSpec} from manifest`
      );
    }
  }

  let installDir: string | null = tc.find(
    'Python',
    semanticVersionSpec,
    architecture
  );
  if (!installDir) {
    core.info(
      `Version ${semanticVersionSpec} was not found in the local cache`
    );
    const foundRelease = await installer.findReleaseFromManifest(
      semanticVersionSpec,
      architecture,
      manifest
    );

    if (foundRelease && foundRelease.files && foundRelease.files.length > 0) {
      core.info(`Version ${semanticVersionSpec} is available for downloading`);
      await installer.installCpythonFromRelease(foundRelease);

      installDir = tc.find('Python', semanticVersionSpec, architecture);
    }
  }

  if (!installDir) {
    const osInfo = await getOSInfo();
    throw new Error(
      [
        `The version '${version}' with architecture '${architecture}' was not found for ${
          osInfo
            ? `${osInfo.osName} ${osInfo.osVersion}`
            : 'this operating system'
        }.`,
        `The list of all available versions can be found here: ${installer.MANIFEST_URL}`
      ].join(os.EOL)
    );
  }

  const _binDir = binDir(installDir);
  const binaryExtension = IS_WINDOWS ? '.exe' : '';
  const pythonPath = path.join(
    IS_WINDOWS ? installDir : _binDir,
    `python${binaryExtension}`
  );
  if (updateEnvironment) {
    core.exportVariable('pythonLocation', installDir);
    core.exportVariable('PKG_CONFIG_PATH', installDir + '/lib/pkgconfig');
    core.exportVariable('pythonLocation', installDir);
    // https://cmake.org/cmake/help/latest/module/FindPython.html#module:FindPython
    core.exportVariable('Python_ROOT_DIR', installDir);
    // https://cmake.org/cmake/help/latest/module/FindPython2.html#module:FindPython2
    core.exportVariable('Python2_ROOT_DIR', installDir);
    // https://cmake.org/cmake/help/latest/module/FindPython3.html#module:FindPython3
    core.exportVariable('Python3_ROOT_DIR', installDir);
    core.exportVariable('PKG_CONFIG_PATH', installDir + '/lib/pkgconfig');

    if (IS_LINUX) {
      const libPath = process.env.LD_LIBRARY_PATH
        ? `:${process.env.LD_LIBRARY_PATH}`
        : '';
      const pyLibPath = path.join(installDir, 'lib');

      if (!libPath.split(':').includes(pyLibPath)) {
        core.exportVariable('LD_LIBRARY_PATH', pyLibPath + libPath);
      }
    }
    core.addPath(installDir);
    core.addPath(_binDir);

    if (IS_WINDOWS) {
      // Add --user directory
      // `installDir` from tool cache should look like $RUNNER_TOOL_CACHE/Python/<semantic version>/x64/
      // So if `findLocalTool` succeeded above, we must have a conformant `installDir`
      const version = path.basename(path.dirname(installDir));
      const major = semver.major(version);
      const minor = semver.minor(version);

      const userScriptsDir = path.join(
        process.env['APPDATA'] || '',
        'Python',
        `Python${major}${minor}`,
        'Scripts'
      );
      core.addPath(userScriptsDir);
    }
    // On Linux and macOS, pip will create the --user directory and add it to PATH as needed.
  }

  const installed = versionFromPath(installDir);
  core.setOutput('python-version', installed);
  core.setOutput('python-path', pythonPath);

  return {impl: 'CPython', version: installed};
}

/** Convert versions like `3.8-dev` to a version like `~3.8.0-0`. */
function desugarDevVersion(versionSpec: string) {
  const devVersion = /^(\d+)\.(\d+)-dev$/;
  return versionSpec.replace(devVersion, '~$1.$2.0-0');
}

/** Extracts python version from install path from hosted tool cache as described in README.md */
function versionFromPath(installDir: string) {
  const parts = installDir.split(path.sep);
  const idx = parts.findIndex(part => part === 'PyPy' || part === 'Python');

  return parts[idx + 1] || '';
}

interface InstalledVersion {
  impl: string;
  version: string;
}

/**
 * Python's prelease versions look like `3.7.0b2`.
 * This is the one part of Python versioning that does not look like semantic versioning, which specifies `3.7.0-b2`.
 * If the version spec contains prerelease versions, we need to convert them to the semantic version equivalent.
 *
 * For easier use of the action, we also map 'x.y' to allow pre-release before 'x.y.0' release if allowPreReleases is true
 */
export function pythonVersionToSemantic(
  versionSpec: string,
  allowPreReleases: boolean
) {
  const prereleaseVersion = /(\d+\.\d+\.\d+)((?:a|b|rc)\d*)/g;
  const majorMinor = /^(\d+)\.(\d+)$/;
  let result = versionSpec.replace(prereleaseVersion, '$1-$2');
  if (allowPreReleases) {
    result = result.replace(majorMinor, '~$1.$2.0-0');
  }
  return result;
}
