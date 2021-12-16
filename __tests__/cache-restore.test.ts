import * as core from '@actions/core';
import * as cache from '@actions/cache';
import * as exec from '@actions/exec';
import {getCacheDistributor} from '../src/cache-distributions/cache-factory';

describe('restore-cache', () => {
  const pipFileLockHash =
    '67d817abcde9c72da0ed5b8f235647cb14638b9ff9d742b42e4406d2eb16fe3c';
  const requirementsHash =
    'd8110e0006d7fb5ee76365d565eef9d37df1d11598b912d3eb66d398d57a1121';
  const requirementsLinuxHash =
    '2d0ff7f46b0e120e3d3294db65768b474934242637b9899b873e6283dfd16d7c';

  // core spy
  let infoSpy: jest.SpyInstance;
  let warningSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;
  let saveSatetSpy: jest.SpyInstance;
  let getStateSpy: jest.SpyInstance;

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

      return {stdout: '', stderr: 'Error occured', exitCode: 2};
    });

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
      ['pipenv', '3.9.12', '__tests__/data/requirements.txt', requirementsHash]
    ])(
      'restored dependencies for %s by primaryKey',
      async (packageManager, pythonVersion, dependencyFile, fileHash) => {
        const cacheDistributor = await getCacheDistributor(
          packageManager,
          pythonVersion,
          dependencyFile
        );
        await cacheDistributor.restoreCache();

        expect(infoSpy).toHaveBeenCalledWith(
          `Cache restored from key: setup-python-${process.env['RUNNER_OS']}-python-${pythonVersion}-${packageManager}-${fileHash}`
        );
      }
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
        const cacheDistributor = await getCacheDistributor(
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
      ['pipenv', '3.9.12', '__tests__/data/requirements.txt', requirementsHash]
    ])(
      'restored dependencies for %s by primaryKey',
      async (packageManager, pythonVersion, dependencyFile, fileHash) => {
        restoreCacheSpy.mockImplementation(
          (cachePaths: string[], primaryKey: string, restoreKey?: string) => {
            return primaryKey !== fileHash && restoreKey ? pipFileLockHash : '';
          }
        );
        const cacheDistributor = await getCacheDistributor(
          packageManager,
          pythonVersion,
          dependencyFile
        );
        await cacheDistributor.restoreCache();
        let result = '';
        if (packageManager !== 'pipenv') {
          result = `Cache restored from key: ${fileHash}`;
        } else {
          result = 'pipenv cache is not found';
        }

        expect(infoSpy).toHaveBeenCalledWith(result);
      }
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });
});
