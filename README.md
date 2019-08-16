# setup-python

<p align="left">
  <a href="https://github.com/actions/setup-python"><img alt="GitHub Actions status" src="https://github.com/actions/setup-python/workflows/Main%20workflow/badge.svg"></a>
</p>

This action sets up a python environment for use in actions by:

- optionally installing a version of python and adding to PATH. Note that this action only uses versions of Python already installed in the cache. The action will fail if no matching versions are found.
- registering problem matchers for error output

# Usage

See [action.yml](action.yml)

Basic:
```yaml
steps:
- uses: actions/checkout@master
- uses: actions/setup-python@v1
  with:
    python-version: '3.x' # Version range or exact version of a Python version to use, using semvers version range syntax.
    architecture: 'x64' # (x64 or x86)
- run: python my_script.py
```

Matrix Testing:
```yaml
jobs:
  build:
    runs-on: ubuntu-16.04
    strategy:
      matrix:
        python: [ '2.x', '3.x', 'pypy3' ]
    name: Python ${{ matrix.python }} sample
    steps:
      - uses: actions/checkout@master
      - name: Setup python
        uses: actions/setup-python@v1
        with:
          python-version: ${{ matrix.python }}
          architecture: x64
      - run: python my_script.py
```

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)

# Contributions

Contributions are welcome!  See [Contributor's Guide](docs/contributors.md)
