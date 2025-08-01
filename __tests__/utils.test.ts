import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as io from '@actions/io';

import fs from 'fs';
import path from 'path';

import {
  validateVersion,
  validatePythonVersionFormatForPyPy,
  isCacheFeatureAvailable,
  getVersionInputFromFile,
  getVersionsInputFromPlainFile,
  getVersionInputFromTomlFile,
  getVersionInputFromPipfileFile,
  getNextPageUrl,
  isGhes,
  IS_WINDOWS,
  getDownloadFileName,
  getVersionInputFromToolVersions
} from '../src/utils';

jest.mock('@actions/cache');
jest.mock('@actions/core');

describe('validatePythonVersionFormatForPyPy', () => {
  it.each([
    ['3.12', true],
    ['3.13', true],
    ['3.12.x', false],
    ['3.13.x', false],
    ['3.x', false],
    ['3', false]
  ])('%s -> %s', (input, expected) => {
    expect(validatePythonVersionFormatForPyPy(input)).toEqual(expected);
  });
});

describe('validateVersion', () => {
  it.each([
    ['v7.3.3', true],
    ['v7.3.x', true],
    ['v7.x', true],
    ['x', true],
    ['v7.3.3-rc.1', true],
    ['nightly', true],
    ['v7.3.b', false],
    ['3.6', true],
    ['3.b', false],
    ['3', true]
  ])('%s -> %s', (input, expected) => {
    expect(validateVersion(input)).toEqual(expected);
  });
});

describe('isCacheFeatureAvailable', () => {
  it('isCacheFeatureAvailable disabled on GHES', () => {
    jest.spyOn(cache, 'isFeatureAvailable').mockImplementation(() => false);
    const infoMock = jest.spyOn(core, 'warning');
    const message =
      'Caching is only supported on GHES version >= 3.5. If you are on a version >= 3.5, please check with your GHES admin if the Actions cache service is enabled or not.';
    try {
      process.env['GITHUB_SERVER_URL'] = 'http://example.com';
      expect(isCacheFeatureAvailable()).toBeFalsy();
      expect(infoMock).toHaveBeenCalledWith(message);
    } finally {
      delete process.env['GITHUB_SERVER_URL'];
    }
  });

  it('isCacheFeatureAvailable disabled on dotcom', () => {
    jest.spyOn(cache, 'isFeatureAvailable').mockImplementation(() => false);
    const infoMock = jest.spyOn(core, 'warning');
    const message =
      'The runner was not able to contact the cache service. Caching will be skipped';
    try {
      process.env['GITHUB_SERVER_URL'] = 'http://github.com';
      expect(isCacheFeatureAvailable()).toBe(false);
      expect(infoMock).toHaveBeenCalledWith(message);
    } finally {
      delete process.env['GITHUB_SERVER_URL'];
    }
  });

  it('isCacheFeatureAvailable is enabled', () => {
    jest.spyOn(cache, 'isFeatureAvailable').mockImplementation(() => true);
    expect(isCacheFeatureAvailable()).toBe(true);
  });
});

const tempDir = path.join(
  __dirname,
  'runner',
  path.join(Math.random().toString(36).substring(7)),
  'temp'
);

