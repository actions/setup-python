import fs from 'fs';

import * as utils from '../src/utils';
import {HttpClient} from '@actions/http-client';
import * as ifm from '@actions/http-client/interfaces';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';

import * as path from 'path';
import * as semver from 'semver';

import * as finder from '../src/find-pypy';
import {
  IPyPyManifestRelease,
  IS_WINDOWS,
  validateVersion,
  getPyPyVersionFromPath
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

describe('parsePyPyVersion', () => {
  it.each([
    ['pypy-3.6-v7.3.3', {pythonVersion: '3.6', pypyVersion: 'v7.3.3'}],
    ['pypy-3.6-v7.3.x', {pythonVersion: '3.6', pypyVersion: 'v7.3.x'}],
    ['pypy-3.6-v7.x', {pythonVersion: '3.6', pypyVersion: 'v7.x'}],
    ['pypy-3.6', {pythonVersion: '3.6', pypyVersion: 'x'}],
    ['pypy-3.6-nightly', {pythonVersion: '3.6', pypyVersion: 'nightly'}],
    ['pypy-3.6-v7.3.3rc1', {pythonVersion: '3.6', pypyVersion: 'v7.3.3-rc.1'}]
  ])('%s -> %s', (input, expected) => {
    expect(finder.parsePyPyVersion(input)).toEqual(expected);
  });

  it('throw on invalid input', () => {
    expect(() => finder.parsePyPyVersion('pypy-')).toThrowError(
      "Invalid 'version' property for PyPy. PyPy version should be specified as 'pypy-<python-version>'. See README for examples and documentation."
    );
  });
});

describe('getPyPyVersionFromPath', () => {
  it('/fake/toolcache/PyPy/3.6.5/x64 -> 3.6.5', () => {
    expect(getPyPyVersionFromPath('/fake/toolcache/PyPy/3.6.5/x64')).toEqual(
      '3.6.5'
    );
  });
});

describe('findPyPyToolCache', () => {
  const actualPythonVersion = '3.6.17';
  const actualPyPyVersion = '7.5.4';
  const pypyPath = path.join('PyPy', actualPythonVersion, architecture);
  let tcFind: jest.SpyInstance;
  let spyReadExactPyPyVersion: jest.SpyInstance;

  beforeEach(() => {
    tcFind = jest.spyOn(tc, 'find');
    tcFind.mockImplementation((toolname: string, pythonVersion: string) => {
      const semverVersion = new semver.Range(pythonVersion);
      return semver.satisfies(actualPythonVersion, semverVersion)
        ? pypyPath
        : '';
    });

    spyReadExactPyPyVersion = jest.spyOn(utils, 'readExactPyPyVersionFile');
    spyReadExactPyPyVersion.mockImplementation(() => actualPyPyVersion);
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('PyPy exists on the path and versions are satisfied', () => {
    expect(finder.findPyPyToolCache('3.6.17', 'v7.5.4', architecture)).toEqual({
      installDir: pypyPath,
      resolvedPythonVersion: actualPythonVersion,
      resolvedPyPyVersion: actualPyPyVersion
    });
  });

  it('PyPy exists on the path and versions are satisfied with semver', () => {
    expect(finder.findPyPyToolCache('3.6', 'v7.5.x', architecture)).toEqual({
      installDir: pypyPath,
      resolvedPythonVersion: actualPythonVersion,
      resolvedPyPyVersion: actualPyPyVersion
    });
  });

  it("PyPy exists on the path, but Python version doesn't match", () => {
    expect(finder.findPyPyToolCache('3.7', 'v7.5.4', architecture)).toEqual({
      installDir: '',
      resolvedPythonVersion: '',
      resolvedPyPyVersion: ''
    });
  });

  it("PyPy exists on the path, but PyPy version doesn't match", () => {
    expect(finder.findPyPyToolCache('3.6', 'v7.5.1', architecture)).toEqual({
      installDir: null,
      resolvedPythonVersion: '',
      resolvedPyPyVersion: ''
    });
  });
});

describe('findPyPyVersion', () => {
  let tcFind: jest.SpyInstance;
  let spyExtractZip: jest.SpyInstance;
  let spyExtractTar: jest.SpyInstance;
  let spyHttpClient: jest.SpyInstance;
  let spyExistsSync: jest.SpyInstance;
  let spyExec: jest.SpyInstance;
  let spySymlinkSync: jest.SpyInstance;
  let spyDownloadTool: jest.SpyInstance;
  let spyReadExactPyPyVersion: jest.SpyInstance;
  let spyFsReadDir: jest.SpyInstance;
  let spyWriteExactPyPyVersionFile: jest.SpyInstance;
  let spyCacheDir: jest.SpyInstance;
  let spyChmodSync: jest.SpyInstance;

  beforeEach(() => {
    tcFind = jest.spyOn(tc, 'find');
    tcFind.mockImplementation((tool: string, version: string) => {
      const semverRange = new semver.Range(version);
      let pypyPath = '';
      if (semver.satisfies('3.6.12', semverRange)) {
        pypyPath = path.join(toolDir, 'PyPy', '3.6.12', architecture);
      }
      return pypyPath;
    });

    spyWriteExactPyPyVersionFile = jest.spyOn(
      utils,
      'writeExactPyPyVersionFile'
    );
    spyWriteExactPyPyVersionFile.mockImplementation(() => null);

    spyReadExactPyPyVersion = jest.spyOn(utils, 'readExactPyPyVersionFile');
    spyReadExactPyPyVersion.mockImplementation(() => '7.3.3');

    spyDownloadTool = jest.spyOn(tc, 'downloadTool');
    spyDownloadTool.mockImplementation(() => path.join(tempDir, 'PyPy'));

    spyExtractZip = jest.spyOn(tc, 'extractZip');
    spyExtractZip.mockImplementation(() => tempDir);

    spyExtractTar = jest.spyOn(tc, 'extractTar');
    spyExtractTar.mockImplementation(() => tempDir);

    spyFsReadDir = jest.spyOn(fs, 'readdirSync');
    spyFsReadDir.mockImplementation((directory: string) => ['PyPyTest']);

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
    spyExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('found PyPy in toolcache', async () => {
    await expect(
      finder.findPyPyVersion('pypy-3.6-v7.3.x', architecture)
    ).resolves.toEqual({
      resolvedPythonVersion: '3.6.12',
      resolvedPyPyVersion: '7.3.3'
    });
  });

  it('throw on invalid input format', async () => {
    await expect(
      finder.findPyPyVersion('pypy3.7-v7.3.x', architecture)
    ).rejects.toThrow();
  });

  it('throw on invalid input format pypy3.7-7.3.x', async () => {
    await expect(
      finder.findPyPyVersion('pypy3.7-v7.3.x', architecture)
    ).rejects.toThrow();
  });

  it('found and install successfully', async () => {
    spyCacheDir = jest.spyOn(tc, 'cacheDir');
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'PyPy', '3.7.7', architecture)
    );
    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);
    await expect(
      finder.findPyPyVersion('pypy-3.7-v7.3.x', architecture)
    ).resolves.toEqual({
      resolvedPythonVersion: '3.7.9',
      resolvedPyPyVersion: '7.3.3'
    });
  });

  it('throw if release is not found', async () => {
    await expect(
      finder.findPyPyVersion('pypy-3.7-v7.5.x', architecture)
    ).rejects.toThrowError(
      `PyPy version 3.7 (v7.5.x) with arch ${architecture} not found`
    );
  });
});
