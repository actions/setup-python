#!/bin/bash

set -euo pipefail

PYTHON_PATH="$1"
PATH_EXECUTABLE=$(python -c 'import sys; print(sys.executable)')
PYTHON_PATH_EXECUTABLE=$("${PYTHON_PATH}" -c 'import sys; print(sys.executable)')
if [ "${PATH_EXECUTABLE}" != "${PYTHON_PATH_EXECUTABLE}" ]; then
    echo "Executable mismatch."
    echo "python in PATH is: ${PATH_EXECUTABLE}"
    echo "python-path (${PYTHON_PATH}) is: ${PYTHON_PATH_EXECUTABLE}"
    exit 1
fi
echo "python-path: ${PYTHON_PATH}"