describe('Version from file test', () => {
  it.each([getVersionsInputFromPlainFile, getVersionInputFromFile])(
    'Version from plain file test',
    async _fn => {
      await io.mkdirP(tempDir);
      const pythonVersionFileName = 'python-version.file';
      const pythonVersionFilePath = path.join(tempDir, pythonVersionFileName);
      const pythonVersionFileContent = '3.13';
      fs.writeFileSync(pythonVersionFilePath, pythonVersionFileContent);
      expect(_fn(pythonVersionFilePath)).toEqual([pythonVersionFileContent]);
    }
  );
  it.each([getVersionsInputFromPlainFile, getVersionInputFromFile])(
    'Versions from multiline plain file test',
    async _fn => {
      await io.mkdirP(tempDir);
      const pythonVersionFileName = 'python-version.file';
      const pythonVersionFilePath = path.join(tempDir, pythonVersionFileName);
      const pythonVersionFileContent = '3.13\r\n3.12';
      fs.writeFileSync(pythonVersionFilePath, pythonVersionFileContent);
      expect(_fn(pythonVersionFilePath)).toEqual(['3.13', '3.12']);
    }
  );
  it.each([getVersionsInputFromPlainFile, getVersionInputFromFile])(
    'Version from complex plain file test',
    async _fn => {
      await io.mkdirP(tempDir);
      const pythonVersionFileName = 'python-version.file';
      const pythonVersionFilePath = path.join(tempDir, pythonVersionFileName);
      const pythonVersionFileContent =
        '3.13/envs/virtualenv\r# 3.12\n3.11\r\n3.10\r\n 3.9 \r\n';
      fs.writeFileSync(pythonVersionFilePath, pythonVersionFileContent);
      expect(_fn(pythonVersionFilePath)).toEqual([
        '3.13',
        '3.11',
        '3.10',
        '3.9'
      ]);
    }
  );
  it.each([getVersionInputFromTomlFile, getVersionInputFromFile])(
    'Version from standard pyproject.toml test',
    async _fn => {
      await io.mkdirP(tempDir);
      const pythonVersionFileName = 'pyproject.toml';
      const pythonVersionFilePath = path.join(tempDir, pythonVersionFileName);
      const pythonVersion = '>=3.13.0';
      const pythonVersionFileContent = `[project]\nrequires-python = "${pythonVersion}"`;
      fs.writeFileSync(pythonVersionFilePath, pythonVersionFileContent);
      expect(_fn(pythonVersionFilePath)).toEqual([pythonVersion]);
    }
  );
  it.each([getVersionInputFromTomlFile, getVersionInputFromFile])(
    'Version from poetry pyproject.toml test',
    async _fn => {
      await io.mkdirP(tempDir);
      const pythonVersionFileName = 'pyproject.toml';
      const pythonVersionFilePath = path.join(tempDir, pythonVersionFileName);
      const pythonVersion = '>=3.13.0';
      const pythonVersionFileContent = `[tool.poetry.dependencies]\npython = "${pythonVersion}"`;
      fs.writeFileSync(pythonVersionFilePath, pythonVersionFileContent);
      expect(_fn(pythonVersionFilePath)).toEqual([pythonVersion]);
    }
  );
  it.each([getVersionInputFromTomlFile, getVersionInputFromFile])(
    'Version undefined',
    async _fn => {
      await io.mkdirP(tempDir);
      const pythonVersionFileName = 'pyproject.toml';
      const pythonVersionFilePath = path.join(tempDir, pythonVersionFileName);
      fs.writeFileSync(pythonVersionFilePath, ``);
      expect(_fn(pythonVersionFilePath)).toEqual([]);
    }
  );
  it.each([getVersionInputFromToolVersions])(
    'Version from .tool-versions',
    async _fn => {
      const toolVersionFileName = '.tool-versions';
      const toolVersionFilePath = path.join(tempDir, toolVersionFileName);
      const toolVersionContent = 'python 3.13.2\nnodejs 16';
      fs.writeFileSync(toolVersionFilePath, toolVersionContent);
      expect(_fn(toolVersionFilePath)).toEqual(['3.13.2']);
    }
  );

  it.each([getVersionInputFromToolVersions])(
    'Version from .tool-versions with comment',
    async _fn => {
      const toolVersionFileName = '.tool-versions';
      const toolVersionFilePath = path.join(tempDir, toolVersionFileName);
      const toolVersionContent = '# python 3.13\npython 3.12';
      fs.writeFileSync(toolVersionFilePath, toolVersionContent);
      expect(_fn(toolVersionFilePath)).toEqual(['3.12']);
    }
  );

  it.each([getVersionInputFromToolVersions])(
    'Version from .tool-versions with whitespace',
    async _fn => {
      const toolVersionFileName = '.tool-versions';
      const toolVersionFilePath = path.join(tempDir, toolVersionFileName);
      const toolVersionContent = '  python   3.13  ';
      fs.writeFileSync(toolVersionFilePath, toolVersionContent);
      expect(_fn(toolVersionFilePath)).toEqual(['3.13']);
    }
  );

  it.each([getVersionInputFromToolVersions])(
    'Version from .tool-versions with v prefix',
    async _fn => {
      const toolVersionFileName = '.tool-versions';
      const toolVersionFilePath = path.join(tempDir, toolVersionFileName);
      const toolVersionContent = 'python v3.13.2';
      fs.writeFileSync(toolVersionFilePath, toolVersionContent);
      expect(_fn(toolVersionFilePath)).toEqual(['3.13.2']);
    }
  );

  it.each([getVersionInputFromToolVersions])(
    'Version from .tool-versions with pypy version',
    async _fn => {
      const toolVersionFileName = '.tool-versions';
      const toolVersionFilePath = path.join(tempDir, toolVersionFileName);
      const toolVersionContent = 'python pypy3.10-7.3.19';
      fs.writeFileSync(toolVersionFilePath, toolVersionContent);
      expect(_fn(toolVersionFilePath)).toEqual(['pypy3.10-7.3.19']);
    }
  );

  it.each([getVersionInputFromToolVersions])(
    'Version from .tool-versions with alpha Releases',
    async _fn => {
      const toolVersionFileName = '.tool-versions';
      const toolVersionFilePath = path.join(tempDir, toolVersionFileName);
      const toolVersionContent = 'python 3.14.0a5t';
      fs.writeFileSync(toolVersionFilePath, toolVersionContent);
      expect(_fn(toolVersionFilePath)).toEqual(['3.14.0a5t']);
    }
  );

  it.each([getVersionInputFromToolVersions])(
    'Version from .tool-versions with dev suffix',
    async _fn => {
      const toolVersionFileName = '.tool-versions';
      const toolVersionFilePath = path.join(tempDir, toolVersionFileName);
      const toolVersionContent = 'python 3.14t-dev';
      fs.writeFileSync(toolVersionFilePath, toolVersionContent);
      expect(_fn(toolVersionFilePath)).toEqual(['3.14t-dev']);
    }
  );

  it.each([getVersionInputFromPipfileFile, getVersionInputFromFile])(
    'Version from python_version in Pipfile',
    async _fn => {
      await io.mkdirP(tempDir);
      const pythonVersionFileName = 'Pipfile';
      const pythonVersionFilePath = path.join(tempDir, pythonVersionFileName);
      const pythonVersion = '3.13';
      const pythonVersionFileContent = `[requires]\npython_version = "${pythonVersion}"`;
      fs.writeFileSync(pythonVersionFilePath, pythonVersionFileContent);
      expect(_fn(pythonVersionFilePath)).toEqual([pythonVersion]);
    }
  );

  it.each([getVersionInputFromPipfileFile, getVersionInputFromFile])(
    'Version from python_full_version in Pipfile',
    async _fn => {
      await io.mkdirP(tempDir);
      const pythonVersionFileName = 'Pipfile';
      const pythonVersionFilePath = path.join(tempDir, pythonVersionFileName);
      const pythonVersion = '3.13.0';
      const pythonVersionFileContent = `[requires]\npython_full_version = "${pythonVersion}"`;
      fs.writeFileSync(pythonVersionFilePath, pythonVersionFileContent);
      expect(_fn(pythonVersionFilePath)).toEqual([pythonVersion]);
    }
  );

  it.each([getVersionInputFromPipfileFile, getVersionInputFromFile])(
    'Pipfile undefined version',
    async _fn => {
      await io.mkdirP(tempDir);
      const pythonVersionFileName = 'Pipfile';
      const pythonVersionFilePath = path.join(tempDir, pythonVersionFileName);
      const pythonVersionFileContent = ``;
      fs.writeFileSync(pythonVersionFilePath, pythonVersionFileContent);
      expect(_fn(pythonVersionFilePath)).toEqual([]);
    }
  );
});

