# 🚀 คู่มือ Deploy โดยไม่ใช้ Git/GitHub

สำหรับคนที่ไม่ได้ใช้ Git หรือ GitHub แต่ต้องการ deploy Next.js ไปยัง DigitalOcean

## 📋 วิธีการ Upload ไฟล์ (เลือก 1 วิธี)

### 🥇 วิธีที่ 1: ใช้ WinSCP (แนะนำสำหรับ Windows)

1. **Download WinSCP**
   - ไปที่: https://winscp.net/eng/download.php
   - Download และติดตั้ง

2. **เชื่อมต่อกับ Server**
   ```
   File protocol: SFTP
   Host name: YOUR_DROPLET_IP
   Port number: 22
   User name: deploy
   Password: YOUR_PASSWORD
   ```

3. **Upload ไฟล์**
   - ฝั่งขวา (Server): ไปที่ `/var/www/scjsnext/`
   - ฝั่งซ้าย (Local): เลือกโฟลเดอร์ `paymentnew`
   - ลาก Drop โฟลเดอร์ทั้งหมด
   - **ข้าม**: `node_modules`, `.next`, `.git` (ถ้ามี)

### 🥈 วิธีที่ 2: ใช้ FileZilla (ฟรี, ทุก OS)

1. **Download FileZilla**
   - ไปที่: https://filezilla-project.org/
   - Download FileZilla Client

2. **เชื่อมต่อ**
   ```
   Host: sftp://YOUR_DROPLET_IP
   Username: deploy
   Password: YOUR_PASSWORD
   Port: 22
   ```

3. **Upload**
   - Remote site: `/var/www/scjsnext/`
   - Local site: เลือกโฟลเดอร์ `paymentnew`
   - Upload ทุกไฟล์ยกเว้น `node_modules`, `.next`

### 🥉 วิธีที่ 3: ใช้ PowerShell/Command Line

```powershell
# เปิด PowerShell ใน project folder
cd C:\Users\KK\Desktop\paymentnew

# Upload ด้วย SCP
scp -r . deploy@YOUR_DROPLET_IP:/var/www/scjsnext/

# หรือใช้ rsync (ถ้าติดตั้งแล้ว)
rsync -avz --exclude node_modules --exclude .next . deploy@YOUR_DROPLET_IP:/var/www/scjsnext/
```

### 🤖 วิธีที่ 4: ใช้ Script ที่เตรียมไว้

```bash
# สำหรับ Windows
cd deployment
upload-windows.bat

# แก้ไข SERVER_IP ในไฟล์ก่อนรัน
```

## 📂 ไฟล์ที่ต้อง Upload

### ✅ ต้อง Upload:
```
paymentnew/
├── Frontend/           # ทั้งโฟลเดอร์
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── next.config.js
└── deployment/         # ทั้งโฟลเดอร์
    ├── Dockerfile
    ├── docker-compose.yml
    ├── install.sh
    ├── deploy.sh
    └── nginx/
```

### ❌ ไม่ต้อง Upload:
```
Frontend/node_modules/     # ไฟล์ใหญ่มาก
Frontend/.next/           # Build cache
.git/                     # Git files
*.log                     # Log files
.env.local               # Secret files
```

## 🔧 ขั้นตอนหลัง Upload

### 1. SSH เข้า Server
```bash
ssh deploy@YOUR_DROPLET_IP
```

### 2. ไปยัง Project Directory
```bash
cd /var/www/scjsnext
```

### 3. ตั้งค่า Environment Variables
```bash
# Copy template
cp deployment/env.example Frontend/.env.local

# แก้ไขค่า Firebase
nano Frontend/.env.local
```

**ใส่ข้อมูล Firebase:**
```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAvEe...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=paymentnew-dae57.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=paymentnew-dae57
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=paymentnew-dae57.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1074850368558
NEXT_PUBLIC_FIREBASE_APP_ID=1:1074850368558:web:...
NODE_ENV=production
```

### 4. แก้ไข Email สำหรับ SSL
```bash
nano deployment/docker-compose.yml
```

**เปลี่ยน:**
```yaml
command: certonly --webroot -w /var/www/certbot --force-renewal --email YOUR_EMAIL@gmail.com -d scjsnext.com -d www.scjsnext.com --agree-tos
```

### 5. Deploy!
```bash
cd deployment
chmod +x *.sh
./deploy.sh
```

## 🔄 การอัปเดตครั้งต่อไป

เมื่อมีการแก้ไขโค้ด:

1. **Upload ไฟล์ใหม่** (วิธีเดิม)
2. **SSH เข้า Server**
3. **Rebuild และ Restart**
   ```bash
   cd /var/www/scjsnext/deployment
   docker-compose down
   docker-compose up -d --build
   ```

## 🛠️ เครื่องมือที่แนะนำ

### สำหรับ Windows:
- **WinSCP** - SFTP client ที่ใช้ง่าย
- **PuTTY** - SSH client
- **FileZilla** - FTP/SFTP client

### สำหรับ Mac:
- **Cyberduck** - SFTP client
- **Terminal** - Built-in SSH
- **FileZilla** - Cross-platform

### สำหรับ Linux:
- **Nautilus** - File manager with SFTP
- **FileZilla**
- **rsync** - Command line

## 🆘 แก้ไขปัญหา

### ปัญหา: ไฟล์ใหญ่เกินไป
**วิธีแก้:**
```bash
# ลบ node_modules ก่อน upload
rm -rf Frontend/node_modules
rm -rf Frontend/.next
```

### ปัญหา: Permission Denied
**วิธีแก้:**
```bash
# บน server, แก้ไข permission
sudo chown -R deploy:deploy /var/www/scjsnext
chmod -R 755 /var/www/scjsnext
```

### ปัญหา: Connection Refused
**วิธีแก้:**
```bash
# ตรวจสอบ SSH service
sudo systemctl status ssh
sudo systemctl start ssh
```

## 📱 หลังจาก Deploy สำเร็จ

เข้าชมเว็บไซต์ได้ที่:
- 🌐 **https://scjsnext.com**
- 🌐 **https://www.scjsnext.com**

ตรวจสอบ SSL:
- 🔒 **https://www.ssllabs.com/ssltest/**

---

## 🎉 สรุป

1. **Upload ไฟล์** ด้วยวิธีที่ถนัด
2. **SSH เข้า server**
3. **ตั้งค่า environment**
4. **แก้ไข email**
5. **รัน deploy script**

**ง่ายมาก! ไม่ต้องใช้ Git เลย** 🚀 