@echo off
title HireTrack Setup

echo ==========================
echo Setting up HireTrack...
echo ==========================

REM ---------- Backend ----------
cd /d "%~dp0backend"

if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

call venv\Scripts\activate

echo Installing Python dependencies...
pip install -r requirements.txt

echo Running migrations...
python manage.py makemigrations
python manage.py migrate

echo.

REM ---------- Frontend ----------
cd /d "%~dp0frontend"

echo Installing Node dependencies...
call npm install

echo.
echo =====================================
echo HireTrack setup completed successfully
echo =====================================
pause