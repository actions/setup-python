import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import {cacheDependencies} from '../src/setup-python';
import {getCacheDistributor} from '../src/cache-distributions/cache-factory';

jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    promises: {
      access: jest.fn(),
      mkdir: jest.fn(),
      copyFile: jest.fn(),
      writeFile: jest.fn(),
      appendFile: jest.fn()
    }
  };
});
jest.mock('@actions/core');
jest.mock('../src/cache-distributions/cache-factory');

const mockedFsPromises = fs.promises as jest.Mocked<typeof fs.promises>;
const mockedCore = core as jest.Mocked<typeof core>;
const mockedGetCacheDistributor = getCacheDistributor as jest.Mock;

describe('cacheDependencies', () => {
  const mockRestoreCache = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_ACTION_PATH = '/github/action';
    process.env.GITHUB_WORKSPACE = '/github/workspace';

    mockedCore.getInput.mockReturnValue('nested/deps.lock');

    // Simulate file exists by resolving access without error
    mockedFsPromises.access.mockImplementation(async p => {
      const pathStr = typeof p === 'string' ? p : p.toString();
      if (pathStr === '/github/action/nested/deps.lock') {
        return Promise.resolve();
      }
      // Simulate directory doesn't exist to test mkdir
      if (pathStr === path.dirname('/github/workspace/nested/deps.lock')) {
        return Promise.reject(new Error('no dir'));
      }
      return Promise.resolve();
    });

    // Simulate mkdir success
    mockedFsPromises.mkdir.mockResolvedValue(undefined);

    // Simulate copyFile success
    mockedFsPromises.copyFile.mockResolvedValue(undefined);

    mockedGetCacheDistributor.mockReturnValue({restoreCache: mockRestoreCache});
  });

  it('copies the dependency file and resolves the path with directory structure', async () => {
    await cacheDependencies('pip', '3.12');

    const sourcePath = path.resolve('/github/action', 'nested/deps.lock');
    const targetPath = path.resolve('/github/workspace', 'nested/deps.lock');

    expect(mockedFsPromises.access).toHaveBeenCalledWith(
      sourcePath,
      fs.constants.F_OK
    );
    expect(mockedFsPromises.mkdir).toHaveBeenCalledWith(
      path.dirname(targetPath),
      {
        recursive: true
      }
    );
    expect(mockedFsPromises.copyFile).toHaveBeenCalledWith(
      sourcePath,
      targetPath
    );
    expect(mockedCore.info).toHaveBeenCalledWith(
      `Copied ${sourcePath} to ${targetPath}`
    );
    expect(mockedCore.info).toHaveBeenCalledWith(
      `Resolved cache-dependency-path: nested/deps.lock`
    );
    expect(mockRestoreCache).toHaveBeenCalled();
  });

  it('warns if the dependency file does not exist', async () => {
    // Simulate file does not exist by rejecting access
    mockedFsPromises.access.mockRejectedValue(new Error('file not found'));

    await cacheDependencies('pip', '3.12');

    expect(mockedCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('does not exist')
    );
    expect(mockedFsPromises.copyFile).not.toHaveBeenCalled();
    expect(mockRestoreCache).toHaveBeenCalled();
  });

  it('warns if file copy fails', async () => {
    // Simulate copyFile failure
    mockedFsPromises.copyFile.mockRejectedValue(new Error('copy failed'));

    await cacheDependencies('pip', '3.12');

    expect(mockedCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to copy file')
    );
    expect(mockRestoreCache).toHaveBeenCalled();
  });

  it('skips path logic if no input is provided', async () => {
    mockedCore.getInput.mockReturnValue('');

    await cacheDependencies('pip', '3.12');

    expect(mockedFsPromises.copyFile).not.toHaveBeenCalled();
    expect(mockedCore.warning).not.toHaveBeenCalled();
    expect(mockRestoreCache).toHaveBeenCalled();
  });

  it('does not copy if dependency file is already inside the workspace but still sets resolved path', async () => {
    // Simulate cacheDependencyPath inside workspace
    mockedCore.getInput.mockReturnValue('deps.lock');

    // Override sourcePath and targetPath to be equal
    const actionPath = '/github/workspace'; // same path for action and workspace
    process.env.GITHUB_ACTION_PATH = actionPath;
    process.env.GITHUB_WORKSPACE = actionPath;

    // access resolves to simulate file exists
    mockedFsPromises.access.mockResolvedValue();

    await cacheDependencies('pip', '3.12');

    const sourcePath = path.resolve(actionPath, 'deps.lock');
    const targetPath = sourcePath; // same path

    expect(mockedFsPromises.copyFile).not.toHaveBeenCalled();
    expect(mockedCore.info).toHaveBeenCalledWith(
      `Dependency file is already inside the workspace: ${sourcePath}`
    );
    expect(mockedCore.info).toHaveBeenCalledWith(
      `Resolved cache-dependency-path: deps.lock`
    );
    expect(mockRestoreCache).toHaveBeenCalled();
  });
});
