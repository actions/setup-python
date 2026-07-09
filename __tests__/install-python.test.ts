import {
  getManifest,
  getManifestFromRepo,
  getManifestFromURL
} from '../src/install-python';
import * as httpm from '@actions/http-client';
import * as tc from '@actions/tool-cache';

jest.mock('@actions/http-client');
jest.mock('@actions/tool-cache');
jest.mock('@actions/tool-cache', () => ({
  getManifestFromRepo: jest.fn()
}));
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

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return manifest from repo', async () => {
    (tc.getManifestFromRepo as jest.Mock).mockResolvedValue(mockManifest);
    const manifest = await getManifest();
    expect(manifest).toEqual(mockManifest);
  });

  it('should return manifest from URL if repo fetch fails', async () => {
    jest.useFakeTimers();
    (tc.getManifestFromRepo as jest.Mock).mockRejectedValue(
      new Error('Fetch failed')
    );
    (httpm.HttpClient.prototype.getJson as jest.Mock).mockResolvedValue({
      result: mockManifest
    });
    const promise = getManifest();
    await jest.runAllTimersAsync();
    const manifest = await promise;
    expect(manifest).toEqual(mockManifest);
  });

  it('should fall back to URL if repo returns a truncated/empty manifest', async () => {
    jest.useFakeTimers();
    (tc.getManifestFromRepo as jest.Mock).mockResolvedValue([]);
    (httpm.HttpClient.prototype.getJson as jest.Mock).mockResolvedValue({
      result: mockManifest
    });
    const promise = getManifest();
    await jest.runAllTimersAsync();
    const manifest = await promise;
    expect(manifest).toEqual(mockManifest);
  });

  it('should retry on a transient invalid manifest and then succeed', async () => {
    jest.useFakeTimers();
    (tc.getManifestFromRepo as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(mockManifest);
    const promise = getManifest();
    await jest.runAllTimersAsync();
    const manifest = await promise;
    expect(manifest).toEqual(mockManifest);
    expect(tc.getManifestFromRepo as jest.Mock).toHaveBeenCalledTimes(2);
  });

  it('should fail loudly when the manifest is truncated/empty on every source', async () => {
    jest.useFakeTimers();
    (tc.getManifestFromRepo as jest.Mock).mockResolvedValue([]);
    (httpm.HttpClient.prototype.getJson as jest.Mock).mockResolvedValue({
      result: []
    });
    const promise = getManifest();
    // Prevent unhandled rejection before timers advance.
    const catchPromise = promise.catch(() => {});
    await jest.runAllTimersAsync();
    await catchPromise;
    await expect(promise).rejects.toThrow(
      'Failed to fetch the Python versions manifest'
    );
  });

  it('should not retry the API on a rate-limit error and fall back to URL immediately', async () => {
    const rateLimitError = Object.assign(new Error('API rate limit exceeded'), {
      httpStatusCode: 403
    });
    (tc.getManifestFromRepo as jest.Mock).mockRejectedValue(rateLimitError);
    (httpm.HttpClient.prototype.getJson as jest.Mock).mockResolvedValue({
      result: mockManifest
    });
    const manifest = await getManifest();
    expect(manifest).toEqual(mockManifest);
    expect(tc.getManifestFromRepo as jest.Mock).toHaveBeenCalledTimes(1);
  });
});

describe('getManifestFromRepo', () => {
  it('should return manifest from repo', async () => {
    (tc.getManifestFromRepo as jest.Mock).mockResolvedValue(mockManifest);
    const manifest = await getManifestFromRepo();
    expect(manifest).toEqual(mockManifest);
  });
});

describe('getManifestFromURL', () => {
  it('should return manifest from URL', async () => {
    (httpm.HttpClient.prototype.getJson as jest.Mock).mockResolvedValue({
      result: mockManifest
    });
    const manifest = await getManifestFromURL();
    expect(manifest).toEqual(mockManifest);
  });

  it('should throw error if unable to get manifest from URL', async () => {
    (httpm.HttpClient.prototype.getJson as jest.Mock).mockResolvedValue({
      result: null
    });
    await expect(getManifestFromURL()).rejects.toThrow(
      'Unable to get manifest from'
    );
  });
});
