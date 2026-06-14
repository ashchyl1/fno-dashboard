@echo off
REM Build the Windows .exe using PyInstaller (one-file, no console window)
REM Run this from the project root: build.bat

pip install pyinstaller pyaudiowpatch soundfile lameenc customtkinter numpy

pyinstaller ^
    --onefile ^
    --windowed ^
    --name "SystemAudioRecorder" ^
    --icon NONE ^
    --hidden-import pyaudiowpatch ^
    --hidden-import soundfile ^
    --hidden-import lameenc ^
    --hidden-import customtkinter ^
    --hidden-import numpy ^
    --collect-all customtkinter ^
    main.py

echo.
echo Build complete. Check the dist\ folder for SystemAudioRecorder.exe
pause
