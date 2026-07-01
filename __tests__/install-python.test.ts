import {jest, describe, it, expect, beforeEach} from '@jest/globals';

class MockHttpClientError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'HttpClientError';
    this.statusCode = statusCode;
  }
}

// Mock @actions/http-client
jest.unstable_mockModule('@actions/http-client', () => ({
  HttpClient: jest.fn().mockImplementation(() => ({
    getJson: jest.fn()
  })),
  HttpClientError: MockHttpClientError,
  HttpCodes: {
    OK: 200,
    NotFound: 404,
    InternalServerError: 500
  }
}));

// Mock @actions/cache (needed transitively by utils.ts)
jest.unstable_mockModule('@actions/cache', () => ({
  saveCache: jest.fn(),
  restoreCache: jest.fn(),
  isFeatureAvailable: jest.fn()
}));

// Mock @actions/tool-cache
jest.unstable_mockModule('@actions/tool-cache', () => ({
  getManifestFromRepo: jest.fn()
}));

// Mock @actions/core (needed by install-python.ts)
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

// Mock @actions/exec (needed by install-python.ts)
jest.unstable_mockModule('@actions/exec', () => ({
  exec: jest.fn(),
  getExecOutput: jest.fn()
}));

// Dynamic imports after mocking
const httpm = await import('@actions/http-client');
const tc = await import('@actions/tool-cache');
const {getManifest, getManifestFromRepo, getManifestFromURL} =
  await import('../src/install-python.js');
const mockManifest = [
  {
    version: '1.0.0',
    stable: true,
    files: [
      {
        filename: 'tool-v1.0.0-linux-x64.tar.gz',
        platform: 'linux',
        arch: 'x64',
        download_url: 'https://example.com/tool-v1.0.0-linux-x64.tar.gz'
      }
    ]
  }
];

describe('getManifest', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return manifest from repo', async () => {
    (tc.getManifestFromRepo as jest.Mock<any>).mockResolvedValue(mockManifest);
    const manifest = await getManifest();
    expect(manifest).toEqual(mockManifest);
  });

  it('should return manifest from URL if repo fetch fails', async () => {
    (tc.getManifestFromRepo as jest.Mock<any>).mockRejectedValue(
      new Error('Fetch failed')
    );
    (httpm.HttpClient as jest.Mock<any>).mockImplementation(() => ({
      getJson: jest.fn(async () => ({result: mockManifest}))
    }));
    const manifest = await getManifest();
    expect(manifest).toEqual(mockManifest);
  });
});

describe('getManifestFromRepo', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return manifest from repo', async () => {
    (tc.getManifestFromRepo as jest.Mock<any>).mockResolvedValue(mockManifest);
    const manifest = await getManifestFromRepo();
    expect(manifest).toEqual(mockManifest);
  });
});

describe('getManifestFromURL', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return manifest from URL', async () => {
    (httpm.HttpClient as jest.Mock<any>).mockImplementation(() => ({
      getJson: jest.fn(async () => ({result: mockManifest}))
    }));
    const manifest = await getManifestFromURL();
    expect(manifest).toEqual(mockManifest);
  });

  it('should throw error if unable to get manifest from URL', async () => {
    (httpm.HttpClient as jest.Mock<any>).mockImplementation(() => ({
      getJson: jest.fn(async () => ({result: null}))
    }));
    await expect(getManifestFromURL()).rejects.toThrow(
      'Unable to get manifest from'
    );
  });
});
