import os
import sys
import re

def build_expected_path(python_version, architecture, freethreaded):
    print("Inputs received:")
    print(f"  Python Version  : {python_version}")
    print(f"  Architecture    : {architecture}")
    print(f"  Freethreaded    : {freethreaded}")

    # Extract major and minor from version like "3.13.1" or "3.14.0-beta.2"
    match = re.match(r"^(\d+)\.(\d+)", python_version)
    if not match:
        print(f"Invalid python version format: {python_version}")
        sys.exit(1)

    major, minor = match.groups()
    version_suffix = f"{major}{minor}"

    if freethreaded == "true":
        version_suffix += "t"
        if architecture == "x86":
            version_suffix += "-32"
        elif architecture == "arm64":
            version_suffix += "-arm64"
    else:
        if architecture == "x86":
            version_suffix += "-32"
        elif architecture == "arm64":
            version_suffix += "-arm64"

    base_path = os.getenv("APPDATA", "")
    full_path = os.path.join(base_path, "Python", f"Python{version_suffix}", "Scripts")
    print(f"Constructed expected path: {full_path}")
    return full_path

def main():
    if len(sys.argv) != 4:
        print("Usage: python verify_windows_install_path.py <python_version> <architecture> <freethreaded>")
        sys.exit(1)

    python_version = sys.argv[1]
    architecture = sys.argv[2]
    freethreaded = sys.argv[3]

    expected_path = build_expected_path(python_version, architecture, freethreaded)

    print("Validating against PATH environment variable...")
    path_env = os.getenv("PATH", "")
    if expected_path.lower() in path_env.lower():
        print("Correct path present in PATH")
    else:
        print("Expected path not found in PATH")
        sys.exit(1)

if __name__ == "__main__":
    main()