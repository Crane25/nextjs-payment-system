# ⚡ Quick Start - ไม่ใช้ Git (3 นาที)

## 🎯 สำหรับคนที่ไม่ได้ใช้ Git/GitHub

### 1️⃣ สร้าง DigitalOcean Droplet
- **Size**: 2GB RAM, 1 vCPU ($12/month)
- **OS**: Ubuntu 20.04 LTS
- **Authentication**: Password หรือ SSH Key

### 2️⃣ ตั้งค่า DNS
```
A Record: scjsnext.com → YOUR_DROPLET_IP
A Record: www.scjsnext.com → YOUR_DROPLET_IP
```

### 3️⃣ SSH เข้า Server และติดตั้ง
```bash
# เชื่อมต่อ
ssh root@167.172.65.185

# สร้าง user
adduser deploy
usermod -aG sudo deploy
su - deploy

# ติดตั้ง Docker และสิ่งจำเป็น
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker deploy

# ติดตั้ง Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# สร้างโฟลเดอร์
sudo mkdir -p /var/www/scjsnext
sudo chown -R deploy:deploy /var/www/scjsnext
```

### 4️⃣ Upload ไฟล์ (เลือก 1 วิธี)

#### 🥇 วิธี WinSCP (ง่ายที่สุด)
1. Download: https://winscp.net/
2. เชื่อมต่อ: `deploy@YOUR_DROPLET_IP:22`
3. Upload โฟลเดอร์ `paymentnew` ไปที่ `/var/www/scjsnext/`
4. **ข้าม**: `node_modules`, `.next`

#### 🥈 วิธี PowerShell
```powershell
cd C:\Users\KK\Desktop\paymentnew
scp -r . deploy@YOUR_DROPLET_IP:/var/www/scjsnext/
```

### 5️⃣ ตั้งค่าบน Server
```bash
ssh deploy@YOUR_DROPLET_IP
cd /var/www/scjsnext

# สร้าง environment file
cp deployment/env.example Frontend/.env.local
nano Frontend/.env.local
```

**ใส่ค่า Firebase ของคุณ:**
```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAvEe...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=paymentnew-dae57.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=paymentnew-dae57
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=paymentnew-dae57.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1074850368558
NEXT_PUBLIC_FIREBASE_APP_ID=1:1074850368558:web:...
```

### 6️⃣ แก้ไข Email และ Deploy
```bash
# แก้ไข email สำหรับ SSL
nano deployment/docker-compose.yml
# เปลี่ยน: your-email@example.com เป็น email ของคุณ

# Deploy!
cd deployment
chmod +x *.sh
./deploy.sh
```

## ✅ เสร็จแล้ว!

🌐 **เว็บไซต์**: https://scjsnext.com
🔒 **SSL**: จะทำงานอัตโนมัติ
📊 **ตรวจสอบ**: https://www.ssllabs.com/ssltest/

## 🔄 อัปเดตครั้งต่อไป

1. **Upload ไฟล์ใหม่** (วิธีเดิม)
2. **Restart Application**:
   ```bash
   cd /var/www/scjsnext/deployment
   docker-compose down
   docker-compose up -d --build
   ```

## 🆘 ช่วยเหลือเร่งด่วน

```bash
# ดู logs
docker-compose logs -f

# ดูสถานะ
docker-compose ps

# Restart
docker-compose restart
```

---

**🎉 Deploy สำเร็จ ใช้เวลาแค่ 3 นาที!**

รายละเอียดเพิ่มเติม: `NO-GIT-GUIDE.md` 