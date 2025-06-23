# ⚡ Quick Start Guide - DigitalOcean Deployment

## 🚀 วิธีติดตั้งแบบเร็ว (5 นาที)

### 1. สร้าง DigitalOcean Droplet
- Size: 2GB RAM, 1 vCPU ($12/month)
- OS: Ubuntu 20.04 LTS

### 2. ตั้งค่า DNS
```
A Record: scjsnext.com → YOUR_DROPLET_IP
A Record: www.scjsnext.com → YOUR_DROPLET_IP
```

### 3. เชื่อมต่อและติดตั้ง
```bash
# SSH เข้า server
ssh root@YOUR_DROPLET_IP

# สร้าง user deploy
adduser deploy
usermod -aG sudo deploy
su - deploy

# รันสคริปติดตั้ง
curl -fsSL https://raw.githubusercontent.com/your-repo/paymentnew/main/deployment/install.sh | bash
```

### 4. Upload โปรเจ็ค

#### 🔥 หากใช้ Git:
```bash
cd /var/www/scjsnext
git clone https://your-repo/paymentnew.git .
```

#### 🚀 หากไม่ใช้ Git (แนะนำ WinSCP):
```bash
# วิธี SCP
scp -r paymentnew/ deploy@YOUR_DROPLET_IP:/var/www/scjsnext/

# หรือใช้ WinSCP/FileZilla
# Download: https://winscp.net/
# เชื่อมต่อ: deploy@YOUR_DROPLET_IP:22
# Upload โฟลเดอร์ paymentnew ไปที่ /var/www/scjsnext/
```

> 💡 **ไม่ใช้ Git?** ดูคู่มือแบบละเอียดที่ `NO-GIT-GUIDE.md`

### 5. ตั้งค่า Environment
```bash
cd /var/www/scjsnext/Frontend
cp ../deployment/env.example .env.local
nano .env.local
```

**ใส่ค่า Firebase:**
```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAvEe...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=paymentnew-dae57.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=paymentnew-dae57
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=paymentnew-dae57.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1074850368558
NEXT_PUBLIC_FIREBASE_APP_ID=1:1074850368558:web:...
```

### 6. แก้ไข Email และ Deploy
```bash
cd /var/www/scjsnext/deployment
nano docker-compose.yml
# แก้ไข: your-email@example.com เป็น email ของคุณ

# Deploy!
./deploy.sh
```

## ✅ เช็คผลลัพธ์

- 🌐 Website: https://scjsnext.com
- 📊 SSL Test: https://www.ssllabs.com/ssltest/
- 🔍 Health Check: https://scjsnext.com/api/health

## 🆘 หากมีปัญหา

```bash
# ดู logs
docker-compose logs -f

# ตรวจสอบ containers
docker-compose ps

# Restart
docker-compose restart
```

**🎉 เสร็จแล้ว! ใช้เวลาแค่ 5 นาที**

สำหรับรายละเอียดเพิ่มเติม ดูที่ `README.md` 