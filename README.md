# setup-python

<p align="left">
  <a href="https://github.com/actions/setup-python"><img alt="GitHub Actions status" src="https://github.com/actions/setup-python/workflows/Main%20workflow/badge.svg"></a>
</p>

This action sets up a Python environment for use in actions by:

- optionally installing a version of Python and adding to PATH. Note that this action only uses versions of Python already installed in the cache. The action will fail if no matching versions are found.
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

# Getting started with Python + Actions

Check out our detailed guide on using [Python with GitHub Actions](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/using-python-with-github-actions).

# Hosted Tool Cache

GitHub hosted runners have a tools cache that comes with Python + PyPy already installed. This tools cache helps speed up runs and tool setup by not requiring any new downloads. There is an environment variable called `RUNNER_TOOL_CACHE` on each runner that describes the location of this tools cache and there is where you will find Python and PyPy installed. `setup-python` works by taking a specific version of Python or PyPy in this tools cache and adding it to PATH.

|| Location |
|------|-------|
|**Tool Cache Directory** |`RUNNER_TOOL_CACHE`|
|**Python Tool Cache**|`RUNNER_TOOL_CACHE/Python/*`|
|**PyPy Tool Cache**|`RUNNER_TOOL_CACHE/PyPy/*`|

GitHub virtual environments are setup in [actions/virtual-environments](https://github.com/actions/virtual-environments). During the setup, the available versions of Python and PyPy are automatically downloaded, setup and documented.
- [Tools cache setup for Ubuntu](https://github.com/actions/virtual-environments/blob/master/images/linux/scripts/installers/hosted-tool-cache.sh)
- [Tools cache setup for Windows](https://github.com/actions/virtual-environments/blob/master/images/win/scripts/Installers/Download-ToolCache.ps1)

# Using `setup-python` with a self hosted runner

If you would like to use `setup-python` on a self-hosted runner, you will need to download all versions of Python & PyPy that you would like and setup a similar tools cache locally for your runner.

- Create an global environment variable called `AGENT_TOOLSDIRECTORY` that will point to the root directory of where you want the tools installed. The env variable is preferrably global as it must be set in the shell that will install the tools cache, along with the shell that the runner will be using.
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

# Available versions of Python

For detailed information regarding the available versions of Python that are installed see [Software installed on GitHub-hosted runners](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/software-installed-on-github-hosted-runners)

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)

# Contributions

Contributions are welcome!  See [Contributor's Guide](docs/contributors.md)
