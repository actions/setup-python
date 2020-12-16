import fs from 'fs';

import {HttpClient} from '@actions/http-client';
import * as ifm from '@actions/http-client/interfaces';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';
import * as path from 'path';

import * as installer from '../src/install-pypy';
import {
  IPyPyManifestRelease,
  IPyPyManifestAsset,
  IS_WINDOWS
} from '../src/utils';

const manifestData = require('./data/pypy.json');

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

  it("Python version is found, but PyPy version doesn't match", () => {
    const pythonVersion = '3.6';
    const pypyVersion = '7.3.7';
    expect(
      installer.findRelease(releases, pythonVersion, pypyVersion, architecture)
    ).toEqual(null);
  });

  it('Python version is found and PyPy version matches', () => {
    const pythonVersion = '3.6';
    const pypyVersion = '7.3.3';
    expect(
      installer.findRelease(releases, pythonVersion, pypyVersion, architecture)
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
      installer.findRelease(releases, pythonVersion, pypyVersion, architecture)
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
      installer.findRelease(releases, pythonVersion, pypyVersion, architecture)
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
      installer.findRelease(releases, pythonVersion, pypyVersion, architecture)
    ).toEqual({
      foundAsset: files,
      resolvedPythonVersion: '3.6.12',
      resolvedPyPyVersion: '7.3.3'
    });
  });

  it('Nightly release is found', () => {
    const pythonVersion = '3.6';
    const pypyVersion = 'nightly';
    const filename = IS_WINDOWS ? 'filename.zip' : 'filename.tar.bz2';
    expect(
      installer.findRelease(releases, pythonVersion, pypyVersion, architecture)
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
});

describe('installPyPy', () => {
  let tcFind: jest.SpyInstance;
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
    tcFind.mockImplementation(() => path.join('PyPy', '3.6.12', architecture));

    spyDownloadTool = jest.spyOn(tc, 'downloadTool');
    spyDownloadTool.mockImplementation(() => path.join(tempDir, 'PyPy'));

    spyExtractZip = jest.spyOn(tc, 'extractZip');
    spyExtractZip.mockImplementation(() => tempDir);

    spyExtractTar = jest.spyOn(tc, 'extractTar');
    spyExtractTar.mockImplementation(() => tempDir);

    spyFsReadDir = jest.spyOn(fs, 'readdirSync');
    spyFsReadDir.mockImplementation(() => ['PyPyTest']);

    spyFsWriteFile = jest.spyOn(fs, 'writeFileSync');
    spyFsWriteFile.mockImplementation(() => undefined);

    spyHttpClient = jest.spyOn(HttpClient.prototype, 'getJson');
    spyHttpClient.mockImplementation(
      async (): Promise<ifm.ITypedResponse<IPyPyManifestRelease[]>> => {
        const result = JSON.stringify(manifestData);
        return {
          statusCode: 200,
          headers: {},
          result: JSON.parse(result) as IPyPyManifestRelease[]
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
      installer.installPyPy('7.3.3', '3.6.17', architecture)
    ).rejects.toThrowError(
      `PyPy version 3.6.17 (7.3.3) with arch ${architecture} not found`
    );

    expect(spyHttpClient).toHaveBeenCalled();
    expect(spyDownloadTool).not.toHaveBeenCalled();
    expect(spyExec).not.toHaveBeenCalled();
  });

  it('found and install PyPy', async () => {
    spyCacheDir = jest.spyOn(tc, 'cacheDir');
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'PyPy', '3.6.12', architecture)
    );

    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);

    await expect(
      installer.installPyPy('7.3.x', '3.6.12', architecture)
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
});
