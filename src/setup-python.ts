import * as core from '@actions/core';
import * as finder from './find-python';
import * as finderPyPy from './find-pypy';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs';
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

function resolveVersionInput(): string {
  let version = core.getInput('python-version');
  const versionFileInput = core.getInput('python-version-file');

  if (versionFileInput) {
    const versionFilePath = path.join(
      process.env.GITHUB_WORKSPACE!,
      versionFileInput
    );
    if (!fs.existsSync(versionFilePath)) {
      throw new Error(
        `The specified node version file at: ${versionFilePath} does not exist`
      );
    }
    version = fs.readFileSync(versionFilePath, 'utf8');
    core.info(`Resolved ${versionFileInput} as ${version}`);
  }

  return version;
}

async function run() {
  try {
    const version = resolveVersionInput();
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
        const installed = await finder.findPythonVersion(version, arch);
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
