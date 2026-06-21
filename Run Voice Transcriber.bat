@echo off
REM ===================================================================
REM  Run Voice Transcriber
REM  Double-click this file to transcribe the voice notes that live
REM  in this same folder. Output goes to voice_transcripts.txt.
REM ===================================================================

REM Work from the folder this .bat lives in (so it scans here).
cd /d "%~dp0"

echo.
echo  Starting Local Voice Note Transcriber...
echo  (First run installs faster-whisper and downloads the model -- be patient)
echo.

REM Try the Windows "py" launcher first, then fall back to "python".
where py >nul 2>nul
if %errorlevel%==0 (
    py "transcribe_voice_notes.py" %*
    goto :done
)

where python >nul 2>nul
if %errorlevel%==0 (
    python "transcribe_voice_notes.py" %*
    goto :done
)

echo.
echo  [ERROR] Python was not found on this computer.
echo  Install Python 3 from https://www.python.org/downloads/
echo  and tick "Add Python to PATH" during setup, then try again.

:done
echo.
pause
