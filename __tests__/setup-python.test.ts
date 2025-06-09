import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import {cacheDependencies} from '../src/setup-python';
import {getCacheDistributor} from '../src/cache-distributions/cache-factory';

jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    copyFileSync: jest.fn(),
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    promises: {
      access: jest.fn(),
      writeFile: jest.fn(),
      appendFile: jest.fn()
    }
  };
});
jest.mock('@actions/core');
jest.mock('../src/cache-distributions/cache-factory');

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedCore = core as jest.Mocked<typeof core>;
const mockedGetCacheDistributor = getCacheDistributor as jest.Mock;

describe('cacheDependencies', () => {
  const mockRestoreCache = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_ACTION_PATH = '/github/action';
    process.env.GITHUB_WORKSPACE = '/github/workspace';

    mockedCore.getInput.mockReturnValue('nested/deps.lock');

    mockedFs.existsSync.mockImplementation((p: any) => {
      const pathStr = typeof p === 'string' ? p : p.toString();
      if (pathStr === '/github/action/nested/deps.lock') return true;
      if (pathStr === '/github/workspace/nested') return false; // Simulate missing dir
      return true;
    });

    mockedFs.copyFileSync.mockImplementation(() => undefined);
    mockedFs.mkdirSync.mockImplementation(() => undefined);
    mockedGetCacheDistributor.mockReturnValue({restoreCache: mockRestoreCache});
  });

  it('copies the dependency file and resolves the path with directory structure', async () => {
    await cacheDependencies('pip', '3.12');

    const sourcePath = path.resolve('/github/action', 'nested/deps.lock');
    const targetPath = path.resolve('/github/workspace', 'nested/deps.lock');

    expect(mockedFs.existsSync).toHaveBeenCalledWith(sourcePath);
    expect(mockedFs.mkdirSync).toHaveBeenCalledWith(path.dirname(targetPath), {
      recursive: true
    });
    expect(mockedFs.copyFileSync).toHaveBeenCalledWith(sourcePath, targetPath);
    expect(mockedCore.info).toHaveBeenCalledWith(
      `Copied ${sourcePath} to ${targetPath}`
    );
    expect(mockedCore.info).toHaveBeenCalledWith(
      `Resolved cache-dependency-path: nested/deps.lock`
    );
    expect(mockRestoreCache).toHaveBeenCalled();
  });

  it('warns if the dependency file does not exist', async () => {
    mockedFs.existsSync.mockReturnValue(false);

    await cacheDependencies('pip', '3.12');

    expect(mockedCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('does not exist')
    );
    expect(mockedFs.copyFileSync).not.toHaveBeenCalled();
    expect(mockRestoreCache).toHaveBeenCalled();
  });

  it('warns if file copy fails', async () => {
    mockedFs.copyFileSync.mockImplementation(() => {
      throw new Error('copy failed');
    });

    await cacheDependencies('pip', '3.12');

    expect(mockedCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to copy file')
    );
    expect(mockRestoreCache).toHaveBeenCalled();
  });

  it('skips path logic if no input is provided', async () => {
    mockedCore.getInput.mockReturnValue('');

    await cacheDependencies('pip', '3.12');

    expect(mockedFs.copyFileSync).not.toHaveBeenCalled();
    expect(mockedCore.warning).not.toHaveBeenCalled();
    expect(mockRestoreCache).toHaveBeenCalled();
  });
});
