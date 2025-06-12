import os
import sys
import re

def build_expected_path(python_version, architecture, freethreaded):
    # Extract major and minor from full version like "3.13.1" or "3.14.0-beta.2"
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
    return os.path.join(base_path, "Python", f"Python{version_suffix}", "Scripts")

def main():
    if len(sys.argv) != 4:
        print("Usage: python verify_windows_install_path.py <python_version> <architecture> <freethreaded>")
        sys.exit(1)

    python_version = sys.argv[1]
    architecture = sys.argv[2]
    freethreaded = sys.argv[3]

    expected_path = build_expected_path(python_version, architecture, freethreaded)
    print(f"Expected PATH entry: {expected_path}")

    path_env = os.getenv("PATH", "")
    if expected_path.lower() not in path_env.lower():
        print("Expected path not found in PATH")
        sys.exit(1)
    else:
        print("Correct path present in PATH")

if __name__ == "__main__":
    main()