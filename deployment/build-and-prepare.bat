@echo off
REM ===================================
REM Build and Prepare for Deployment
REM สำหรับบิ้วโปรเจคและเตรียมไฟล์สำหรับ deploy
REM ===================================

echo ========================================
echo  Build and Prepare Deployment
echo  Next.js Payment System
echo ========================================
echo.

REM Change to Frontend directory
cd /d "%~dp0..\Frontend"

echo [INFO] Current directory: %CD%
echo.

REM Check if package.json exists
if not exist "package.json" (
    echo [ERROR] package.json not found. Please run this script from the correct directory.
    pause
    exit /b 1
)

echo [INFO] Installing dependencies...
call npm install

if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo [INFO] Building Next.js application...
call npm run build

if %errorlevel% neq 0 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Build completed successfully!
echo.

REM Go back to deployment directory
cd /d "%~dp0"

echo [INFO] Creating deployment package...

REM Create a deployment directory
if not exist "dist" mkdir dist
if exist "dist\*" del /q "dist\*"

echo [INFO] Copying files for deployment...

REM Copy essential files
xcopy /E /I /Y "..\Frontend" "dist\Frontend" /EXCLUDE:exclude.txt
xcopy /E /I /Y "." "dist\deployment"

REM Create exclude file for xcopy
echo node_modules\ > exclude.txt
echo .next\ >> exclude.txt
echo .git\ >> exclude.txt
echo *.log >> exclude.txt
echo .env.local >> exclude.txt
echo dist\ >> exclude.txt

echo.
echo ========================================
echo  Deployment Package Ready
echo ========================================
echo.
echo Package location: %CD%\dist
echo.
echo Next steps:
echo 1. Upload 'dist' folder to your server
echo 2. Run deployment script on server
echo.

REM Clean up
del exclude.txt

echo [SUCCESS] Deployment package created successfully!
echo.
pause 