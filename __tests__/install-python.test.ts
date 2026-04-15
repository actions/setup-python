import {
  getManifest,
  getManifestFromRepo,
  getManifestFromURL,
  installCpythonFromRelease
} from '../src/install-python';
import * as httpm from '@actions/http-client';
import * as tc from '@actions/tool-cache';

jest.mock('@actions/http-client');
jest.mock('@actions/tool-cache', () => ({
  getManifestFromRepo: jest.fn(),
  downloadTool: jest.fn(),
  extractTar: jest.fn(),
  extractZip: jest.fn(),
  HTTPError: class HTTPError extends Error {}
}));
jest.mock('@actions/exec', () => ({
  exec: jest.fn().mockResolvedValue(0)
}));
jest.mock('../src/utils', () => ({
  ...jest.requireActual('../src/utils'),
  IS_WINDOWS: false,
  IS_LINUX: false
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

function setInputs(values: Record<string, string | undefined>) {
  for (const key of ['TOKEN', 'MIRROR', 'MIRROR-TOKEN']) {
    delete process.env[`INPUT_${key}`];
  }
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined) {
      process.env[`INPUT_${k.toUpperCase()}`] = v;
    }
  }
}

beforeEach(() => {
  jest.resetAllMocks();
  setInputs({});
});

afterAll(() => {
  setInputs({});
});

describe('getManifest', () => {
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
  it('default mirror calls getManifestFromRepo with actions/python-versions@main and token', async () => {
    setInputs({token: 'TKN'});
    (tc.getManifestFromRepo as jest.Mock).mockResolvedValue(mockManifest);
    await getManifestFromRepo();
    expect(tc.getManifestFromRepo).toHaveBeenCalledWith(
      'actions',
      'python-versions',
      'token TKN',
      'main'
    );
  });

  it('custom raw mirror extracts owner/repo/branch and passes token', async () => {
    setInputs({
      token: 'TKN',
      mirror: 'https://raw.githubusercontent.com/foo/bar/dev'
    });
    (tc.getManifestFromRepo as jest.Mock).mockResolvedValue(mockManifest);
    await getManifestFromRepo();
    expect(tc.getManifestFromRepo).toHaveBeenCalledWith(
      'foo',
      'bar',
      'token TKN',
      'dev'
    );
  });

  it('custom non-GitHub mirror throws (caller falls through to URL fetch)', () => {
    setInputs({mirror: 'https://mirror.example/py'});
    expect(() => getManifestFromRepo()).toThrow(/not a GitHub repo URL/);
  });

  it('mirror-token wins over token for the api.github.com call (getManifestFromRepo)', async () => {
    setInputs({
      token: 'TKN',
      'mirror-token': 'MTOK',
      mirror: 'https://raw.githubusercontent.com/foo/bar/main'
    });
    (tc.getManifestFromRepo as jest.Mock).mockResolvedValue(mockManifest);
    await getManifestFromRepo();
    expect(tc.getManifestFromRepo).toHaveBeenCalledWith(
      'foo',
      'bar',
      'token MTOK',
      'main'
    );
  });

  it('token is used when mirror-token is empty (getManifestFromRepo)', async () => {
    setInputs({
      token: 'TKN',
      mirror: 'https://raw.githubusercontent.com/foo/bar/main'
    });
    (tc.getManifestFromRepo as jest.Mock).mockResolvedValue(mockManifest);
    await getManifestFromRepo();
    expect(tc.getManifestFromRepo).toHaveBeenCalledWith(
      'foo',
      'bar',
      'token TKN',
      'main'
    );
  });

  it('trailing slashes in mirror URL are stripped', async () => {
    setInputs({
      token: 'TKN',
      mirror: 'https://raw.githubusercontent.com/foo/bar/main/'
    });
    (tc.getManifestFromRepo as jest.Mock).mockResolvedValue(mockManifest);
    await getManifestFromRepo();
    expect(tc.getManifestFromRepo).toHaveBeenCalledWith(
      'foo',
      'bar',
      'token TKN',
      'main'
    );
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

  it('fetches from {mirror}/versions-manifest.json (no auth header attached)', async () => {
    setInputs({token: 'TKN', mirror: 'https://mirror.example/py'});
    (httpm.HttpClient.prototype.getJson as jest.Mock).mockResolvedValue({
      result: mockManifest
    });
    await getManifestFromURL();
    expect(httpm.HttpClient.prototype.getJson).toHaveBeenCalledWith(
      'https://mirror.example/py/versions-manifest.json'
    );
  });
});

describe('mirror URL validation', () => {
  it('throws on invalid URL when used', () => {
    setInputs({mirror: 'not a url'});
    expect(() => getManifestFromRepo()).toThrow(/Invalid 'mirror' URL/);
  });
});

describe('installCpythonFromRelease auth gating', () => {
  const makeRelease = (downloadUrl: string) =>
    ({
      version: '3.12.0',
      stable: true,
      release_url: '',
      files: [
        {
          filename: 'python-3.12.0-linux-x64.tar.gz',
          platform: 'linux',
          platform_version: '',
          arch: 'x64',
          download_url: downloadUrl
        }
      ]
    }) as any;

  function stubInstallExtract() {
    (tc.downloadTool as jest.Mock).mockResolvedValue('/tmp/py.tgz');
    (tc.extractTar as jest.Mock).mockResolvedValue('/tmp/extracted');
  }

  it('forwards token to github.com download URLs', async () => {
    setInputs({token: 'TKN'});
    stubInstallExtract();
    await installCpythonFromRelease(
      makeRelease(
        'https://github.com/actions/python-versions/releases/download/3.12.0-x/python-3.12.0-linux-x64.tar.gz'
      )
    );
    expect(tc.downloadTool).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      'token TKN'
    );
  });

  it('forwards token to api.github.com URLs', async () => {
    setInputs({token: 'TKN'});
    stubInstallExtract();
    await installCpythonFromRelease(
      makeRelease('https://api.github.com/repos/x/y/tarball/main')
    );
    expect(tc.downloadTool).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      'token TKN'
    );
  });

  it('forwards token to objects.githubusercontent.com download URLs', async () => {
    setInputs({token: 'TKN'});
    stubInstallExtract();
    await installCpythonFromRelease(
      makeRelease('https://objects.githubusercontent.com/x/python.tar.gz')
    );
    expect(tc.downloadTool).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      'token TKN'
    );
  });

  it('does NOT forward token to non-GitHub download URLs', async () => {
    setInputs({token: 'TKN'});
    stubInstallExtract();
    await installCpythonFromRelease(
      makeRelease('https://cdn.example/py.tar.gz')
    );
    expect(tc.downloadTool).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      undefined
    );
  });

  it('forwards mirror-token to non-GitHub download URLs', async () => {
    setInputs({
      token: 'TKN',
      'mirror-token': 'MTOK',
      mirror: 'https://cdn.example'
    });
    stubInstallExtract();
    await installCpythonFromRelease(
      makeRelease('https://cdn.example/py.tar.gz')
    );
    expect(tc.downloadTool).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      'token MTOK'
    );
  });
});
