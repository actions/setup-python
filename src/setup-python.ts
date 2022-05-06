import * as core from '@actions/core';
import * as finder from './find-python';
import * as finderPyPy from './find-pypy';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs';
import {getCacheDistributor} from './cache-distributions/cache-factory';
import {isCacheFeatureAvailable, IS_LINUX, IS_WINDOWS} from './utils';

function isPyPyVersion(versionSpec: string) {
  return versionSpec.startsWith('pypy');
}

async function cacheDependencies(cache: string, pythonVersion: string) {
  const cacheDependencyPath =
    core.getInput('cache-dependency-path') || undefined;
  const cacheDistributor = getCacheDistributor(
    cache,
    pythonVersion,
    cacheDependencyPath
  );
  await cacheDistributor.restoreCache();
}

function resolveVersionInput(): string {
  let version = core.getInput('python-version');
  let versionFile = core.getInput('python-version-file');

  if (version && versionFile) {
    core.warning(
      'Both python-version and python-version-file inputs are specified, only python-version will be used'
    );
  }

  if (version) {
    return version;
  }

  versionFile = versionFile || '.python-version';
  if (!fs.existsSync(versionFile)) {
    throw new Error(
      `The specified python version file at: ${versionFile} does not exist`
    );
  }
  version = fs.readFileSync(versionFile, 'utf8');
  core.info(`Resolved ${versionFile} as ${version}`);

  return version;
}

async function run() {
  // According to the README windows binaries do not require to be installed
  // in the specific location, but Mac and Linux do
  if (!IS_WINDOWS && !process.env.AGENT_TOOLSDIRECTORY?.trim()) {
    if (IS_LINUX) process.env['AGENT_TOOLSDIRECTORY'] = '/opt/hostedtoolcache';
    else process.env['AGENT_TOOLSDIRECTORY'] = '/Users/runner/hostedtoolcache';
    process.env['RUNNER_TOOL_CACHE'] = process.env['AGENT_TOOLSDIRECTORY'];
  }
  core.debug(
    `Python is expected to be installed into RUNNER_TOOL_CACHE=${process.env['RUNNER_TOOL_CACHE']}`
  );
  try {
    const version = resolveVersionInput();
    if (version) {
      let pythonVersion: string;
      const arch: string = core.getInput('architecture') || os.arch();
      if (isPyPyVersion(version)) {
        const installed = await finderPyPy.findPyPyVersion(version, arch);
        pythonVersion = `${installed.resolvedPyPyVersion}-${installed.resolvedPythonVersion}`;
        core.info(
          `Successfully set up PyPy ${installed.resolvedPyPyVersion} with Python (${installed.resolvedPythonVersion})`
        );
      } else {
        const installed = await finder.useCpythonVersion(version, arch);
        pythonVersion = installed.version;
        core.info(`Successfully set up ${installed.impl} (${pythonVersion})`);
      }

      const cache = core.getInput('cache');
      if (cache && isCacheFeatureAvailable()) {
        await cacheDependencies(cache, pythonVersion);
      }
    } else {
      core.warning(
        'The `python-version` input is not set.  The version of Python currently in `PATH` will be used.'
      );
    }
    const matchersPath = path.join(__dirname, '../..', '.github');
    core.info(`##[add-matcher]${path.join(matchersPath, 'python.json')}`);
  } catch (err) {
    core.setFailed((err as Error).message);
  }
}

run();
