import {jest, describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {fileURLToPath} from 'url';
import fs from 'fs';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mock @actions modules
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

jest.unstable_mockModule('@actions/tool-cache', () => ({
  find: jest.fn(),
  findAllVersions: jest.fn(),
  downloadTool: jest.fn(),
  extractZip: jest.fn(),
  extractTar: jest.fn(),
  extract7z: jest.fn(),
  extractXar: jest.fn(),
  cacheDir: jest.fn(),
  cacheFile: jest.fn(),
  getManifestFromRepo: jest.fn(),
  findFromManifest: jest.fn(),
  evaluateVersions: jest.fn()
}));

jest.unstable_mockModule('@actions/exec', () => ({
  exec: jest.fn(),
  getExecOutput: jest.fn()
}));

// Dynamic imports after mocking
const core = await import('@actions/core');
const tc = await import('@actions/tool-cache');
const exec = await import('@actions/exec');

// Non-mocked imports
import {HttpClient} from '@actions/http-client';
import type * as ifm from '@actions/http-client/lib/interfaces';

const installer = await import('../src/install-pypy.js');
const utils = await import('../src/utils.js');

import type {IPyPyManifestRelease, IPyPyManifestAsset} from '../src/utils.js';
import manifestData from './data/pypy.json' with {type: 'json'};

const IS_WINDOWS = utils.IS_WINDOWS;

let architecture: string;
if (IS_WINDOWS) {
  architecture = 'x86';
} else {
  architecture = 'x64';
}

const toolDir = path.join(__dirname, 'runner', 'tools');
const tempDir = path.join(__dirname, 'runner', 'temp');

describe('pypyVersionToSemantic', () => {
  it.each([
    ['7.3.3rc1', '7.3.3-rc.1'],
    ['7.3.3', '7.3.3'],
    ['7.3.x', '7.3.x'],
    ['7.x', '7.x'],
    ['nightly', 'nightly']
  ])('%s -> %s', (input, expected) => {
    expect(installer.pypyVersionToSemantic(input)).toEqual(expected);
  });
});

describe('findRelease', () => {
  const result = JSON.stringify(manifestData);
  const releases = JSON.parse(result) as IPyPyManifestRelease[];
  const extension = IS_WINDOWS ? '.zip' : '.tar.bz2';
  const extensionName = IS_WINDOWS
    ? `${process.platform}${extension}`
    : `${process.platform}64${extension}`;
  const files: IPyPyManifestAsset = {
    filename: `pypy3.6-v7.3.3-${extensionName}`,
    arch: architecture,
    platform: process.platform,
    download_url: `https://test.download.python.org/pypy/pypy3.6-v7.3.3-${extensionName}`
  };
  const filesRC1: IPyPyManifestAsset = {
    filename: `pypy3.6-v7.4.0rc1-${extensionName}`,
    arch: architecture,
    platform: process.platform,
    download_url: `https://test.download.python.org/pypy/pypy3.6-v7.4.0rc1-${extensionName}`
  };

  let infoSpy: jest.Mock;
  let warningSpy: jest.Mock;
  let debugSpy: jest.Mock;

  beforeEach(() => {
    infoSpy = core.info as jest.Mock;
    infoSpy.mockImplementation(() => {});

    warningSpy = core.warning as jest.Mock;
    warningSpy.mockImplementation(() => null);

    debugSpy = core.debug as jest.Mock;
    debugSpy.mockImplementation(() => null);
  });

  it("Python version is found, but PyPy version doesn't match", () => {
    const pythonVersion = '3.6';
    const pypyVersion = '7.3.7';
    expect(
      installer.findRelease(
        releases,
        pythonVersion,
        pypyVersion,
        architecture,
        false
      )
    ).toEqual(null);
  });

  it('Python version is found and PyPy version matches', () => {
    const pythonVersion = '3.6';
    const pypyVersion = '7.3.3';
    expect(
      installer.findRelease(
        releases,
        pythonVersion,
        pypyVersion,
        architecture,
        false
      )
    ).toEqual({
      foundAsset: files,
      resolvedPythonVersion: '3.6.12',
      resolvedPyPyVersion: pypyVersion
    });
  });

  it('Python version is found in toolcache and PyPy version matches semver', () => {
    const pythonVersion = '3.6';
    const pypyVersion = '7.x';
    expect(
      installer.findRelease(
        releases,
        pythonVersion,
        pypyVersion,
        architecture,
        false
      )
    ).toEqual({
      foundAsset: files,
      resolvedPythonVersion: '3.6.12',
      resolvedPyPyVersion: '7.3.3'
    });
  });

  it('Python and preview version of PyPy are found', () => {
    const pythonVersion = '3.7';
    const pypyVersion = installer.pypyVersionToSemantic('7.3.3rc2');
    expect(
      installer.findRelease(
        releases,
        pythonVersion,
        pypyVersion,
        architecture,
        false
      )
    ).toEqual({
      foundAsset: {
        filename: `test${extension}`,
        arch: architecture,
        platform: process.platform,
        download_url: `test${extension}`
      },
      resolvedPythonVersion: '3.7.7',
      resolvedPyPyVersion: '7.3.3rc2'
    });
  });

  it('Python version with latest PyPy is found', () => {
    const pythonVersion = '3.6';
    const pypyVersion = 'x';
    expect(
      installer.findRelease(
        releases,
        pythonVersion,
        pypyVersion,
        architecture,
        false
      )
    ).toEqual({
      foundAsset: files,
      resolvedPythonVersion: '3.6.12',
      resolvedPyPyVersion: '7.3.3'
    });
  });

  it('Python version and PyPy version matches semver (pre-release)', () => {
    const pythonVersion = '3.6';
    const pypyVersion = '7.4.x';
    expect(
      installer.findRelease(
        releases,
        pythonVersion,
        pypyVersion,
        architecture,
        false
      )
    ).toBeNull();
    expect(
      installer.findRelease(
        releases,
        pythonVersion,
        pypyVersion,
        architecture,
        true
      )
    ).toEqual({
      foundAsset: filesRC1,
      resolvedPythonVersion: '3.6.12',
      resolvedPyPyVersion: '7.4.0rc1'
    });
  });

  it('Nightly release is found', () => {
    const pythonVersion = '3.6';
    const pypyVersion = 'nightly';
    const filename = IS_WINDOWS ? 'filename.zip' : 'filename.tar.bz2';
    expect(
      installer.findRelease(
        releases,
        pythonVersion,
        pypyVersion,
        architecture,
        false
      )
    ).toEqual({
      foundAsset: {
        filename: filename,
        arch: architecture,
        platform: process.platform,
        download_url: `http://nightlyBuilds.org/${filename}`
      },
      resolvedPythonVersion: '3.6',
      resolvedPyPyVersion: pypyVersion
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });
});

describe('installPyPy', () => {
  let tcFind: jest.Mock;
  let infoSpy: jest.Mock;
  let warningSpy: jest.Mock;
  let debugSpy: jest.Mock;
  let spyExtractZip: jest.Mock;
  let spyExtractTar: jest.Mock;
  let spyFsReadDir: jest.SpiedFunction<typeof fs.readdirSync>;
  let spyFsWriteFile: jest.SpiedFunction<typeof fs.writeFileSync>;
  let spyHttpClient: jest.SpiedFunction<typeof HttpClient.prototype.getJson>;
  let spyExistsSync: jest.SpiedFunction<typeof fs.existsSync>;
  let spyExec: jest.Mock;
  let spySymlinkSync: jest.SpiedFunction<typeof fs.symlinkSync>;
  let spyDownloadTool: jest.Mock;
  let spyCacheDir: jest.Mock;
  let spyChmodSync: jest.SpiedFunction<typeof fs.chmodSync>;

  beforeEach(() => {
    tcFind = tc.find as jest.Mock;
    tcFind.mockImplementation(() => path.join('PyPy', '3.6.12', architecture));

    spyDownloadTool = tc.downloadTool as jest.Mock;
    spyDownloadTool.mockImplementation(() => path.join(tempDir, 'PyPy'));

    spyExtractZip = tc.extractZip as jest.Mock;
    spyExtractZip.mockImplementation(() => tempDir);

    spyExtractTar = tc.extractTar as jest.Mock;
    spyExtractTar.mockImplementation(() => tempDir);

    infoSpy = core.info as jest.Mock;
    infoSpy.mockImplementation(() => {});

    warningSpy = core.warning as jest.Mock;
    warningSpy.mockImplementation(() => null);

    debugSpy = core.debug as jest.Mock;
    debugSpy.mockImplementation(() => null);

    spyFsReadDir = jest.spyOn(fs, 'readdirSync');
    spyFsReadDir.mockImplementation(() => ['PyPyTest'] as any);

    spyFsWriteFile = jest.spyOn(fs, 'writeFileSync');
    spyFsWriteFile.mockImplementation(() => undefined);

    spyHttpClient = jest.spyOn(HttpClient.prototype, 'getJson');
    spyHttpClient.mockImplementation(
      async (): Promise<ifm.TypedResponse<IPyPyManifestRelease[]>> => {
        const result = JSON.stringify(manifestData);
        return {
          statusCode: 200,
          headers: {},
          result: JSON.parse(result) as IPyPyManifestRelease[]
        };
      }
    );

    spyExec = exec.exec as jest.Mock;
    spyExec.mockImplementation(() => undefined);

    spySymlinkSync = jest.spyOn(fs, 'symlinkSync');
    spySymlinkSync.mockImplementation(() => undefined);

    spyExistsSync = jest.spyOn(fs, 'existsSync');
    spyExistsSync.mockImplementation(() => false);
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('throw if release is not found', async () => {
    await expect(
      installer.installPyPy('7.3.3', '3.6.17', architecture, false, undefined)
    ).rejects.toThrow(
      `PyPy version 3.6.17 (7.3.3) with arch ${architecture} not found`
    );

    expect(spyHttpClient).toHaveBeenCalled();
    expect(spyDownloadTool).not.toHaveBeenCalled();
    expect(spyExec).not.toHaveBeenCalled();
  });

  it('found and install PyPy', async () => {
    spyCacheDir = tc.cacheDir as jest.Mock;
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'PyPy', '3.6.12', architecture)
    );

    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);

    await expect(
      installer.installPyPy('7.x', '3.6.12', architecture, false, undefined)
    ).resolves.toEqual({
      installDir: path.join(toolDir, 'PyPy', '3.6.12', architecture),
      resolvedPythonVersion: '3.6.12',
      resolvedPyPyVersion: '7.3.3'
    });

    expect(spyHttpClient).toHaveBeenCalled();
    expect(spyDownloadTool).toHaveBeenCalled();
    expect(spyExistsSync).toHaveBeenCalled();
    expect(spyCacheDir).toHaveBeenCalled();
    expect(spyExec).toHaveBeenCalled();
  });

  it('found and install PyPy, pre-release fallback', async () => {
    spyCacheDir = tc.cacheDir as jest.Mock;
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'PyPy', '3.6.12', architecture)
    );

    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);

    await expect(
      installer.installPyPy('7.4.x', '3.6.12', architecture, false, undefined)
    ).rejects.toThrow();
    await expect(
      installer.installPyPy('7.4.x', '3.6.12', architecture, true, undefined)
    ).resolves.toEqual({
      installDir: path.join(toolDir, 'PyPy', '3.6.12', architecture),
      resolvedPythonVersion: '3.6.12',
      resolvedPyPyVersion: '7.4.0rc1'
    });

    expect(spyHttpClient).toHaveBeenCalled();
    expect(spyDownloadTool).toHaveBeenCalled();
    expect(spyExistsSync).toHaveBeenCalled();
    expect(spyCacheDir).toHaveBeenCalled();
    expect(spyExec).toHaveBeenCalled();
  });
});
