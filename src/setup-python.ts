import * as core from '@actions/core';
import * as finder from './find-python';
import * as finderPyPy from './find-pypy';
import * as path from 'path';
import * as os from 'os';
import {getCacheDistributor} from './cache-distributions/cache-factory';
import {isCacheFeatureAvailable} from './utils';

function isPyPyVersion(versionSpec: string) {
  return versionSpec.startsWith('pypy-');
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
        if (version.trim().startsWith('2')) {
          core.warning(
            'The support for python 2.7 will be removed on June 19. Related issue: https://github.com/actions/setup-python/issues/672'
          );
        }
        const installed = await finder.useCpythonVersion(version, arch);
        pythonVersion = installed.version;
        core.info(`Successfully setup ${installed.impl} (${pythonVersion})`);
      }

      const cache = core.getInput('cache');
      if (cache && isCacheFeatureAvailable()) {
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
