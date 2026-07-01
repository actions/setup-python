import {jest, describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {fileURLToPath} from 'url';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mock @actions modules before importing anything that depends on them
jest.unstable_mockModule('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  notice: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
  getInput: jest.fn(),
  getBooleanInput: jest.fn(),
  getMultilineInput: jest.fn(),
  addPath: jest.fn(),
  exportVariable: jest.fn(),
  saveState: jest.fn(),
  getState: jest.fn(),
  setSecret: jest.fn(),
  isDebug: jest.fn(() => false),
  startGroup: jest.fn(),
  endGroup: jest.fn(),
  group: jest.fn((_name: string, fn: () => Promise<unknown>) => fn()),
  toPlatformPath: jest.fn((p: string) => p),
  toWin32Path: jest.fn((p: string) => p),
  toPosixPath: jest.fn((p: string) => p)
}));

jest.unstable_mockModule('@actions/cache', () => ({
  saveCache: jest.fn(),
  restoreCache: jest.fn(),
  isFeatureAvailable: jest.fn()
}));

jest.unstable_mockModule('@actions/exec', () => ({
  exec: jest.fn(),
  getExecOutput: jest.fn()
}));

jest.unstable_mockModule('@actions/io', () => ({
  which: jest.fn(),
  mkdirP: jest.fn(),
  rmRF: jest.fn(),
  mv: jest.fn(),
  cp: jest.fn()
}));

// Dynamic imports after mocking
const core = await import('@actions/core');
const cache = await import('@actions/cache');
const exec = await import('@actions/exec');
const io = await import('@actions/io');
const {getCacheDistributor} =
  await import('../src/cache-distributions/cache-factory.js');
const {State} = await import('../src/cache-distributions/cache-distributor.js');

