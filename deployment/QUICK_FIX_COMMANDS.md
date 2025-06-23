# 🚀 Quick Fix Commands for SESSION_SECRET Error

## Copy and paste these commands one by one:

### 1. SSH into your server:
```bash
ssh root@167.172.65.185
```

### 2. Go to project directory:
```bash
cd /var/www/scjsnext
```

### 3. Pull latest updates:
```bash
git pull origin main
```

### 4. Check if fix is applied:
```bash
ls -la Frontend/src/config/env.server.ts
```
*Should show the new server config file*

### 5. Go to deployment directory:
```bash
cd deployment
```

### 6. Run the auto-update script:
```bash
chmod +x auto-update.sh
./auto-update.sh
```

### OR Manual Commands:

### 6a. Stop containers:
```bash
docker-compose -f docker-compose-no-ssl.yml down
```

### 6b. Clean up:
```bash
docker image prune -f
```

### 6c. Rebuild and start:
```bash
docker-compose -f docker-compose-no-ssl.yml up -d --build
```

### 6d. Check status:
```bash
docker-compose -f docker-compose-no-ssl.yml ps
```

### 6e. Check logs:
```bash
docker-compose -f docker-compose-no-ssl.yml logs nextjs | tail -20
```

## ✅ Test Result:
- Open: http://167.172.65.185
- Check browser console (F12)
- SESSION_SECRET error should be gone!

## 🔍 If still having issues:
```bash
# View real-time logs
docker-compose -f docker-compose-no-ssl.yml logs -f

# Check environment variables in container
docker-compose -f docker-compose-no-ssl.yml exec nextjs env | grep SECRET
``` 