import * as os from 'os';
import * as path from 'path';
import {IS_WINDOWS, IS_LINUX} from './utils';

import * as semver from 'semver';

import * as installer from './install-python';

import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';

// Python has "scripts" or "bin" directories where command-line tools that come with packages are installed.
// This is where pip is, along with anything that pip installs.
// There is a seperate directory for `pip install --user`.
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
  architecture: string
): Promise<InstalledVersion> {
  const desugaredVersionSpec = desugarDevVersion(version);
  const semanticVersionSpec = pythonVersionToSemantic(desugaredVersionSpec);
  core.debug(`Semantic version spec of ${version} is ${semanticVersionSpec}`);

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
      architecture
    );

    if (foundRelease && foundRelease.files && foundRelease.files.length > 0) {
      core.info(`Version ${semanticVersionSpec} is available for downloading`);
      await installer.installCpythonFromRelease(foundRelease);

      installDir = tc.find('Python', semanticVersionSpec, architecture);
    }
  }

  if (!installDir) {
    throw new Error(
      [
        `Version ${version} with arch ${architecture} not found`,
        `The list of all available versions can be found here: ${installer.MANIFEST_URL}`
      ].join(os.EOL)
    );
  }

  core.exportVariable('pythonLocation', installDir);

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
  core.addPath(binDir(installDir));

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

  const installed = versionFromPath(installDir);
  core.setOutput('python-version', installed);

  return {impl: 'CPython', version: installed};
}

/** Convert versions like `3.8-dev` to a version like `>= 3.8.0-a0`. */
function desugarDevVersion(versionSpec: string) {
  if (versionSpec.endsWith('-dev')) {
    const versionRoot = versionSpec.slice(0, -'-dev'.length);
    return `>= ${versionRoot}.0-a0`;
  } else {
    return versionSpec;
  }
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
 */
export function pythonVersionToSemantic(versionSpec: string) {
  const prereleaseVersion = /(\d+\.\d+\.\d+)((?:a|b|rc)\d*)/g;
  return versionSpec.replace(prereleaseVersion, '$1-$2');
}
