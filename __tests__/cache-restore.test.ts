import * as path from 'path';
import * as core from '@actions/core';
import * as cache from '@actions/cache';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import {getCacheDistributor} from '../src/cache-distributions/cache-factory';
import {State} from '../src/cache-distributions/cache-distributor';

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

  // core spy
  let infoSpy: jest.SpyInstance;
  let warningSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;
  let saveStateSpy: jest.SpyInstance;
  let getStateSpy: jest.SpyInstance;
  let setOutputSpy: jest.SpyInstance;

  // cache spy
  let restoreCacheSpy: jest.SpyInstance;

  // exec spy
  let getExecOutputSpy: jest.SpyInstance;

  // io spy
  let whichSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env['RUNNER_OS'] = process.env['RUNNER_OS'] ?? 'linux';

    infoSpy = jest.spyOn(core, 'info');
    infoSpy.mockImplementation(input => undefined);

    warningSpy = jest.spyOn(core, 'warning');
    warningSpy.mockImplementation(input => undefined);

    debugSpy = jest.spyOn(core, 'debug');
    debugSpy.mockImplementation(input => undefined);

    saveStateSpy = jest.spyOn(core, 'saveState');
    saveStateSpy.mockImplementation(input => undefined);

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
      if (input.includes('lsb_release')) {
        return {stdout: 'Ubuntu\n20.04', stderr: '', exitCode: 0};
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

    whichSpy = jest.spyOn(io, 'which');
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
        restoreCacheSpy.mockImplementation(
          (cachePaths: string[], primaryKey: string, restoreKey?: string) => {
            return primaryKey.includes(fileHash) ? primaryKey : '';
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

        if (process.platform === 'linux' && packageManager === 'pip') {
          expect(infoSpy).toHaveBeenCalledWith(
            `Cache restored from key: setup-python-${process.env['RUNNER_OS']}-20.04-Ubuntu-python-${pythonVersion}-${packageManager}-${fileHash}`
          );
        } else if (packageManager === 'poetry') {
          expect(infoSpy).toHaveBeenCalledWith(
            `Cache restored from key: setup-python-${process.env['RUNNER_OS']}-python-${pythonVersion}-${packageManager}-v2-${fileHash}`
          );
        } else {
          expect(infoSpy).toHaveBeenCalledWith(
            `Cache restored from key: setup-python-${process.env['RUNNER_OS']}-python-${pythonVersion}-${packageManager}-${fileHash}`
          );
        }
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
