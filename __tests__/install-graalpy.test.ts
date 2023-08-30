import fs from 'fs';

import {HttpClient} from '@actions/http-client';
import * as ifm from '@actions/http-client/interfaces';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';
import * as core from '@actions/core';
import * as path from 'path';

import * as installer from '../src/install-graalpy';
import {
  IGraalPyManifestRelease,
  IGraalPyManifestAsset,
  IS_WINDOWS
} from '../src/utils';

import manifestData from './data/graalpy.json';

const architecture = 'x64';

const toolDir = path.join(__dirname, 'runner', 'tools');
const tempDir = path.join(__dirname, 'runner', 'temp');

/* GraalPy doesn't have a windows release yet */
const describeSkipOnWindows = IS_WINDOWS ? describe.skip : describe;

describe('graalpyVersionToSemantic', () => {
  it.each([
    ['23.0.0a1', '23.0.0a1'],
    ['23.0.0', '23.0.0'],
    ['23.0.x', '23.0.x'],
    ['23.x', '23.x']
  ])('%s -> %s', (input, expected) => {
    expect(installer.graalPyTagToVersion(input)).toEqual(expected);
  });
});

describeSkipOnWindows('findRelease', () => {
  const result = JSON.stringify(manifestData);
  const releases = JSON.parse(result) as IGraalPyManifestRelease[];
  const extension = 'tar.gz';
  const arch = installer.toGraalPyArchitecture(architecture);
  const platform = installer.toGraalPyPlatform(process.platform);
  const extensionName = `${platform}-${arch}.${extension}`;
  const files: IGraalPyManifestAsset = {
    name: `graalpython-23.0.0-${extensionName}`,
    browser_download_url: `https://github.com/oracle/graalpython/releases/download/graal-23.0.0/graalpython-23.0.0-${extensionName}`
  };
  const filesRC1: IGraalPyManifestAsset = {
    name: `graalpython-23.1.0a1-${extensionName}`,
    browser_download_url: `https://github.com/oracle/graalpython/releases/download/graal-23.1.0a1/graalpython-23.1.0a1-${extensionName}`
  };

  let warningSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    infoSpy = jest.spyOn(core, 'info');
    infoSpy.mockImplementation(() => {});

    warningSpy = jest.spyOn(core, 'warning');
    warningSpy.mockImplementation(() => null);

    debugSpy = jest.spyOn(core, 'debug');
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
    const graalpyVersion = installer.graalPyTagToVersion('vm-23.1.0a1');
    expect(
      installer.findRelease(releases, graalpyVersion, architecture, false)
    ).toMatchObject({
      foundAsset: {
        name: `graalpython-23.1.0a1-${extensionName}`,
        browser_download_url: `https://github.com/oracle/graalpython/releases/download/graal-23.1.0a1/graalpython-23.1.0a1-${extensionName}`
      },
      resolvedGraalPyVersion: '23.1.0-a.1'
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
    const graalpyVersion = '23.1.x';
    expect(
      installer.findRelease(releases, graalpyVersion, architecture, false)
    ).toBeNull();
    expect(
      installer.findRelease(releases, graalpyVersion, architecture, true)
    ).toMatchObject({
      foundAsset: filesRC1,
      resolvedGraalPyVersion: '23.1.0-a.1'
    });
  });
});

describeSkipOnWindows('installGraalPy', () => {
  let tcFind: jest.SpyInstance;
  let warningSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  let spyExtractZip: jest.SpyInstance;
  let spyExtractTar: jest.SpyInstance;
  let spyFsReadDir: jest.SpyInstance;
  let spyFsWriteFile: jest.SpyInstance;
  let spyHttpClient: jest.SpyInstance;
  let spyExistsSync: jest.SpyInstance;
  let spyExec: jest.SpyInstance;
  let spySymlinkSync: jest.SpyInstance;
  let spyDownloadTool: jest.SpyInstance;
  let spyCacheDir: jest.SpyInstance;
  let spyChmodSync: jest.SpyInstance;

  beforeEach(() => {
    tcFind = jest.spyOn(tc, 'find');
    tcFind.mockImplementation(() =>
      path.join('GraalPy', '3.6.12', architecture)
    );

    spyDownloadTool = jest.spyOn(tc, 'downloadTool');
    spyDownloadTool.mockImplementation(() => path.join(tempDir, 'GraalPy'));

    spyExtractZip = jest.spyOn(tc, 'extractZip');
    spyExtractZip.mockImplementation(() => tempDir);

    spyExtractTar = jest.spyOn(tc, 'extractTar');
    spyExtractTar.mockImplementation(() => tempDir);

    infoSpy = jest.spyOn(core, 'info');
    infoSpy.mockImplementation(() => {});

    warningSpy = jest.spyOn(core, 'warning');
    warningSpy.mockImplementation(() => null);

    debugSpy = jest.spyOn(core, 'debug');
    debugSpy.mockImplementation(() => null);

    spyFsReadDir = jest.spyOn(fs, 'readdirSync');
    spyFsReadDir.mockImplementation(() => ['GraalPyTest']);

    spyFsWriteFile = jest.spyOn(fs, 'writeFileSync');
    spyFsWriteFile.mockImplementation(() => undefined);

    spyHttpClient = jest.spyOn(HttpClient.prototype, 'getJson');
    spyHttpClient.mockImplementation(
      async (): Promise<ifm.ITypedResponse<IGraalPyManifestRelease[]>> => {
        const result = JSON.stringify(manifestData);
        return {
          statusCode: 200,
          headers: {},
          result: JSON.parse(result) as IGraalPyManifestRelease[]
        };
      }
    );

    spyExec = jest.spyOn(exec, 'exec');
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
    spyCacheDir = jest.spyOn(tc, 'cacheDir');
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
    spyCacheDir = jest.spyOn(tc, 'cacheDir');
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'GraalPy', '23.1.0', architecture)
    );

    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);

    await expect(
      installer.installGraalPy('23.1.x', architecture, false, undefined)
    ).rejects.toThrow();
    await expect(
      installer.installGraalPy('23.1.x', architecture, true, undefined)
    ).resolves.toEqual({
      installDir: path.join(toolDir, 'GraalPy', '23.1.0', architecture),
      resolvedGraalPyVersion: '23.1.0-a.1'
    });

    expect(spyHttpClient).toHaveBeenCalled();
    expect(spyDownloadTool).toHaveBeenCalled();
    expect(spyCacheDir).toHaveBeenCalled();
    expect(spyExec).toHaveBeenCalled();
  });
});
