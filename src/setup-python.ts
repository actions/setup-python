import * as core from '@actions/core';
import * as finder from './find-python';
import * as finderPyPy from './find-pypy';
import * as path from 'path';
import * as os from 'os';
import {getCacheDistributor} from './cache-distributions/cache-factory';
import {isGhes} from './utils';

function isPyPyVersion(versionSpec: string) {
  return versionSpec.startsWith('pypy-');
}

async function cacheDependencies(cache: string, pythonVersion: string) {
  if (isGhes()) {
    throw new Error('Caching is not supported on GHES');
  }
  const cacheDependencyPath =
    core.getInput('cache-dependency-path') || undefined;
  const cacheDistributor = getCacheDistributor(
    cache,
    pythonVersion,
    cacheDependencyPath
  );
  await cacheDistributor.restoreCache();
}

async function run() {
  try {
    const version = core.getInput('python-version');
    if (version) {
      let pythonVersion: string;
      const arch: string = core.getInput('architecture') || os.arch();
      if (isPyPyVersion(version)) {
        const installed = await finderPyPy.findPyPyVersion(version, arch);
        pythonVersion = `${installed.resolvedPyPyVersion}-${installed.resolvedPythonVersion}`;
        core.info(
          `Successfully setup PyPy ${installed.resolvedPyPyVersion} with Python (${installed.resolvedPythonVersion})`
        );
      } else {
        const installed = await finder.useCpythonVersion(version, arch);
        pythonVersion = installed.version;
        core.info(`Successfully setup ${installed.impl} (${pythonVersion})`);
      }

      const cache = core.getInput('cache');
      if (cache) {
        await cacheDependencies(cache, pythonVersion);
      }
    }
    const matchersPath = path.join(__dirname, '../..', '.github');
    core.info(`##[add-matcher]${path.join(matchersPath, 'python.json')}`);
  } catch (err) {
    core.setFailed((err as Error).message);
  }
}

run();
