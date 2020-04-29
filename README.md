# setup-python

<p align="left">
  <a href="https://github.com/actions/setup-python"><img alt="GitHub Actions status" src="https://github.com/actions/setup-python/workflows/Main%20workflow/badge.svg"></a>
</p>

This action sets up a Python environment for use in actions by:

- optionally installing and adding to PATH a version of Python that is already installed in the tools cache
- downloading, installing and adding to PATH an available version of Python from GitHub Releases ([actions/python-versions](https://github.com/actions/python-versions/releases)) if a specific version is not available in the tools cache
- failing if a specific version of Python is not preinstalled or available for download
- registering problem matchers for error output

# Usage

See [action.yml](action.yml)

Basic:
```yaml
steps:
- uses: actions/checkout@v2
- uses: actions/setup-python@v1
  with:
    python-version: '3.x' # Version range or exact version of a Python version to use, using SemVer's version range syntax
    architecture: 'x64' # optional x64 or x86. Defaults to x64 if not specified
- run: python my_script.py
```

Matrix Testing:
```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: [ '2.x', '3.x', 'pypy2', 'pypy3' ]
    name: Python ${{ matrix.python-version }} sample
    steps:
      - uses: actions/checkout@v2
      - name: Setup python
        uses: actions/setup-python@v1
        with:
          python-version: ${{ matrix.python-version }}
          architecture: x64
      - run: python my_script.py
```

Exclude a specific Python version:
```yaml
jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        python-version: [2.7, 3.6, 3.7, 3.8, pypy2, pypy3]
        exclude:
          - os: macos-latest
            python-version: 3.8
          - os: windows-latest
            python-version: 3.6
    steps:
      - uses: actions/checkout@v2
      - name: Set up Python
        uses: actions/setup-python@v1
        with:
          python-version: ${{ matrix.python-version }}
      - name: Display Python version
        run: python -c "import sys; print(sys.version)"
```

Download and setup a version of Python that does not come pre-installed on an image:
```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
        python-version: [3.5.4, 3.6.6, 3.7.4, 3.8.1]
    steps:
    - uses: actions/checkout@v2
    - uses: actions/setup-python@v1
      with:
        python-version: ${{ matrix.python }}
    - run: python my_script.py

```

# Getting started with Python + Actions

Check out our detailed guide on using [Python with GitHub Actions](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/using-python-with-github-actions).

# Available versions of Python

`setup-python` is able to configure python from two sources

- Preinstalled versions of Python in the tools cache on GitHub-hosted runners
    - For detailed information regarding the available versions of Python that are installed see [Software installed on GitHub-hosted runners](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/software-installed-on-github-hosted-runners)
    - For every minor version of Python, expect only the latest patch to be preinstalled. See [Semantic Versioning](https://semver.org/) for more information
    - If `3.8.1` is installed for example, and `3.8.2` is released, expect `3.8.1` to be removed and replaced by `3.8.2` in the tools cache
- Downloadable Python versions from GitHub Releases ([actions/python-versions](https://github.com/actions/python-versions/releases))
    - All available versions are listed in the [version-manifest.json](https://github.com/actions/python-versions/blob/master/versions-manifest.json) file
    - If there is a specific version of Python that is not available, you can open an issue in the `python-versions` repository 

# Hosted Tool Cache

GitHub hosted runners have a tools cache that comes with a few versions of Python + PyPy already installed. This tools cache helps speed up runs and tool setup by not requiring any new downloads. There is an environment variable called `RUNNER_TOOL_CACHE` on each runner that describes the location of this tools cache and there is where you will find Python and PyPy installed. `setup-python` works by taking a specific version of Python or PyPy in this tools cache and adding it to PATH.

|| Location |
|------|-------|
|**Tool Cache Directory** |`RUNNER_TOOL_CACHE`|
|**Python Tool Cache**|`RUNNER_TOOL_CACHE/Python/*`|
|**PyPy Tool Cache**|`RUNNER_TOOL_CACHE/PyPy/*`|

GitHub virtual environments are setup in [actions/virtual-environments](https://github.com/actions/virtual-environments). During the setup, the available versions of Python and PyPy are automatically downloaded, setup and documented.
- [Tools cache setup for Ubuntu](https://github.com/actions/virtual-environments/blob/master/images/linux/scripts/installers/hosted-tool-cache.sh)
- [Tools cache setup for Windows](https://github.com/actions/virtual-environments/blob/master/images/win/scripts/Installers/Download-ToolCache.ps1)

# Using `setup-python` with a self hosted runner

If you would like to use `setup-python` and a self-hosted runner, you have two options
  - Setup a tools cache locally and download all the versions of Python & PyPy that you would like once
      - Takes a little bit to time to initially setup
      - This will be the most stable and fastest option long-term as it will require no extra downloads every-time there is a run
  - Download and setup a version of python every-time
      - Requires no extra setup (good if you want to quickly get up and running, discouraged for long term use)
      - `setup-python` will take a little longer to run
      - Note: when downloading versions of Python for Windows, an MSI installer is used which can modify some registry settings

### Setting up a local tools cache

- Create an global environment variable called `AGENT_TOOLSDIRECTORY` that will point to the root directory of where you want the tools installed. The env variable is preferably global as it must be set in the shell that will install the tools cache, along with the shell that the runner will be using.
    - This env variable is used internally by the runner to set the `RUNNER_TOOL_CACHE` env variable
    - Example for Administrator Powershell: `[System.Environment]::SetEnvironmentVariable("AGENT_TOOLSDIRECTORY", "C:\hostedtoolcache\windows", [System.EnvironmentVariableTarget]::Machine)` (restart the shell afterwards)
-  Download the appropriate NPM packages from the [GitHub Actions NPM registry](https://github.com/orgs/actions/packages)
    - Make sure to have `npm` installed, and then [configure npm for use with GitHub packages](https://help.github.com/en/packages/using-github-packages-with-your-projects-ecosystem/configuring-npm-for-use-with-github-packages#authenticating-to-github-package-registry)
    - Create an empty npm project for easier installation (`npm init`) in the tools cache directory. You can delete `package.json`, `package.lock.json` and `node_modules` after all tools get installed
    - Before downloading a specific package, create an empty folder for the version of Python/PyPY that is being installed. If downloading Python 3.6.8 for example, create `C:\hostedtoolcache\windows\Python\3.6.8`
    - Once configured, download a specific package by calling `npm install`. Note (if downloading a PyPy package on Windows, you will need 7zip installed along with `7z.exe` added to your PATH)
- Each NPM package has multiple versions that determine the version of Python or PyPy that should be installed. 
    - `npm install @actions/toolcache-python-windows-x64@3.7.61579791175` for example installs Python 3.7.6 while `npm install @actions/toolcache-python-windows-x64@3.6.81579791177` installs Python 3.6.8
    - You can browse and find all available versions of a package by searching the GitHub Actions NPM registry
![image](https://user-images.githubusercontent.com/16109154/76194005-87aeb400-61e5-11ea-9b21-ef9111247f84.png)

# Using Python without `setup-python`

`setup-python` helps keep your dependencies explicit and ensures consistent behavior between different runners. If you use `python` in a shell on a GitHub hosted runner without `setup-python` it will default to whatever is in PATH. The default version of Python in PATH vary between runners and can change unexpectedly so we recommend you always use `setup-python`.

# Need to open an issue?

Python versions that we compile and setup can be found in the [actions/python-versions](https://github.com/actions/python-versions) repository. You can see the build scripts, configurations, and everything that is used. You should open an issue in the `python-versions` repository if:
  - something might be compiled incorrectly
  - certain modules might be missing
  - there is a version of Python that you would like that is currently not available

If you suspect something might be wrong with the tools cache or how Python gets installed on GitHub hosted runners, please open an issue in [actions/virtual-environments](https://github.com/actions/virtual-environments)

Any remaining issues can be filed in this repository

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)

# Contributions

Contributions are welcome! See our [Contributor's Guide](docs/contributors.md)
