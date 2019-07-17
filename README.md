# setup-python

This action sets up a python environment for use in actions by:

- optionally downloading and caching a version of python by version and adding to PATH
- registering problem matchers for error output

# Usage

See [action.yml](action.yml)

Basic:
```yaml
actions:
- uses: actions/setup-python@latest
  with:
    version: 3.x // Version range or exact version of a Python version to use, using semvers version range syntax.
    architecture: x64 // (x64 or x86)
- run: python my_script.py
```

Matrix Testing:
```yaml
jobs:
  build:
    strategy:
      matrix:
        python: [ 2.x, 3.x, pypy3 ]
    name: Python ${{ matrix.python }} sample
    actions:
      - name: Setup python
        uses: actions/setup-python@latest
        with:
          version: ${{ matrix.python }}
          architecture: x64
      - run: python my_script.py
```

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)

# Contributions

Contributions are welcome!  See [Contributor's Guide](docs/contributors.md)