describe('getNextPageUrl', () => {
  it('GitHub API pagination next page is parsed correctly', () => {
    function generateResponse(link: string) {
      return {
        statusCode: 200,
        result: null,
        headers: {
          link: link
        }
      };
    }
    const page1Links =
      '<https://api.github.com/repositories/129883600/releases?page=2>; rel="next", <https://api.github.com/repositories/129883600/releases?page=3>; rel="last"';
    expect(getNextPageUrl(generateResponse(page1Links))).toStrictEqual(
      'https://api.github.com/repositories/129883600/releases?page=2'
    );
    const page2Links =
      '<https://api.github.com/repositories/129883600/releases?page=1>; rel="prev", <https://api.github.com/repositories/129883600/releases?page=1>; rel="first"';
    expect(getNextPageUrl(generateResponse(page2Links))).toBeNull();
  });
});

describe('getDownloadFileName', () => {
  const originalEnv = process.env;
  const tempDir = path.join(__dirname, 'runner', 'temp');

  beforeEach(() => {
    process.env = {...originalEnv};
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return the correct path on Windows', () => {
    if (IS_WINDOWS) {
      process.env['RUNNER_TEMP'] = tempDir;
      const downloadUrl =
        'https://github.com/actions/sometool/releases/tag/1.2.3-20200402.6/sometool-1.2.3-win32-x64.zip';
      const expectedPath = path.join(
        process.env.RUNNER_TEMP,
        path.basename(downloadUrl)
      );
      expect(getDownloadFileName(downloadUrl)).toBe(expectedPath);
    }
  });

  it('should return undefined on non-Windows', () => {
    if (!IS_WINDOWS) {
      const downloadUrl =
        'https://github.com/actions/sometool/releases/tag/1.2.3-20200402.6/sometool-1.2.3-linux-x64.tar.gz';
      expect(getDownloadFileName(downloadUrl)).toBeUndefined();
    }
  });
});

describe('isGhes', () => {
  const pristineEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {...pristineEnv};
  });

  afterAll(() => {
    process.env = pristineEnv;
  });

  it('returns false when the GITHUB_SERVER_URL environment variable is not defined', async () => {
    delete process.env['GITHUB_SERVER_URL'];
    expect(isGhes()).toBeFalsy();
  });

  it('returns false when the GITHUB_SERVER_URL environment variable is set to github.com', async () => {
    process.env['GITHUB_SERVER_URL'] = 'https://github.com';
    expect(isGhes()).toBeFalsy();
  });

  it('returns false when the GITHUB_SERVER_URL environment variable is set to a GitHub Enterprise Cloud-style URL', async () => {
    process.env['GITHUB_SERVER_URL'] = 'https://contoso.ghe.com';
    expect(isGhes()).toBeFalsy();
  });

  it('returns false when the GITHUB_SERVER_URL environment variable has a .localhost suffix', async () => {
    process.env['GITHUB_SERVER_URL'] = 'https://mock-github.localhost';
    expect(isGhes()).toBeFalsy();
  });

  it('returns true when the GITHUB_SERVER_URL environment variable is set to some other URL', async () => {
    process.env['GITHUB_SERVER_URL'] = 'https://src.onpremise.fabrikam.com';
    expect(isGhes()).toBeTruthy();
  });
});
