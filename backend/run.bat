@echo off   
title HireTrack

echo Starting Backend...
start cmd /k "cd /d %~dp0backend && call venv\Scripts\activate && python manage.py runserver"

timeout /t 3 >nul

echo Starting Frontend...
start cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Backend: http://127.0.0.1:8000
echo Frontend: http://localhost:5173
echo.
pause