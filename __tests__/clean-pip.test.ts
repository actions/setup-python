import * as core from '@actions/core';
import * as exec from '@actions/exec';
import {cleanPipPackages} from '../src/clean-pip';

describe('cleanPipPackages', () => {
  let infoSpy: jest.SpyInstance;
  let setFailedSpy: jest.SpyInstance;
  let execSpy: jest.SpyInstance;

  beforeEach(() => {
    infoSpy = jest.spyOn(core, 'info');
    infoSpy.mockImplementation(() => undefined);

    setFailedSpy = jest.spyOn(core, 'setFailed');
    setFailedSpy.mockImplementation(() => undefined);

    execSpy = jest.spyOn(exec, 'exec');
    execSpy.mockImplementation(() => Promise.resolve(0));
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  it('should successfully clean up pip packages', async () => {
    await cleanPipPackages();

    expect(execSpy).toHaveBeenCalledWith('bash', expect.any(Array));
    expect(setFailedSpy).not.toHaveBeenCalled();
  });

  it('should handle errors and set failed status', async () => {
    const error = new Error('Exec failed');
    execSpy.mockImplementation(() => Promise.reject(error));

    await cleanPipPackages();

    expect(execSpy).toHaveBeenCalledWith('bash', expect.any(Array));
    expect(setFailedSpy).toHaveBeenCalledWith('Failed to clean up pip packages.');
  });
});
