@echo off
REM ===================================
REM Complete Upload and Deploy Script
REM Build + Upload + Deploy (No SSL)
REM ===================================

echo ========================================
echo  Complete Deployment Script
echo  Next.js Payment System v2.0
echo ========================================
echo.

REM Configuration - แก้ไขค่าเหล่านี้
set /p SERVER_IP="Enter Server IP: "
set /p SERVER_USER="Enter Username (default: root): "
if "%SERVER_USER%"=="" set SERVER_USER=root
set SERVER_PATH=/var/www/scjsnext

echo.
echo [INFO] Target: %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%
echo.

REM Step 1: Build the project
echo ========================================
echo  Step 1: Building Project
echo ========================================
echo.

cd /d "%~dp0..\Frontend"

echo [INFO] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

echo [INFO] Building Next.js application...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)

echo [SUCCESS] Build completed!
echo.

REM Go back to deployment directory
cd /d "%~dp0"

REM Step 2: Create deployment package
echo ========================================
echo  Step 2: Creating Deployment Package
echo ========================================
echo.

if not exist "temp_deploy" mkdir temp_deploy
if exist "temp_deploy\*" rmdir /s /q temp_deploy

REM Create exclude file
echo node_modules\ > exclude_list.txt
echo .git\ >> exclude_list.txt
echo .next\ >> exclude_list.txt
echo *.log >> exclude_list.txt
echo temp_deploy\ >> exclude_list.txt
echo dist\ >> exclude_list.txt

echo [INFO] Copying files...
xcopy /E /I /Y ".." "temp_deploy" /EXCLUDE:exclude_list.txt

REM Clean up exclude file
del exclude_list.txt

echo [SUCCESS] Deployment package created!
echo.

REM Step 3: Upload to server
echo ========================================
echo  Step 3: Uploading to Server
echo ========================================
echo.

REM Check for SSH tools
where scp >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Using SCP for upload...
    goto :scp_upload
)

where pscp >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Using PuTTY SCP for upload...
    goto :pscp_upload
)

echo [WARNING] No SSH tools found. Please install one of the following:
echo 1. OpenSSH Client (Windows 10/11 built-in)
echo 2. PuTTY (includes pscp)
echo 3. WinSCP
echo.
goto :manual_upload

:scp_upload
echo [INFO] Uploading with SCP...
scp -r temp_deploy\* %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%/
if %errorlevel% equ 0 (
    echo [SUCCESS] Upload completed!
    goto :deploy_on_server
) else (
    echo [ERROR] Upload failed
    goto :manual_upload
)

:pscp_upload
echo [INFO] Uploading with PuTTY SCP...
pscp -r temp_deploy\* %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%/
if %errorlevel% equ 0 (
    echo [SUCCESS] Upload completed!
    goto :deploy_on_server
) else (
    echo [ERROR] Upload failed
    goto :manual_upload
)

:manual_upload
echo.
echo ========================================
echo  Manual Upload Instructions
echo ========================================
echo.
echo Please manually upload the 'temp_deploy' folder contents to:
echo Server: %SERVER_USER%@%SERVER_IP%
echo Path: %SERVER_PATH%
echo.
echo You can use:
echo 1. WinSCP - https://winscp.net/
echo 2. FileZilla - https://filezilla-project.org/
echo 3. PowerShell: scp -r temp_deploy\* %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%/
echo.
set /p CONTINUE="Press Enter after upload is complete..."
goto :deploy_on_server

:deploy_on_server
echo.
echo ========================================
echo  Step 4: Deploying on Server
echo ========================================
echo.

echo [INFO] Connecting to server and deploying...

REM Create deployment commands
echo cd %SERVER_PATH%/deployment > deploy_commands.txt
echo chmod +x *.sh >> deploy_commands.txt
echo ./deploy-no-ssl.sh >> deploy_commands.txt

REM Try to execute on server
where ssh >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Executing deployment on server...
    ssh %SERVER_USER%@%SERVER_IP% "cd %SERVER_PATH%/deployment && chmod +x *.sh && ./deploy-no-ssl.sh"
    if %errorlevel% equ 0 (
        echo [SUCCESS] Deployment completed!
        goto :completion
    ) else (
        echo [WARNING] Automated deployment failed
        goto :manual_deploy
    )
) else (
    goto :manual_deploy
)

:manual_deploy
echo.
echo ========================================
echo  Manual Deployment Instructions
echo ========================================
echo.
echo Please connect to your server and run:
echo.
echo ssh %SERVER_USER%@%SERVER_IP%
echo cd %SERVER_PATH%/deployment
echo chmod +x *.sh
echo ./deploy-no-ssl.sh
echo.

:completion
echo.
echo ========================================
echo  Deployment Summary
echo ========================================
echo.
echo [SUCCESS] Deployment process completed!
echo.
echo Your application should be available at:
echo - http://%SERVER_IP%
echo.
echo Useful server commands:
echo ssh %SERVER_USER%@%SERVER_IP%
echo cd %SERVER_PATH%/deployment
echo docker-compose -f docker-compose-no-ssl.yml logs -f
echo.

REM Cleanup
if exist "temp_deploy" rmdir /s /q temp_deploy
if exist "deploy_commands.txt" del deploy_commands.txt

echo [INFO] Cleanup completed!
echo.
pause 