import * as core from '@actions/core';
import * as cache from '@actions/cache';
import * as exec from '@actions/exec';
import {run} from '../src/cache-save';
import {State} from '../src/cache-distributions/cache-distributor';

describe('run', () => {
  const pipFileLockHash =
    'd1dd6218299d8a6db5fc2001d988b34a8b31f1e9d0bb4534d377dde7c19f64b3';
  const requirementsHash =
    'd8110e0006d7fb5ee76365d565eef9d37df1d11598b912d3eb66d398d57a1121';
  const requirementsLinuxHash =
    '2d0ff7f46b0e120e3d3294db65768b474934242637b9899b873e6283dfd16d7c';
  const poetryLockHash =
    '571bf984f8d210e6a97f854e479fdd4a2b5af67b5fdac109ec337a0ea16e7836';

  // core spy
  let infoSpy: jest.SpyInstance;
  let warningSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;
  let saveSatetSpy: jest.SpyInstance;
  let getStateSpy: jest.SpyInstance;
  let getInputSpy: jest.SpyInstance;
  let setFailedSpy: jest.SpyInstance;

  // cache spy
  let saveCacheSpy: jest.SpyInstance;

  // exec spy
  let getExecOutputSpy: jest.SpyInstance;

  let inputs = {} as any;

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
    getStateSpy.mockImplementation(input => {
      if (input === State.CACHE_PATHS) {
        return JSON.stringify([__dirname]);
      }
      return requirementsHash;
    });

    setFailedSpy = jest.spyOn(core, 'setFailed');

    getInputSpy = jest.spyOn(core, 'getInput');
    getInputSpy.mockImplementation(input => inputs[input]);

    getExecOutputSpy = jest.spyOn(exec, 'getExecOutput');
    getExecOutputSpy.mockImplementation((input: string) => {
      if (input.includes('pip')) {
        return {stdout: 'pip', stderr: '', exitCode: 0};
      }

      return {stdout: '', stderr: 'Error occured', exitCode: 2};
    });

    saveCacheSpy = jest.spyOn(cache, 'saveCache');
    saveCacheSpy.mockImplementation(() => undefined);
  });

  describe('Package manager validation', () => {
    it('Package manager is not provided, skip caching', async () => {
      inputs['cache'] = '';
      await run();

      expect(getInputSpy).toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(saveCacheSpy).not.toHaveBeenCalled();
      expect(setFailedSpy).not.toHaveBeenCalled();
    });
  });

  describe('Validate unchanged cache is not saved', () => {
    it('should not save cache for pip', async () => {
      inputs['cache'] = 'pip';

      await run();

      expect(getInputSpy).toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalledWith(
        `paths for caching are ${__dirname}`
      );
      expect(getStateSpy).toHaveBeenCalledTimes(3);
      expect(infoSpy).toHaveBeenCalledWith(
        `Cache hit occurred on the primary key ${requirementsHash}, not saving cache.`
      );
      expect(setFailedSpy).not.toHaveBeenCalled();
    });

    it('should not save cache for pipenv', async () => {
      inputs['cache'] = 'pipenv';

      await run();

      expect(getInputSpy).toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalledWith(
        `paths for caching are ${__dirname}`
      );
      expect(getStateSpy).toHaveBeenCalledTimes(3);
      expect(infoSpy).toHaveBeenCalledWith(
        `Cache hit occurred on the primary key ${requirementsHash}, not saving cache.`
      );
      expect(setFailedSpy).not.toHaveBeenCalled();
    });

    it('should not save cache for pipenv', async () => {
      inputs['cache'] = 'pipenv';

      await run();

      expect(getInputSpy).toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalledWith(
        `paths for caching are ${__dirname}`
      );
      expect(getStateSpy).toHaveBeenCalledTimes(3);
      expect(infoSpy).toHaveBeenCalledWith(
        `Cache hit occurred on the primary key ${requirementsHash}, not saving cache.`
      );
      expect(setFailedSpy).not.toHaveBeenCalled();
    });
  });

  describe('action saves the cache', () => {
    it('saves cache from pip', async () => {
      inputs['cache'] = 'pip';
      getStateSpy.mockImplementation((name: string) => {
        if (name === State.CACHE_MATCHED_KEY) {
          return requirementsHash;
        } else if (name === State.CACHE_PATHS) {
          return JSON.stringify([__dirname]);
        } else {
          return pipFileLockHash;
        }
      });

      await run();

      expect(getInputSpy).toHaveBeenCalled();
      expect(getStateSpy).toHaveBeenCalledTimes(3);
      expect(infoSpy).not.toHaveBeenCalledWith(
        `Cache hit occurred on the primary key ${requirementsHash}, not saving cache.`
      );
      expect(saveCacheSpy).toHaveBeenCalled();
      expect(infoSpy).toHaveBeenLastCalledWith(
        `Cache saved with the key: ${pipFileLockHash}`
      );
      expect(setFailedSpy).not.toHaveBeenCalled();
    });

    it('saves cache from pipenv', async () => {
      inputs['cache'] = 'pipenv';
      getStateSpy.mockImplementation((name: string) => {
        if (name === State.CACHE_MATCHED_KEY) {
          return pipFileLockHash;
        } else if (name === State.CACHE_PATHS) {
          return JSON.stringify([__dirname]);
        } else {
          return requirementsHash;
        }
      });

      await run();

      expect(getInputSpy).toHaveBeenCalled();
      expect(getStateSpy).toHaveBeenCalledTimes(3);
      expect(infoSpy).not.toHaveBeenCalledWith(
        `Cache hit occurred on the primary key ${pipFileLockHash}, not saving cache.`
      );
      expect(saveCacheSpy).toHaveBeenCalled();
      expect(infoSpy).toHaveBeenLastCalledWith(
        `Cache saved with the key: ${requirementsHash}`
      );
      expect(setFailedSpy).not.toHaveBeenCalled();
    });

    it('saves cache from poetry', async () => {
      inputs['cache'] = 'poetry';
      getStateSpy.mockImplementation((name: string) => {
        if (name === State.CACHE_MATCHED_KEY) {
          return poetryLockHash;
        } else if (name === State.CACHE_PATHS) {
          return JSON.stringify([__dirname]);
        } else {
          return requirementsHash;
        }
      });

      await run();

      expect(getInputSpy).toHaveBeenCalled();
      expect(getStateSpy).toHaveBeenCalledTimes(3);
      expect(infoSpy).not.toHaveBeenCalledWith(
        `Cache hit occurred on the primary key ${poetryLockHash}, not saving cache.`
      );
      expect(saveCacheSpy).toHaveBeenCalled();
      expect(infoSpy).toHaveBeenLastCalledWith(
        `Cache saved with the key: ${requirementsHash}`
      );
      expect(setFailedSpy).not.toHaveBeenCalled();
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    inputs = {};
  });
});
