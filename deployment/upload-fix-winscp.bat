@echo off
echo ========================================
echo WinSCP Upload Script - SESSION_SECRET Fix
echo ========================================
echo.

echo This script will help you upload the fixed files to your server.
echo.
echo Files to upload:
echo 1. Frontend/src/config/env.server.ts (NEW)
echo 2. Frontend/src/config/env.ts (MODIFIED)
echo 3. Frontend/middleware.ts (MODIFIED)
echo 4. Frontend/src/utils/security.ts (MODIFIED)
echo 5. Frontend/src/utils/jwt.ts (MODIFIED)
echo 6. deployment/docker-compose-no-ssl.yml (MODIFIED)
echo 7. deployment/auto-update.sh (NEW)
echo.

echo ========================================
echo WinSCP Upload Instructions:
echo ========================================
echo.
echo 1. Open WinSCP
echo 2. Connect to your server:
echo    - Host: 167.172.65.185
echo    - Port: 22
echo    - Username: root
echo    - Password: [Your SSH password]
echo.
echo 3. Navigate to: /var/www/scjsnext/
echo.
echo 4. Upload these files to their exact locations:
echo.

set PROJECT_ROOT=%~dp0..

echo    FROM: %PROJECT_ROOT%\Frontend\src\config\env.server.ts
echo    TO:   /var/www/scjsnext/Frontend/src/config/env.server.ts
echo.
echo    FROM: %PROJECT_ROOT%\Frontend\src\config\env.ts
echo    TO:   /var/www/scjsnext/Frontend/src/config/env.ts
echo.
echo    FROM: %PROJECT_ROOT%\Frontend\middleware.ts
echo    TO:   /var/www/scjsnext/Frontend/middleware.ts
echo.
echo    FROM: %PROJECT_ROOT%\Frontend\src\utils\security.ts
echo    TO:   /var/www/scjsnext/Frontend/src/utils/security.ts
echo.
echo    FROM: %PROJECT_ROOT%\Frontend\src\utils\jwt.ts
echo    TO:   /var/www/scjsnext/Frontend/src/utils/jwt.ts
echo.
echo    FROM: %PROJECT_ROOT%\deployment\docker-compose-no-ssl.yml
echo    TO:   /var/www/scjsnext/deployment/docker-compose-no-ssl.yml
echo.
echo    FROM: %PROJECT_ROOT%\deployment\auto-update.sh
echo    TO:   /var/www/scjsnext/deployment/auto-update.sh
echo.

echo 5. Set permissions for auto-update.sh:
echo    - Right-click on auto-update.sh
echo    - Properties ^> Permissions
echo    - Set to: 755 (rwxr-xr-x)
echo.

echo ========================================
echo After Upload - SSH Commands:
echo ========================================
echo.
echo ssh root@167.172.65.185
echo cd /var/www/scjsnext/deployment
echo chmod +x auto-update.sh
echo ./auto-update.sh
echo.

echo ========================================
echo Alternative Manual Commands:
echo ========================================
echo.
echo ssh root@167.172.65.185
echo cd /var/www/scjsnext/deployment
echo docker-compose -f docker-compose-no-ssl.yml down
echo docker image prune -f
echo docker-compose -f docker-compose-no-ssl.yml up -d --build
echo docker-compose -f docker-compose-no-ssl.yml ps
echo.

echo ========================================
echo Verification:
echo ========================================
echo.
echo 1. Check website: http://167.172.65.185
echo 2. Press F12 to open browser console
echo 3. SESSION_SECRET error should be gone!
echo.

echo Press any key to open the project folder...
pause >nul

explorer "%PROJECT_ROOT%"

echo.
echo Script completed. Follow the instructions above to upload files via WinSCP.
echo.
pause 