import * as core from '@actions/core';
import * as finder from './find-python';
import * as finderPyPy from './find-pypy';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs';
import {getCacheDistributor} from './cache-distributions/cache-factory';
import {isCacheFeatureAvailable} from './utils';

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
      'Both python-version and python-version-file inputs are specified, only python-version will be used.'
    );
  }

  if (version) {
    return version;
  }

  if (versionFile) {
    if (!fs.existsSync(versionFile)) {
      logWarning(
        `The specified python version file at: ${versionFile} does not exist. Attempting to find .python-version file.`
      );
      if (!fs.existsSync('.python-version')) {
        throw new Error(
          `The specified python version file at: ${versionFile} does not exist and default .python-version file isn't found.`
        );
      } else {
        versionFile = '.python-version';
      }
    }

    version = fs.readFileSync(versionFile, 'utf8');
    core.info(`Resolved ${versionFile} as ${version}`);

    return version;
  }

  logWarning(
    "Neither 'python-version' nor 'python-version-file' inputs were supplied."
  );

  return version;
}

async function run() {
  if (process.env.AGENT_TOOLSDIRECTORY?.trim()) {
    core.debug(
      `Python is expected to be installed into AGENT_TOOLSDIRECTORY=${process.env['AGENT_TOOLSDIRECTORY']}`
    );
    process.env['RUNNER_TOOL_CACHE'] = process.env['AGENT_TOOLSDIRECTORY'];
  } else {
    core.debug(
      `Python is expected to be installed into RUNNER_TOOL_CACHE==${process.env['RUNNER_TOOL_CACHE']}`
    );
  }
  try {
    const version = resolveVersionInput();
    if (version) {
      let pythonVersion: string;
      const arch: string = core.getInput('architecture') || os.arch();
      const updateEnvironment = core.getBooleanInput('update-environment');
      if (isPyPyVersion(version)) {
        const installed = await finderPyPy.findPyPyVersion(
          version,
          arch,
          updateEnvironment
        );
        pythonVersion = `${installed.resolvedPyPyVersion}-${installed.resolvedPythonVersion}`;
        core.info(
          `Successfully set up PyPy ${installed.resolvedPyPyVersion} with Python (${installed.resolvedPythonVersion})`
        );
      } else {
        const installed = await finder.useCpythonVersion(
          version,
          arch,
          updateEnvironment
        );
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

export function logWarning(message: string): void {
  const warningPrefix = '[warning]';
  core.info(`${warningPrefix}${message}`);
}

run();
