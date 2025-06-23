@echo off
REM ===================================
REM Windows Upload Script (No Git Required)
REM สำหรับ upload ไฟล์จาก Windows ไปยัง DigitalOcean
REM ===================================

echo ========================================
echo  Windows File Upload Script
echo  Upload files to DigitalOcean Droplet
echo ========================================
echo.

REM Configuration - แก้ไขค่าเหล่านี้
set SERVER_IP=YOUR_DROPLET_IP
set SERVER_USER=deploy
set SERVER_PATH=/var/www/scjsnext

echo [INFO] Target: %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%
echo.

REM Check if WinSCP is installed
where winscp >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] WinSCP found, using automated upload...
    goto :winscp_upload
) else (
    echo [WARNING] WinSCP not found
    goto :manual_instructions
)

:winscp_upload
echo [INFO] Creating WinSCP script...

REM Create WinSCP script
echo open sftp://%SERVER_USER%@%SERVER_IP% > winscp_script.txt
echo lcd .. >> winscp_script.txt
echo cd %SERVER_PATH% >> winscp_script.txt
echo option batch on >> winscp_script.txt
echo option confirm off >> winscp_script.txt
echo synchronize remote . . -exclude="node_modules/;.next/;*.log;.env.local" >> winscp_script.txt
echo exit >> winscp_script.txt

echo [INFO] Running WinSCP upload...
winscp /script=winscp_script.txt

REM Clean up
del winscp_script.txt

echo [INFO] Files uploaded successfully!
goto :next_steps

:manual_instructions
echo.
echo ========================================
echo  Manual Upload Instructions
echo ========================================
echo.
echo Since automated tools are not available, please use one of these methods:
echo.
echo Method 1: Using PowerShell (Built-in)
echo -----------------------------------------
echo 1. Install OpenSSH client (if not installed):
echo    Settings ^> Apps ^> Optional Features ^> Add OpenSSH Client
echo.
echo 2. Run PowerShell as Administrator and execute:
echo    scp -r . %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%/
echo.
echo Method 2: Using WinSCP (Recommended)
echo ------------------------------------
echo 1. Download WinSCP from: https://winscp.net/
echo 2. Connect to server: %SERVER_USER%@%SERVER_IP%
echo 3. Navigate to: %SERVER_PATH%
echo 4. Upload project folder (exclude node_modules, .next)
echo.
echo Method 3: Using FileZilla
echo -------------------------
echo 1. Download FileZilla from: https://filezilla-project.org/
echo 2. Connect via SFTP: %SERVER_USER%@%SERVER_IP%:22
echo 3. Upload project files to: %SERVER_PATH%
echo.

:next_steps
echo.
echo ========================================
echo  Next Steps After Upload
echo ========================================
echo.
echo 1. Connect to server:
echo    ssh %SERVER_USER%@%SERVER_IP%
echo.
echo 2. Go to project directory:
echo    cd %SERVER_PATH%
echo.
echo 3. Set up environment file:
echo    cp deployment/env.example Frontend/.env.local
echo    nano Frontend/.env.local
echo.
echo 4. Edit docker-compose.yml (change email):
echo    nano deployment/docker-compose.yml
echo.
echo 5. Deploy application:
echo    cd deployment
echo    chmod +x *.sh
echo    ./deploy.sh
echo.
echo [INFO] Upload process completed!
echo [INFO] Your website will be available at: https://scjsnext.com
echo.
pause 