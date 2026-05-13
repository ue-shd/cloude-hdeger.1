@echo off
cd /d "%~dp0backend"

if exist "..\\.env" (
  for /f "tokens=1,2 delims==" %%a in ("..\\.env") do set %%a=%%b
)

pip install -r requirements.txt -q
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
