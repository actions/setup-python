import sys
if __name__ == '__main__':
    print(f"Using GIL: {sys._is_gil_enabled()}\n")