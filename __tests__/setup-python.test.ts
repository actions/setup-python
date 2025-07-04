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
    mockedCore.getBooleanInput.mockReturnValue(false);

    mockedGetCacheDistributor.mockReturnValue({restoreCache: mockRestoreCache});

    mockedFsPromises.mkdir.mockResolvedValue(undefined);
    mockedFsPromises.copyFile.mockResolvedValue(undefined);
  });

  it('copies the file if source exists and target does not', async () => {
    mockedFsPromises.access.mockImplementation(async filePath => {
      if (filePath === '/github/action/nested/deps.lock')
        return Promise.resolve(); // source
      throw new Error('target does not exist'); // target
    });

    await cacheDependencies('pip', '3.12');

    const sourcePath = '/github/action/nested/deps.lock';
    const targetPath = '/github/workspace/nested/deps.lock';

    expect(mockedFsPromises.copyFile).toHaveBeenCalledWith(
      sourcePath,
      targetPath
    );
    expect(mockedCore.info).toHaveBeenCalledWith(
      `Copied ${sourcePath} to ${targetPath}`
    );
  });

  it('overwrites file if target exists and overwrite is true', async () => {
    mockedCore.getBooleanInput.mockReturnValue(true);
    mockedFsPromises.access.mockResolvedValue(); // both source and target exist

    await cacheDependencies('pip', '3.12');

    const sourcePath = '/github/action/nested/deps.lock';
    const targetPath = '/github/workspace/nested/deps.lock';

    expect(mockedFsPromises.copyFile).toHaveBeenCalledWith(
      sourcePath,
      targetPath
    );
    expect(mockedCore.info).toHaveBeenCalledWith(
      `Overwrote ${sourcePath} to ${targetPath}`
    );
  });

  it('skips copy if file exists and overwrite is false', async () => {
    mockedCore.getBooleanInput.mockReturnValue(false);
    mockedFsPromises.access.mockResolvedValue(); // both source and target exist

    await cacheDependencies('pip', '3.12');

    expect(mockedFsPromises.copyFile).not.toHaveBeenCalled();
    expect(mockedCore.info).toHaveBeenCalledWith(
      expect.stringContaining('Skipped copying')
    );
  });

  it('logs warning if source file does not exist', async () => {
    mockedFsPromises.access.mockImplementation(async filePath => {
      if (filePath === '/github/action/nested/deps.lock') {
        throw new Error('source not found');
      }
      return Promise.resolve(); // fallback for others
    });

    await cacheDependencies('pip', '3.12');

    expect(mockedCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('does not exist')
    );
    expect(mockedFsPromises.copyFile).not.toHaveBeenCalled();
  });

  it('logs warning if copyFile fails', async () => {
    mockedFsPromises.access.mockImplementation(async filePath => {
      if (filePath === '/github/action/nested/deps.lock')
        return Promise.resolve();
      throw new Error('target does not exist');
    });

    mockedFsPromises.copyFile.mockRejectedValue(new Error('copy failed'));

    await cacheDependencies('pip', '3.12');

    expect(mockedCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to copy file')
    );
  });

  it('skips everything if cache-dependency-path is not provided', async () => {
    mockedCore.getInput.mockReturnValue('');

    await cacheDependencies('pip', '3.12');

    expect(mockedFsPromises.copyFile).not.toHaveBeenCalled();
    expect(mockedCore.warning).not.toHaveBeenCalled();
  });

  it('does not copy if source and target are the same path', async () => {
    mockedCore.getInput.mockReturnValue('deps.lock');
    process.env.GITHUB_ACTION_PATH = '/github/workspace';
    process.env.GITHUB_WORKSPACE = '/github/workspace';

    mockedFsPromises.access.mockResolvedValue();

    await cacheDependencies('pip', '3.12');

    const sourcePath = '/github/workspace/deps.lock';
    expect(mockedFsPromises.copyFile).not.toHaveBeenCalled();
    expect(mockedCore.info).toHaveBeenCalledWith(
      `Dependency file is already inside the workspace: ${sourcePath}`
    );
  });
});
