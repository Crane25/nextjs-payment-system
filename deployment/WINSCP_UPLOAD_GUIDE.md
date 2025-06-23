# 📁 WinSCP Upload Guide - Fix SESSION_SECRET Error

## 🎯 Files You Need to Upload:

### 1. **Frontend/src/config/env.server.ts** (NEW FILE)
- **Location on server:** `/var/www/scjsnext/Frontend/src/config/env.server.ts`
- **Action:** Upload this new file

### 2. **Frontend/src/config/env.ts** (MODIFIED)
- **Location on server:** `/var/www/scjsnext/Frontend/src/config/env.ts`
- **Action:** Replace existing file

### 3. **Frontend/middleware.ts** (MODIFIED)
- **Location on server:** `/var/www/scjsnext/Frontend/middleware.ts`
- **Action:** Replace existing file

### 4. **Frontend/src/utils/security.ts** (MODIFIED)
- **Location on server:** `/var/www/scjsnext/Frontend/src/utils/security.ts`
- **Action:** Replace existing file

### 5. **Frontend/src/utils/jwt.ts** (MODIFIED)
- **Location on server:** `/var/www/scjsnext/Frontend/src/utils/jwt.ts`
- **Action:** Replace existing file

### 6. **deployment/docker-compose-no-ssl.yml** (MODIFIED)
- **Location on server:** `/var/www/scjsnext/deployment/docker-compose-no-ssl.yml`
- **Action:** Replace existing file

### 7. **deployment/auto-update.sh** (NEW FILE)
- **Location on server:** `/var/www/scjsnext/deployment/auto-update.sh`
- **Action:** Upload this new file

---

## 🚀 Step-by-Step WinSCP Upload Process:

### Step 1: Connect to Server
- **Host:** 167.172.65.185
- **Port:** 22
- **Username:** root
- **Password:** [Your SSH password]

### Step 2: Navigate to Project Directory
- Go to: `/var/www/scjsnext/`

### Step 3: Upload Files
Upload each file to its exact location as listed above.

### Step 4: Set Permissions (Important!)
After uploading, you need to set execute permissions for the script:
- Right-click on `deployment/auto-update.sh`
- Properties → Permissions
- Set to: `755` (rwxr-xr-x)

---

## 🔧 After Upload - Run These Commands:

### Option A: Use Auto-Update Script (Recommended)
```bash
ssh root@167.172.65.185
cd /var/www/scjsnext/deployment
chmod +x auto-update.sh
./auto-update.sh
```

### Option B: Manual Commands
```bash
ssh root@167.172.65.185
cd /var/www/scjsnext/deployment

# Stop containers
docker-compose -f docker-compose-no-ssl.yml down

# Clean up
docker image prune -f

# Rebuild and start
docker-compose -f docker-compose-no-ssl.yml up -d --build

# Check status
docker-compose -f docker-compose-no-ssl.yml ps
```

---

## ✅ Verification:

### 1. Check if containers are running:
```bash
docker-compose -f docker-compose-no-ssl.yml ps
```

### 2. Check logs for errors:
```bash
docker-compose -f docker-compose-no-ssl.yml logs nextjs | tail -20
```

### 3. Test website:
- Open: http://167.172.65.185
- Press F12 to open browser console
- **SESSION_SECRET error should be gone!**

---

## 🆘 If You Need Help:

### Check if files uploaded correctly:
```bash
# Check if new server config exists
ls -la /var/www/scjsnext/Frontend/src/config/env.server.ts

# Check if Docker config has secrets
grep "SESSION_SECRET" /var/www/scjsnext/deployment/docker-compose-no-ssl.yml
```

### View real-time logs:
```bash
docker-compose -f docker-compose-no-ssl.yml logs -f
```

---

## 📝 Important Notes:

1. **Backup first**: Make a backup of your current files before uploading
2. **File permissions**: Make sure `auto-update.sh` has execute permissions (755)
3. **Path accuracy**: Upload files to EXACT paths as specified
4. **Container rebuild**: You MUST rebuild containers after uploading files
5. **Test thoroughly**: Check browser console to confirm fix worked

---

## 🎉 Expected Result:
- ❌ No more "SESSION_SECRET environment variable is required in production" error
- ✅ Application loads normally in browser
- ✅ All functionality works as expected 