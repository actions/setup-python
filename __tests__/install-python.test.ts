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

  it('should return manifest from repo', async () => {
    (tc.getManifestFromRepo as jest.Mock).mockResolvedValue(mockManifest);
    const manifest = await getManifest();
    expect(manifest).toEqual(mockManifest);
  });

  it('should return manifest from URL if repo fetch fails', async () => {
    (tc.getManifestFromRepo as jest.Mock).mockRejectedValue(
      new Error('Fetch failed')
    );
    (httpm.HttpClient.prototype.getJson as jest.Mock).mockResolvedValue({
      result: mockManifest
    });
    const manifest = await getManifest();
    expect(manifest).toEqual(mockManifest);
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
