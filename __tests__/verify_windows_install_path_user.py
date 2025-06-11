import os
import sys

def build_expected_path(architecture, freethreaded):
    major = 3
    minor = 13
    version_suffix = f"{major}{minor}"

    if architecture == "x86" and (major > 3 or (major == 3 and minor >= 10)):
        version_suffix += "-32"
    elif architecture == "arm64":
        version_suffix += "-arm64"

    if freethreaded == "true":
        version_suffix += "t"
        if architecture == "x86":
            version_suffix += "-32"
        elif architecture == "arm64":
            version_suffix += "-arm64"

    base_path = os.getenv("APPDATA", "")
    return os.path.join(base_path, "Python", f"Python{version_suffix}", "Scripts")

def main():
    if len(sys.argv) != 3:
        print("Usage: python verify_windows_install_path.py <architecture> <freethreaded>")
        sys.exit(1)

    architecture = sys.argv[1]
    freethreaded = sys.argv[2]

    expected_path = build_expected_path(architecture, freethreaded)
    print(f"Expected PATH entry: {expected_path}")

    path_env = os.getenv("PATH", "")
    if expected_path.lower() not in path_env.lower():
        print("Expected path not found in PATH")
        sys.exit(1)
    else:
        print("Correct path present in PATH")

if __name__ == "__main__":
    main()