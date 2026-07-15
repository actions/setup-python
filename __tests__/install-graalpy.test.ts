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

const installer = await import('../src/install-graalpy.js');
const utils = await import('../src/utils.js');

import type {
  IGraalPyManifestRelease,
  IGraalPyManifestAsset
} from '../src/utils.js';
import manifestData from './data/graalpy.json' with {type: 'json'};

const IS_WINDOWS = utils.IS_WINDOWS;

const architecture = 'x64';

const toolDir = path.join(__dirname, 'runner', 'tools');
const tempDir = path.join(__dirname, 'runner', 'temp');

describe('graalpyVersionToSemantic', () => {
  it.each([
    ['graalpy-24.1.0-ea.09', '24.1.0-ea.9'],
    ['graal-23.0.0', '23.0.0'],
    ['vm-23.0.x', '23.0.x'],
    ['graal-23.x', '23.x']
  ])('%s -> %s', (input, expected) => {
    expect(installer.graalPyTagToVersion(input)).toEqual(expected);
  });
});

describe('findRelease', () => {
  const result = JSON.stringify(manifestData);
  const releases = JSON.parse(result) as IGraalPyManifestRelease[];
  const extension = IS_WINDOWS ? 'zip' : 'tar.gz';
  const arch = installer.toGraalPyArchitecture(architecture);
  const platform = installer.toGraalPyPlatform(process.platform);
  const extensionName = `${platform}-${arch}.${extension}`;
  const files: IGraalPyManifestAsset = {
    name: `graalpython-23.0.0-${extensionName}`,
    browser_download_url: `https://github.com/oracle/graalpython/releases/download/graal-23.0.0/graalpython-23.0.0-${extensionName}`
  };
  const filesRC1: IGraalPyManifestAsset = {
    name: `graalpy-24.1.0-ea.09-${extensionName}`,
    browser_download_url: `https://github.com/graalvm/graal-languages-ea-builds/releases/download/graalpy-24.1.0-ea.09/graalpy-24.1.0-ea.09-${extensionName}`
  };

  let warningSpy: jest.Mock;
  let debugSpy: jest.Mock;
  let infoSpy: jest.Mock;

  beforeEach(() => {
    infoSpy = core.info as jest.Mock;
    infoSpy.mockImplementation(() => {});

    warningSpy = core.warning as jest.Mock;
    warningSpy.mockImplementation(() => null);

    debugSpy = core.debug as jest.Mock;
    debugSpy.mockImplementation(() => null);
  });

  it("GraalPy version doesn't match", () => {
    const graalpyVersion = '12.0.0';
    expect(
      installer.findRelease(releases, graalpyVersion, architecture, false)
    ).toEqual(null);
  });

  it('GraalPy version matches', () => {
    const graalpyVersion = '23.0.0';
    expect(
      installer.findRelease(releases, graalpyVersion, architecture, false)
    ).toMatchObject({
      foundAsset: files,
      resolvedGraalPyVersion: graalpyVersion
    });
  });

  it('Preview version of GraalPy is found', () => {
    const graalpyVersion = installer.graalPyTagToVersion('vm-24.1.0-ea.09');
    expect(
      installer.findRelease(releases, graalpyVersion, architecture, false)
    ).toMatchObject({
      foundAsset: {
        name: `graalpy-24.1.0-ea.09-${extensionName}`,
        browser_download_url: `https://github.com/graalvm/graal-languages-ea-builds/releases/download/graalpy-24.1.0-ea.09/graalpy-24.1.0-ea.09-${extensionName}`
      },
      resolvedGraalPyVersion: '24.1.0-ea.9'
    });
  });

  it('Latest GraalPy is found', () => {
    const graalpyVersion = 'x';
    expect(
      installer.findRelease(releases, graalpyVersion, architecture, false)
    ).toMatchObject({
      foundAsset: files,
      resolvedGraalPyVersion: '23.0.0'
    });
  });

  it('GraalPy version matches semver (pre-release)', () => {
    const graalpyVersion = '24.1.x';
    expect(
      installer.findRelease(releases, graalpyVersion, architecture, false)
    ).toBeNull();
    expect(
      installer.findRelease(releases, graalpyVersion, architecture, true)
    ).toMatchObject({
      foundAsset: filesRC1,
      resolvedGraalPyVersion: '24.1.0-ea.9'
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });
});

describe('installGraalPy', () => {
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
    tcFind.mockImplementation(() =>
      path.join('GraalPy', '3.6.12', architecture)
    );

    spyDownloadTool = tc.downloadTool as jest.Mock;
    spyDownloadTool.mockImplementation(() => path.join(tempDir, 'GraalPy'));

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
    spyFsReadDir.mockImplementation(() => ['GraalPyTest'] as any);

    spyFsWriteFile = jest.spyOn(fs, 'writeFileSync');
    spyFsWriteFile.mockImplementation(() => undefined);

    spyHttpClient = jest.spyOn(HttpClient.prototype, 'getJson');
    spyHttpClient.mockImplementation(
      async (): Promise<ifm.TypedResponse<IGraalPyManifestRelease[]>> => {
        const result = JSON.stringify(manifestData);
        return {
          statusCode: 200,
          headers: {},
          result: JSON.parse(result) as IGraalPyManifestRelease[]
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
      installer.installGraalPy('7.3.3', architecture, false, undefined)
    ).rejects.toThrow(
      `GraalPy version 7.3.3 with arch ${architecture} not found`
    );

    expect(spyHttpClient).toHaveBeenCalled();
    expect(spyDownloadTool).not.toHaveBeenCalled();
    expect(spyExec).not.toHaveBeenCalled();
  });

  it('found and install GraalPy', async () => {
    spyCacheDir = tc.cacheDir as jest.Mock;
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'GraalPy', '21.3.0', architecture)
    );

    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);

    await expect(
      installer.installGraalPy('21.x', architecture, false, undefined)
    ).resolves.toEqual({
      installDir: path.join(toolDir, 'GraalPy', '21.3.0', architecture),
      resolvedGraalPyVersion: '21.3.0'
    });

    expect(spyHttpClient).toHaveBeenCalled();
    expect(spyDownloadTool).toHaveBeenCalled();
    expect(spyCacheDir).toHaveBeenCalled();
    expect(spyExec).toHaveBeenCalled();
  });

  it('found and install GraalPy, pre-release fallback', async () => {
    spyCacheDir = tc.cacheDir as jest.Mock;
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'GraalPy', '24.1.0', architecture)
    );

    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);

    await expect(
      installer.installGraalPy('24.1.x', architecture, false, undefined)
    ).rejects.toThrow();
    await expect(
      installer.installGraalPy('24.1.x', architecture, true, undefined)
    ).resolves.toEqual({
      installDir: path.join(toolDir, 'GraalPy', '24.1.0', architecture),
      resolvedGraalPyVersion: '24.1.0-ea.9'
    });

    expect(spyHttpClient).toHaveBeenCalled();
    expect(spyDownloadTool).toHaveBeenCalled();
    expect(spyCacheDir).toHaveBeenCalled();
    expect(spyExec).toHaveBeenCalled();
  });
});
