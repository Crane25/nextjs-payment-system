# 📁 โครงสร้างไฟล์สำหรับ Deployment

## 🗂️ โครงสร้างโฟลเดอร์

```
paymentnew/
├── Frontend/                          # Next.js Application
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── next.config.js                 # ✅ Updated for standalone build
│   └── .env.local                     # ⚠️ จะต้องสร้างเอง
│
└── deployment/                        # 🚀 Deployment Files
    ├── Dockerfile                     # ✅ Docker image for Next.js
    ├── docker-compose.yml             # ✅ Multi-container setup
    ├── install.sh                     # ✅ Server installation script
    ├── deploy.sh                      # ✅ Application deployment script
    ├── env.example                    # ✅ Environment variables template
    ├── README.md                      # ✅ Complete installation guide
    ├── quick-start.md                 # ✅ Quick 5-minute setup guide
    │
    └── nginx/                         # 🌐 Nginx Configuration
        ├── nginx.conf                 # ✅ Main nginx config
        └── sites-available/
            └── scjsnext.com           # ✅ Domain-specific config
```

## 📋 รายละเอียดไฟล์

### 🐳 Docker Files
- **`Dockerfile`**: สร้าง Docker image สำหรับ Next.js app
- **`docker-compose.yml`**: จัดการ services (NextJS, Nginx, Certbot)

### 🔧 Scripts
- **`install.sh`**: ติดตั้ง Docker, UFW, สร้างโฟลเดอร์
- **`deploy.sh`**: Deploy application และตั้งค่า SSL

### ⚙️ Configuration
- **`nginx.conf`**: การตั้งค่า Nginx หลัก
- **`scjsnext.com`**: การตั้งค่าเฉพาะโดเมน
- **`env.example`**: ตัวอย่าง environment variables

### 📖 Documentation
- **`README.md`**: คู่มือติดตั้งแบบละเอียด
- **`quick-start.md`**: คู่มือติดตั้งแบบเร็ว

## 🎯 ขั้นตอนการใช้งาน

### 1. เตรียมข้อมูล
```bash
# 1. แก้ไข docker-compose.yml
nano deployment/docker-compose.yml
# เปลี่ยน: your-email@example.com

# 2. สร้าง .env.local
cp deployment/env.example Frontend/.env.local
nano Frontend/.env.local
```

### 2. Upload ไฟล์ไปยัง Server
```bash
# วิธี 1: Git
git push origin main

# วิธี 2: SCP
scp -r paymentnew/ user@server:/var/www/scjsnext/
```

### 3. รันบน Server
```bash
# ติดตั้งระบบ
./deployment/install.sh

# Deploy application
cd deployment && ./deploy.sh
```

## 🔐 Security Features

- ✅ SSL/TLS certificate (Let's Encrypt)
- ✅ HTTP to HTTPS redirect
- ✅ Security headers
- ✅ Rate limiting
- ✅ Firewall configuration (UFW)
- ✅ Non-root container execution

## 📊 Monitoring & Maintenance

- 🔄 Auto SSL renewal (cron job)
- 📝 Log rotation
- 📈 Container health checks
- 🔍 Easy troubleshooting commands

## 🌍 Production Features

- ⚡ Nginx reverse proxy
- 🗜️ Gzip compression
- 📦 Docker multi-stage builds
- 🚀 Standalone Next.js build
- 💾 Persistent SSL certificates
- 🔒 Secure headers

## 🛠️ Customization

### เปลี่ยนโดเมน
```bash
# 1. แก้ไขใน docker-compose.yml
# 2. แก้ไขใน nginx/sites-available/
# 3. แก้ไขใน deploy.sh
```

### เพิ่ม Environment Variables
```bash
# 1. เพิ่มใน env.example
# 2. เพิ่มใน .env.local
# 3. เพิ่มใน docker-compose.yml (ถ้าจำเป็น)
```

### การปรับแต่ง Nginx
```bash
# แก้ไขไฟล์:
# - nginx/nginx.conf (global settings)
# - nginx/sites-available/domain (domain-specific)
```

---

**🎉 ระบบพร้อมใช้งานแล้ว!**

เริ่มต้นได้จาก `quick-start.md` หรือดูรายละเอียดใน `README.md` 