describe('restore-cache', () => {
  const pipFileLockHash =
    'f8428d7cf00ea53a5c3702f0a9cb3cc467f76cd86a34723009350c4e4b32751a';
  const requirementsHash =
    'd8110e0006d7fb5ee76365d565eef9d37df1d11598b912d3eb66d398d57a1121';
  const requirementsLinuxHash =
    '2d0ff7f46b0e120e3d3294db65768b474934242637b9899b873e6283dfd16d7c';
  const poetryLockHash =
    'f24ea1ad73968e6c8d80c16a093ade72d9332c433aeef979a0dd943e6a99b2ab';
  const poetryConfigOutput = `
cache-dir = "/Users/patrick/Library/Caches/pypoetry"
experimental.new-installer = false
installer.parallel = true
virtualenvs.create = true
virtualenvs.in-project = true
virtualenvs.path = "{cache-dir}/virtualenvs"  # /Users/patrick/Library/Caches/pypoetry/virtualenvs
  `;

  let infoSpy: jest.Mock;
  let warningSpy: jest.Mock;
  let debugSpy: jest.Mock;
  let saveStateSpy: jest.Mock;
  let getStateSpy: jest.Mock;
  let setOutputSpy: jest.Mock;
  let restoreCacheSpy: jest.Mock;
  let getExecOutputSpy: jest.Mock;
  let whichSpy: jest.Mock;

  beforeEach(() => {
    process.env['RUNNER_OS'] = process.env['RUNNER_OS'] ?? 'linux';

    infoSpy = core.info as jest.Mock;
    infoSpy.mockImplementation(() => undefined);

    warningSpy = core.warning as jest.Mock;
    warningSpy.mockImplementation(() => undefined);

    debugSpy = core.debug as jest.Mock;
    debugSpy.mockImplementation(() => undefined);

    saveStateSpy = core.saveState as jest.Mock;
    saveStateSpy.mockImplementation(() => undefined);

    getStateSpy = core.getState as jest.Mock;
    getStateSpy.mockImplementation(() => undefined);

    getExecOutputSpy = exec.getExecOutput as jest.Mock;
    (
      getExecOutputSpy as jest.Mock<typeof exec.getExecOutput>
    ).mockImplementation(async (input: string) => {
      if (input.includes('pip')) {
        return {stdout: 'pip', stderr: '', exitCode: 0};
      }
      if (input.includes('poetry')) {
        return {stdout: poetryConfigOutput, stderr: '', exitCode: 0};
      }
      if (input.includes('lsb_release')) {
        return {stdout: 'Ubuntu\n20.04', stderr: '', exitCode: 0};
      }

      return {stdout: '', stderr: 'Error occured', exitCode: 2};
    });

    setOutputSpy = core.setOutput as jest.Mock;
    setOutputSpy.mockImplementation(() => undefined);

    restoreCacheSpy = cache.restoreCache as jest.Mock;
    (
      restoreCacheSpy as jest.Mock<typeof cache.restoreCache>
    ).mockImplementation(
      (cachePaths: string[], primaryKey: string, restoreKey?: string[]) => {
        return Promise.resolve(primaryKey);
      }
    );

    whichSpy = io.which as jest.Mock;
    whichSpy.mockImplementation(() => '/path/to/python');
  });

  describe('Validate provided package manager', () => {
    it.each(['npm', 'pip2', 'pip21', 'pip21.3', 'pipenv32'])(
      'Throw an error because %s is not supported',
      async packageManager => {
        expect(() =>
          getCacheDistributor(packageManager, '3.8.12', undefined)
        ).toThrow(`Caching for '${packageManager}' is not supported`);
      }
    );
  });

  describe('Restore dependencies', () => {
    it.each([
      [
        'pip',
        '3.8.12',
        '__tests__/data/**/requirements.txt',
        requirementsHash,
        undefined
      ],
      [
        'pip',
        '3.8.12',
        '__tests__/data/**/requirements-linux.txt',
        requirementsLinuxHash,
        undefined
      ],
      [
        'pip',
        '3.8.12',
        '__tests__/data/requirements-linux.txt',
        requirementsLinuxHash,
        undefined
      ],
      [
        'pip',
        '3.8.12',
        '__tests__/data/requirements.txt',
        requirementsHash,
        undefined
      ],
      [
        'pipenv',
        '3.9.1',
        '__tests__/data/**/Pipfile.lock',
        pipFileLockHash,
        undefined
      ],
      [
        'pipenv',
        '3.9.12',
        '__tests__/data/requirements.txt',
        requirementsHash,
        undefined
      ],
      [
        'poetry',
        '3.9.1',
        '__tests__/data/**/poetry.lock',
        poetryLockHash,
        [
          '/Users/patrick/Library/Caches/pypoetry/virtualenvs',
          path.join(__dirname, 'data', 'inner', '.venv'),
          path.join(__dirname, 'data', '.venv')
        ]
      ]
    ])(
      'restored dependencies for %s by primaryKey',
      async (
        packageManager,
        pythonVersion,
        dependencyFile,
        fileHash,
        cachePaths
      ) => {
        (
          restoreCacheSpy as jest.Mock<typeof cache.restoreCache>
        ).mockImplementation(
          (cachePaths: string[], primaryKey: string, restoreKey?: string[]) => {
            return Promise.resolve(
              primaryKey.includes(fileHash) ? primaryKey : ''
            );
          }
        );

        const cacheDistributor = getCacheDistributor(
          packageManager,
          pythonVersion,
          dependencyFile
        );

        await cacheDistributor.restoreCache();

        if (cachePaths !== undefined) {
          expect(saveStateSpy).toHaveBeenCalledWith(
            State.CACHE_PATHS,
            cachePaths
          );
        }

        const restoredKeys = await Promise.all(
          restoreCacheSpy.mock.results.map(result => result.value)
        );

        restoredKeys.forEach(restoredKey => {
          if (restoredKey) {
            const osSegment =
              process.platform === 'linux' ? '-20.04-Ubuntu' : '';
            const versionSuffix = packageManager === 'poetry' ? '-v2' : '';
            expect(infoSpy).toHaveBeenCalledWith(
              `Cache restored from key: setup-python-${process.env['RUNNER_OS']}-${process.arch}${osSegment}-python-${pythonVersion}-${packageManager}${versionSuffix}-${fileHash}`
            );
          } else {
            expect(infoSpy).toHaveBeenCalledWith(
              `${packageManager} cache is not found`
            );
          }
        });
      },
      30000
    );

    it.each([['pipenv', '3.9.12', 'requirements.txt', 'requirements.txt']])(
      'Should throw an error because dependency file is not found',
      async (
        packageManager,
        pythonVersion,
        dependencyFile,
        cacheDependencyPath
      ) => {
        const cacheDistributor = getCacheDistributor(
          packageManager,
          pythonVersion,
          dependencyFile
        );

        await expect(cacheDistributor.restoreCache()).rejects.toThrow(
          `No file in ${process.cwd()} matched to [${cacheDependencyPath
            .split('\n')
            .join(',')}], make sure you have checked out the target repository`
        );
      }
    );

    it.each([
      ['pip', '3.8.12', 'requirements-linux.txt'],
      ['pip', '3.8.12', 'requirements.txt']
    ])(
      'Shouldn`t throw an error as there is a default file `pyproject.toml` to use when requirements.txt is not specified',
      async (packageManager, pythonVersion, dependencyFile) => {
        const cacheDistributor = getCacheDistributor(
          packageManager,
          pythonVersion,
          dependencyFile
        );
        await expect(cacheDistributor.restoreCache()).resolves.not.toThrow();
      }
    );

    it.each([
      ['pip', '3.8.12', 'requirements-linux.txt'],
      ['pip', '3.8.12', 'requirements.txt']
    ])(
      'Should throw an error as there is no default file `pyproject.toml` to use when requirements.txt is not specified',
      async (packageManager, pythonVersion, dependencyFile) => {
        const cacheDistributor = getCacheDistributor(
          packageManager,
          pythonVersion,
          dependencyFile
        ) as any; // Widening PipCache | PipenvCache | PoetryCache type to any allow us to change private property on the cacheDistributor to test value: "**/pyprojecttest.toml"

        cacheDistributor.cacheDependencyBackupPath = '**/pyprojecttest.toml';

        await expect(cacheDistributor.restoreCache()).rejects.toThrow();
      }
    );
  });

  describe('Dependencies changed', () => {
    it.each([
      ['pip', '3.8.12', '__tests__/data/**/requirements.txt', pipFileLockHash],
      [
        'pip',
        '3.8.12',
        '__tests__/data/**/requirements-linux.txt',
        pipFileLockHash
      ],
      [
        'pip',
        '3.8.12',
        '__tests__/data/requirements-linux.txt',
        pipFileLockHash
      ],
      ['pip', '3.8.12', '__tests__/data/requirements.txt', pipFileLockHash],
      ['pipenv', '3.9.1', '__tests__/data/**/Pipfile.lock', requirementsHash],
      ['pipenv', '3.9.12', '__tests__/data/requirements.txt', requirementsHash],
      ['poetry', '3.9.1', '__tests__/data/**/poetry.lock', requirementsHash]
    ])(
      'restored dependencies for %s by primaryKey',
      async (packageManager, pythonVersion, dependencyFile, fileHash) => {
        (
          restoreCacheSpy as jest.Mock<typeof cache.restoreCache>
        ).mockImplementation(
          (cachePaths: string[], primaryKey: string, restoreKey?: string[]) => {
            return Promise.resolve(
              primaryKey !== fileHash && restoreKey ? pipFileLockHash : ''
            );
          }
        );
        const cacheDistributor = getCacheDistributor(
          packageManager,
          pythonVersion,
          dependencyFile
        );
        await cacheDistributor.restoreCache();
        let result = '';

        switch (packageManager) {
          case 'pip':
            result = `Cache restored from key: ${fileHash}`;
            break;
          case 'pipenv':
            result = 'pipenv cache is not found';
            break;
          case 'poetry':
            result = 'poetry cache is not found';
            break;
        }

        expect(infoSpy).toHaveBeenCalledWith(result);
      }
    );
  });

  describe('Check if handleMatchResult', () => {
    it.each([
      ['pip', '3.8.12', 'requirements.txt', 'someKey', 'someKey', true],
      ['pipenv', '3.9.1', 'requirements.txt', 'someKey', 'someKey', true],
      ['poetry', '3.8.12', 'requirements.txt', 'someKey', 'someKey', true],
      ['pip', '3.9.2', 'requirements.txt', undefined, 'someKey', false],
      ['pipenv', '3.8.12', 'requirements.txt', undefined, 'someKey', false],
      ['poetry', '3.9.12', 'requirements.txt', undefined, 'someKey', false]
    ])(
      'sets correct outputs',
      async (
        packageManager,
        pythonVersion,
        dependencyFile,
        matchedKey,
        restoredKey,
        expectedOutputValue
      ) => {
        const cacheDistributor = getCacheDistributor(
          packageManager,
          pythonVersion,
          dependencyFile
        );
        cacheDistributor.handleMatchResult(matchedKey, restoredKey);
        expect(setOutputSpy).toHaveBeenCalledWith(
          'cache-hit',
          expectedOutputValue
        );
      }
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });
});
