import * as core from '@actions/core';
import * as cache from '@actions/cache';
import * as exec from '@actions/exec';
import {getCacheDistributor} from '../src/cache-distributions/cache-factory';

describe('restore-cache', () => {
  const pipFileLockHash =
    'd1dd6218299d8a6db5fc2001d988b34a8b31f1e9d0bb4534d377dde7c19f64b3';
  const requirementsHash =
    'd8110e0006d7fb5ee76365d565eef9d37df1d11598b912d3eb66d398d57a1121';
  const requirementsLinuxHash =
    '2d0ff7f46b0e120e3d3294db65768b474934242637b9899b873e6283dfd16d7c';
  const poetryLockHash =
    '571bf984f8d210e6a97f854e479fdd4a2b5af67b5fdac109ec337a0ea16e7836';
  const poetryConfigOutput = `
cache-dir = "/Users/patrick/Library/Caches/pypoetry"
experimental.new-installer = false
installer.parallel = true
virtualenvs.create = true
virtualenvs.in-project = true
virtualenvs.path = "{cache-dir}/virtualenvs"  # /Users/patrick/Library/Caches/pypoetry/virtualenvs
  `;

  // core spy
  let infoSpy: jest.SpyInstance;
  let warningSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;
  let saveSatetSpy: jest.SpyInstance;
  let getStateSpy: jest.SpyInstance;
  let setOutputSpy: jest.SpyInstance;

  // cache spy
  let restoreCacheSpy: jest.SpyInstance;

  // exec spy
  let getExecOutputSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env['RUNNER_OS'] = process.env['RUNNER_OS'] ?? 'linux';

    infoSpy = jest.spyOn(core, 'info');
    infoSpy.mockImplementation(input => undefined);

    warningSpy = jest.spyOn(core, 'warning');
    warningSpy.mockImplementation(input => undefined);

    debugSpy = jest.spyOn(core, 'debug');
    debugSpy.mockImplementation(input => undefined);

    saveSatetSpy = jest.spyOn(core, 'saveState');
    saveSatetSpy.mockImplementation(input => undefined);

    getStateSpy = jest.spyOn(core, 'getState');
    getStateSpy.mockImplementation(input => undefined);

    getExecOutputSpy = jest.spyOn(exec, 'getExecOutput');
    getExecOutputSpy.mockImplementation((input: string) => {
      if (input.includes('pip')) {
        return {stdout: 'pip', stderr: '', exitCode: 0};
      }
      if (input.includes('poetry')) {
        return {stdout: poetryConfigOutput, stderr: '', exitCode: 0};
      }

      return {stdout: '', stderr: 'Error occured', exitCode: 2};
    });

    setOutputSpy = jest.spyOn(core, 'setOutput');
    setOutputSpy.mockImplementation(input => undefined);

    restoreCacheSpy = jest.spyOn(cache, 'restoreCache');
    restoreCacheSpy.mockImplementation(
      (cachePaths: string[], primaryKey: string, restoreKey?: string) => {
        return primaryKey;
      }
    );
  });

  describe('Validate provided package manager', () => {
    it.each(['npm', 'pip2', 'pip21', 'pip21.3', 'pipenv32'])(
      'Throw an error because %s is not supported',
      async packageManager => {
        expect(() =>
          getCacheDistributor(packageManager, '3.8.12', undefined)
        ).toThrowError(`Caching for '${packageManager}' is not supported`);
      }
    );
  });

  describe('Restore dependencies', () => {
    it.each([
      ['pip', '3.8.12', undefined, requirementsHash],
      ['pip', '3.8.12', '**/requirements-linux.txt', requirementsLinuxHash],
      [
        'pip',
        '3.8.12',
        '__tests__/data/requirements-linux.txt',
        requirementsLinuxHash
      ],
      ['pip', '3.8.12', '__tests__/data/requirements.txt', requirementsHash],
      ['pipenv', '3.9.1', undefined, pipFileLockHash],
      ['pipenv', '3.9.12', '__tests__/data/requirements.txt', requirementsHash],
      ['poetry', '3.9.1', undefined, poetryLockHash]
    ])(
      'restored dependencies for %s by primaryKey',
      async (packageManager, pythonVersion, dependencyFile, fileHash) => {
        const cacheDistributor = getCacheDistributor(
          packageManager,
          pythonVersion,
          dependencyFile
        );
        await cacheDistributor.restoreCache();

        expect(infoSpy).toHaveBeenCalledWith(
          `Cache restored from key: setup-python-${process.env['RUNNER_OS']}-python-${pythonVersion}-${packageManager}-${fileHash}`
        );
      },
      30000
    );

    it.each([
      ['pip', '3.8.12', 'requirements-linux.txt', 'requirements-linux.txt'],
      ['pip', '3.8.12', 'requirements.txt', 'requirements.txt'],
      ['pipenv', '3.9.12', 'requirements.txt', 'requirements.txt']
    ])(
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
        await expect(cacheDistributor.restoreCache()).rejects.toThrowError(
          `No file in ${process.cwd()} matched to [${cacheDependencyPath
            .split('\n')
            .join(',')}], make sure you have checked out the target repository`
        );
      }
    );
  });

  describe('Dependencies changed', () => {
    it.each([
      ['pip', '3.8.12', undefined, pipFileLockHash],
      ['pip', '3.8.12', '**/requirements-linux.txt', pipFileLockHash],
      [
        'pip',
        '3.8.12',
        '__tests__/data/requirements-linux.txt',
        pipFileLockHash
      ],
      ['pip', '3.8.12', '__tests__/data/requirements.txt', pipFileLockHash],
      ['pipenv', '3.9.1', undefined, requirementsHash],
      ['pipenv', '3.9.12', '__tests__/data/requirements.txt', requirementsHash],
      ['poetry', '3.9.1', undefined, requirementsHash]
    ])(
      'restored dependencies for %s by primaryKey',
      async (packageManager, pythonVersion, dependencyFile, fileHash) => {
        restoreCacheSpy.mockImplementation(
          (cachePaths: string[], primaryKey: string, restoreKey?: string) => {
            return primaryKey !== fileHash && restoreKey ? pipFileLockHash : '';
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
