import * as core from '@actions/core';
import * as finder from './find-python';
import * as finderPyPy from './find-pypy';
import * as path from 'path';
import * as os from 'os';
import {getCache} from './cache-distributions/cache-factory';

function isPyPyVersion(versionSpec: string) {
  return versionSpec.startsWith('pypy-');
}

async function run() {
  try {
    const version = core.getInput('python-version');
    if (version) {
      let pythonVersion: string;
      const arch: string = core.getInput('architecture') || os.arch();
      if (isPyPyVersion(version)) {
        const installed = await finderPyPy.findPyPyVersion(version, arch);
        pythonVersion = installed.resolvedPythonVersion;
        core.info(
          `Successfully setup PyPy ${installed.resolvedPyPyVersion} with Python (${installed.resolvedPythonVersion})`
        );
      } else {
        const installed = await finder.findPythonVersion(version, arch);
        pythonVersion = installed.version;
        core.info(
          `Successfully setup ${installed.impl} (${installed.version})`
        );
      }

      const cache = core.getInput('cache');
      if (cache) {
        const cacheDistributor = getCache(cache, pythonVersion);
        cacheDistributor.restoreCache();
      }
    }
    const matchersPath = path.join(__dirname, '..', '.github');
    core.info(`##[add-matcher]${path.join(matchersPath, 'python.json')}`);
  } catch (err) {
    core.setFailed((err as Error).message);
  }
}

run();
