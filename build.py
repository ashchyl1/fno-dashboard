#!/usr/bin/env python3
"""Alternative build script — cross-platform PyInstaller runner."""
import subprocess
import sys

cmd = [
    sys.executable, "-m", "PyInstaller",
    "--onefile",
    "--windowed",
    "--name", "SystemAudioRecorder",
    "--hidden-import", "pyaudiowpatch",
    "--hidden-import", "soundfile",
    "--hidden-import", "lameenc",
    "--hidden-import", "customtkinter",
    "--hidden-import", "numpy",
    "--collect-all", "customtkinter",
    "main.py",
]
print("Running:", " ".join(cmd))
result = subprocess.run(cmd)
sys.exit(result.returncode)
