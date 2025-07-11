import * as core from '@actions/core';
import * as finder from './find-python';
import * as finderPyPy from './find-pypy';
import * as finderGraalPy from './find-graalpy';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs';
import {getCacheDistributor} from './cache-distributions/cache-factory';
import {
  isCacheFeatureAvailable,
  logWarning,
  IS_MAC,
  getVersionInputFromFile,
  getVersionsInputFromPlainFile
} from './utils';

function isPyPyVersion(versionSpec: string) {
  return versionSpec.startsWith('pypy');
}

function isGraalPyVersion(versionSpec: string) {
  return versionSpec.startsWith('graalpy');
}
export async function cacheDependencies(cache: string, pythonVersion: string) {
  const cacheDependencyPath =
    core.getInput('cache-dependency-path') || undefined;
  let resolvedDependencyPath: string | undefined = undefined;
  const overwrite =
    core.getBooleanInput('overwrite', {required: false}) ?? false;

  if (cacheDependencyPath) {
    const actionPath = process.env.GITHUB_ACTION_PATH || '';
    const workspace = process.env.GITHUB_WORKSPACE || process.cwd();

    const sourcePath = path.resolve(actionPath, cacheDependencyPath);
    const relativePath = path.relative(actionPath, sourcePath);
    const targetPath = path.resolve(workspace, relativePath);

    try {
      const sourceExists = await fs.promises
        .access(sourcePath, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false);

      if (!sourceExists) {
        core.warning(
          `The resolved cache-dependency-path does not exist: ${sourcePath}`
        );
      } else {
        if (sourcePath !== targetPath) {
          const targetDir = path.dirname(targetPath);
          await fs.promises.mkdir(targetDir, {recursive: true});

          const targetExists = await fs.promises
            .access(targetPath, fs.constants.F_OK)
            .then(() => true)
            .catch(() => false);

          if (targetExists && !overwrite) {
            const filename = path.basename(cacheDependencyPath);
            core.warning(
              `A file named '${filename}' exists in both the composite action and the workspace. The file in the workspace will be used. To avoid ambiguity, consider renaming one of the files or setting 'overwrite: true'.`
            );
            core.info(
              `Skipped copying ${sourcePath} — target already exists at ${targetPath}`
            );
          } else {
            await fs.promises.copyFile(sourcePath, targetPath);
            core.info(
              `${targetExists ? 'Overwrote' : 'Copied'} ${sourcePath} to ${targetPath}`
            );
          }
        } else {
          core.info(
            `Dependency file is already inside the workspace: ${sourcePath}`
          );
        }

        resolvedDependencyPath = path
          .relative(workspace, targetPath)
          .replace(/\\/g, '/');
        core.info(`Resolved cache-dependency-path: ${resolvedDependencyPath}`);
      }
    } catch (error) {
      core.warning(
        `Failed to copy file from ${sourcePath} to ${targetPath}: ${error}`
      );
    }
  }

  // Pass resolvedDependencyPath if available, else fallback to original input
  const dependencyPathForCache = resolvedDependencyPath ?? cacheDependencyPath;

  const cacheDistributor = getCacheDistributor(
    cache,
    pythonVersion,
    dependencyPathForCache
  );
  await cacheDistributor.restoreCache();
}
function resolveVersionInputFromDefaultFile(): string[] {
  const couples: [string, (versionFile: string) => string[]][] = [
    ['.python-version', getVersionsInputFromPlainFile]
  ];
  for (const [versionFile, _fn] of couples) {
    logWarning(
      `Neither 'python-version' nor 'python-version-file' inputs were supplied. Attempting to find '${versionFile}' file.`
    );
    if (fs.existsSync(versionFile)) {
      return _fn(versionFile);
    } else {
      logWarning(`${versionFile} doesn't exist.`);
    }
  }
  return [];
}

function resolveVersionInput() {
  let versions = core.getMultilineInput('python-version');
  const versionFile = core.getInput('python-version-file');

  if (versions.length) {
    if (versionFile) {
      core.warning(
        'Both python-version and python-version-file inputs are specified, only python-version will be used.'
      );
    }
  } else {
    if (versionFile) {
      if (!fs.existsSync(versionFile)) {
        throw new Error(
          `The specified python version file at: ${versionFile} doesn't exist.`
        );
      }
      versions = getVersionInputFromFile(versionFile);
    } else {
      versions = resolveVersionInputFromDefaultFile();
    }
  }

  return versions;
}

async function run() {
  if (IS_MAC) {
    process.env['AGENT_TOOLSDIRECTORY'] = '/Users/runner/hostedtoolcache';
  }

  if (process.env.AGENT_TOOLSDIRECTORY?.trim()) {
    process.env['RUNNER_TOOL_CACHE'] = process.env['AGENT_TOOLSDIRECTORY'];
  }

  core.debug(
    `Python is expected to be installed into ${process.env['RUNNER_TOOL_CACHE']}`
  );
  try {
    const versions = resolveVersionInput();
    const checkLatest = core.getBooleanInput('check-latest');
    const allowPreReleases = core.getBooleanInput('allow-prereleases');
    const freethreaded = core.getBooleanInput('freethreaded');

    if (versions.length) {
      let pythonVersion = '';
      const arch: string = core.getInput('architecture') || os.arch();
      const updateEnvironment = core.getBooleanInput('update-environment');
      core.startGroup('Installed versions');
      for (const version of versions) {
        if (isPyPyVersion(version)) {
          const installed = await finderPyPy.findPyPyVersion(
            version,
            arch,
            updateEnvironment,
            checkLatest,
            allowPreReleases
          );
          pythonVersion = `${installed.resolvedPyPyVersion}-${installed.resolvedPythonVersion}`;
          core.info(
            `Successfully set up PyPy ${installed.resolvedPyPyVersion} with Python (${installed.resolvedPythonVersion})`
          );
        } else if (isGraalPyVersion(version)) {
          const installed = await finderGraalPy.findGraalPyVersion(
            version,
            arch,
            updateEnvironment,
            checkLatest,
            allowPreReleases
          );
          pythonVersion = `${installed}`;
          core.info(`Successfully set up GraalPy ${installed}`);
        } else {
          if (version.startsWith('2')) {
            core.warning(
              'The support for python 2.7 was removed on June 19, 2023. Related issue: https://github.com/actions/setup-python/issues/672'
            );
          }
          const installed = await finder.useCpythonVersion(
            version,
            arch,
            updateEnvironment,
            checkLatest,
            allowPreReleases,
            freethreaded
          );
          pythonVersion = installed.version;
          core.info(`Successfully set up ${installed.impl} (${pythonVersion})`);
        }
      }
      core.endGroup();
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
