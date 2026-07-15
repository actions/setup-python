import {jest, describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {fileURLToPath} from 'url';
import fs from 'fs';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import * as semver from 'semver';

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
const finder = await import('../src/find-graalpy.js');
const utils = await import('../src/utils.js');

// Non-mocked imports
import {HttpClient} from '@actions/http-client';
import type * as ifm from '@actions/http-client/lib/interfaces';

import type {IGraalPyManifestRelease} from '../src/utils.js';
import manifestData from './data/graalpy.json' with {type: 'json'};

const architecture = 'x64';

const toolDir = path.join(__dirname, 'runner', 'tools');
const tempDir = path.join(__dirname, 'runner', 'temp');

describe('parseGraalPyVersion', () => {
  it.each([
    ['graalpy-23', '23'],
    ['graalpy-23.0', '23.0'],
    ['graalpy23.0', '23.0']
  ])('%s -> %s', (input, expected) => {
    expect(finder.parseGraalPyVersion(input)).toEqual(expected);
  });

  it.each(['', 'graalpy-', 'graalpy', 'p', 'notgraalpy-'])(
    'throw on invalid input "%s"',
    input => {
      expect(() => finder.parseGraalPyVersion(input)).toThrow(
        "Invalid 'version' property for GraalPy. GraalPy version should be specified as 'graalpy<python-version>' or 'graalpy-<python-version>'. See README for examples and documentation."
      );
    }
  );
});

describe('findGraalPyToolCache', () => {
  const actualGraalPyVersion = '23.0.0';
  const graalpyPath = path.join('GraalPy', actualGraalPyVersion, architecture);
  let tcFind: jest.Mock;
  let infoSpy: jest.Mock;
  let warningSpy: jest.Mock;
  let debugSpy: jest.Mock;
  let addPathSpy: jest.Mock;
  let exportVariableSpy: jest.Mock;
  let setOutputSpy: jest.Mock;

  beforeEach(() => {
    tcFind = tc.find as jest.Mock;
    (tcFind as jest.Mock<typeof tc.find>).mockImplementation(
      (toolname: string, pythonVersion: string) => {
        const semverVersion = new semver.Range(pythonVersion);
        return semver.satisfies(actualGraalPyVersion, semverVersion)
          ? graalpyPath
          : '';
      }
    );

    infoSpy = core.info as jest.Mock;
    infoSpy.mockImplementation(() => null);

    warningSpy = core.warning as jest.Mock;
    warningSpy.mockImplementation(() => null);

    debugSpy = core.debug as jest.Mock;
    debugSpy.mockImplementation(() => null);

    addPathSpy = core.addPath as jest.Mock;
    addPathSpy.mockImplementation(() => null);

    exportVariableSpy = core.exportVariable as jest.Mock;
    exportVariableSpy.mockImplementation(() => null);

    setOutputSpy = core.setOutput as jest.Mock;
    setOutputSpy.mockImplementation(() => null);
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('GraalPy exists on the path and versions are satisfied', () => {
    expect(finder.findGraalPyToolCache('23.0.0', architecture)).toEqual({
      installDir: graalpyPath,
      resolvedGraalPyVersion: actualGraalPyVersion
    });
  });

  it('GraalPy exists on the path and versions are satisfied with semver', () => {
    expect(finder.findGraalPyToolCache('23.0', architecture)).toEqual({
      installDir: graalpyPath,
      resolvedGraalPyVersion: actualGraalPyVersion
    });
  });

  it("GraalPy exists on the path, but version doesn't match", () => {
    expect(finder.findGraalPyToolCache('22.3', architecture)).toEqual({
      installDir: '',
      resolvedGraalPyVersion: ''
    });
  });
});

describe('findGraalPyVersion', () => {
  let getBooleanInputSpy: jest.Mock;
  let warningSpy: jest.Mock;
  let debugSpy: jest.Mock;
  let infoSpy: jest.Mock;
  let addPathSpy: jest.Mock;
  let exportVariableSpy: jest.Mock;
  let setOutputSpy: jest.Mock;
  let tcFind: jest.Mock;
  let spyExtractZip: jest.Mock;
  let spyExtractTar: jest.Mock;
  let spyHttpClient: jest.SpiedFunction<typeof HttpClient.prototype.getJson>;
  let spyExistsSync: jest.SpiedFunction<typeof fs.existsSync>;
  let spyExec: jest.Mock;
  let spySymlinkSync: jest.SpiedFunction<typeof fs.symlinkSync>;
  let spyDownloadTool: jest.Mock;
  let spyFsReadDir: jest.SpiedFunction<typeof fs.readdirSync>;
  let spyCacheDir: jest.Mock;
  let spyChmodSync: jest.SpiedFunction<typeof fs.chmodSync>;
  let spyCoreAddPath: jest.Mock;
  let spyCoreExportVariable: jest.Mock;
  const env = process.env;

  beforeEach(() => {
    getBooleanInputSpy = core.getBooleanInput as jest.Mock;
    getBooleanInputSpy.mockImplementation(() => false);

    infoSpy = core.info as jest.Mock;
    infoSpy.mockImplementation(() => {});

    warningSpy = core.warning as jest.Mock;
    warningSpy.mockImplementation(() => null);

    debugSpy = core.debug as jest.Mock;
    debugSpy.mockImplementation(() => null);

    addPathSpy = core.addPath as jest.Mock;
    addPathSpy.mockImplementation(() => null);

    exportVariableSpy = core.exportVariable as jest.Mock;
    exportVariableSpy.mockImplementation(() => null);

    setOutputSpy = core.setOutput as jest.Mock;
    setOutputSpy.mockImplementation(() => null);

    process.env = {...env};
    tcFind = tc.find as jest.Mock;
    (tcFind as jest.Mock<typeof tc.find>).mockImplementation(
      (tool: string, version: string) => {
        const semverRange = new semver.Range(version);
        let graalpyPath = '';
        if (semver.satisfies('23.0.0', semverRange)) {
          graalpyPath = path.join(toolDir, 'GraalPy', '23.0.0', architecture);
        }
        return graalpyPath;
      }
    );

    spyDownloadTool = tc.downloadTool as jest.Mock;
    spyDownloadTool.mockImplementation(() => path.join(tempDir, 'GraalPy'));

    spyExtractZip = tc.extractZip as jest.Mock;
    spyExtractZip.mockImplementation(() => tempDir);

    spyExtractTar = tc.extractTar as jest.Mock;
    spyExtractTar.mockImplementation(() => tempDir);

    spyFsReadDir = jest.spyOn(fs, 'readdirSync');
    spyFsReadDir.mockImplementation(() => ['GraalPyTest'] as any);

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
    spyExistsSync.mockReturnValue(true);

    spyCoreAddPath = core.addPath as jest.Mock;

    spyCoreExportVariable = core.exportVariable as jest.Mock;
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    jest.restoreAllMocks();
    process.env = env;
  });

  it('found GraalPy in toolcache', async () => {
    await expect(
      finder.findGraalPyVersion(
        'graalpy-23.0',
        architecture,
        true,
        false,
        false
      )
    ).resolves.toEqual('23.0.0');
    expect(spyCoreAddPath).toHaveBeenCalled();
    expect(spyCoreExportVariable).toHaveBeenCalledWith(
      'pythonLocation',
      expect.anything()
    );
    expect(spyCoreExportVariable).toHaveBeenCalledWith(
      'PKG_CONFIG_PATH',
      expect.anything()
    );
  });

  it('throw on invalid input format', async () => {
    await expect(
      finder.findGraalPyVersion('graalpy-x23', architecture, true, false, false)
    ).rejects.toThrow();
  });

  it('found and install successfully', async () => {
    spyCacheDir = tc.cacheDir as jest.Mock;
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'GraalPy', '23.0.0', architecture)
    );
    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);
    await expect(
      finder.findGraalPyVersion(
        'graalpy-23.0.0',
        architecture,
        true,
        false,
        false
      )
    ).resolves.toEqual('23.0.0');
    expect(spyCoreAddPath).toHaveBeenCalled();
    expect(spyCoreExportVariable).toHaveBeenCalledWith(
      'pythonLocation',
      expect.anything()
    );
    expect(spyCoreExportVariable).toHaveBeenCalledWith(
      'PKG_CONFIG_PATH',
      expect.anything()
    );
  });

  it('found and install successfully without environment update', async () => {
    spyCacheDir = tc.cacheDir as jest.Mock;
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'GraalPy', '23.0.0', architecture)
    );
    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);
    await expect(
      finder.findGraalPyVersion(
        'graalpy-23.0.0',
        architecture,
        false,
        false,
        false
      )
    ).resolves.toEqual('23.0.0');
    expect(spyCoreAddPath).not.toHaveBeenCalled();
    expect(spyCoreExportVariable).not.toHaveBeenCalled();
  });

  it('throw if release is not found', async () => {
    await expect(
      finder.findGraalPyVersion(
        'graalpy-19.0.0',
        architecture,
        true,
        false,
        false
      )
    ).rejects.toThrow(
      `GraalPy version 19.0.0 with arch ${architecture} not found`
    );
  });

  it('check-latest enabled version found and used from toolcache', async () => {
    await expect(
      finder.findGraalPyVersion(
        'graalpy-23.0.0',
        architecture,
        false,
        true,
        false
      )
    ).resolves.toEqual('23.0.0');

    expect(infoSpy).toHaveBeenCalledWith('Resolved as GraalPy 23.0.0');
  });

  it('check-latest enabled version found and install successfully', async () => {
    spyCacheDir = tc.cacheDir as jest.Mock;
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'GraalPy', '23.0.0', architecture)
    );
    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);
    await expect(
      finder.findGraalPyVersion(
        'graalpy-23.0.0',
        architecture,
        false,
        true,
        false
      )
    ).resolves.toEqual('23.0.0');
    expect(infoSpy).toHaveBeenCalledWith('Resolved as GraalPy 23.0.0');
  });

  it('check-latest enabled version is not found and used from toolcache', async () => {
    (tcFind as jest.Mock<typeof tc.find>).mockImplementationOnce(
      (tool: string, version: string) => {
        const semverRange = new semver.Range(version);
        let graalpyPath = '';
        if (semver.satisfies('22.3.4', semverRange)) {
          graalpyPath = path.join(toolDir, 'GraalPy', '22.3.4', architecture);
        }
        return graalpyPath;
      }
    );
    await expect(
      finder.findGraalPyVersion(
        'graalpy-22.3.4',
        architecture,
        false,
        true,
        false
      )
    ).resolves.toEqual('22.3.4');

    expect(infoSpy).toHaveBeenCalledWith(
      'Failed to resolve GraalPy 22.3.4 from manifest'
    );
  });

  it('found and install successfully, pre-release fallback', async () => {
    spyCacheDir = tc.cacheDir as jest.Mock;
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'GraalPy', '24.1', architecture)
    );
    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);
    await expect(
      finder.findGraalPyVersion(
        'graalpy24.1',
        architecture,
        false,
        false,
        false
      )
    ).rejects.toThrow();
    await expect(
      finder.findGraalPyVersion('graalpy24.1', architecture, false, false, true)
    ).resolves.toEqual('24.1.0-ea.9');
  });
});
