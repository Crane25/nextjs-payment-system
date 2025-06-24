# 🚀 คู่มือติดตั้ง Ubuntu แบบครบถ้วน
## Next.js Payment System v2.0

> **⚡ ใช้เวลาเพียง 15-20 นาทีในการติดตั้งครบทุกอย่าง**  
> **🎯 แก้ไขปัญหา Local ทำงานได้ แต่ Server ไม่ได้**

---

## 📋 ปัญหาที่แก้ไขแล้ว

### 🔧 การแก้ไขหลัก:
1. **✅ Dockerfile**: แก้ไข Next.js standalone build issues
2. **✅ Docker Compose**: ลบ volume mounts ที่ทำให้เกิดปัญหา
3. **✅ CSP Headers**: เพิ่ม Cloudflare scripts ใน Content Security Policy
4. **✅ Environment Variables**: ปรับปรุงการจัดการ env variables
5. **✅ Deployment Scripts**: สร้างสคริปต์ติดตั้งอัตโนมัติใหม่

---

## 🖥️ ข้อกำหนดระบบ

### Server Requirements:
- **OS**: Ubuntu 20.04 LTS หรือใหม่กว่า
- **RAM**: ขั้นต่ำ 2GB (แนะนำ 4GB+)
- **Storage**: ขั้นต่ำ 20GB
- **CPU**: ขั้นต่ำ 2 cores
- **Network**: Static IP address

### ข้อมูล Server:
- **Domain**: `scjsnext.com`
- **Server IP**: `167.172.65.185`
- **Location**: `/var/www/scjsnext`

---

## 🚀 วิธีติดตั้งแบบอัตโนมัติ (แนะนำ)

### 1. เชื่อมต่อ Server
```bash
ssh root@167.172.65.185
```

### 2. อัพโหลดโค้ดขึ้น Server
```bash
# สร้างโฟลเดอร์
mkdir -p /var/www/scjsnext

# วิธีที่ 1: ใช้ Git (ถ้ามี)
cd /var/www
git clone https://github.com/YOUR_USERNAME/paymentnew.git scjsnext

# วิธีที่ 2: อัพโหลดผ่าน SCP/FTP
# scp -r ./paymentnew root@167.172.65.185:/var/www/scjsnext
```

### 3. รันสคริปต์ติดตั้งอัตโนมัติ
```bash
cd /var/www/scjsnext/deployment
chmod +x ubuntu-deploy.sh
sudo ./ubuntu-deploy.sh
```

สคริปต์จะทำการ:
- ✅ ตรวจสอบระบบและข้อกำหนด
- ✅ อัพเดต Ubuntu และติดตั้ง packages ที่จำเป็น
- ✅ ติดตั้ง Docker และ Docker Compose
- ✅ ตั้งค่า Firewall (UFW) และ Fail2Ban
- ✅ สร้างไฟล์ environment อัตโนมัติ
- ✅ Build และ Deploy application
- ✅ ทดสอบการทำงานครบถ้วน
- ✅ ตั้งค่า monitoring อัตโนมัติ

---

## 📱 วิธีติดตั้งแบบ Manual (กรณีต้องการควบคุมทุกขั้นตอน)

<details>
<summary>คลิกเพื่อดูขั้นตอนการติดตั้งแบบ Manual</summary>

### 1. อัพเดตระบบ
```bash
apt update && apt upgrade -y
apt install -y curl wget git ufw fail2ban htop
```

### 2. ติดตั้ง Docker
```bash
# ติดตั้ง Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
rm get-docker.sh

# เปิดใช้งาน Docker
systemctl enable docker
systemctl start docker

# ติดตั้ง Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```

### 3. ตั้งค่า Firewall
```bash
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

### 4. เตรียม Environment File
```bash
cd /var/www/scjsnext
cat > Frontend/.env.local << 'EOF'
NODE_ENV=production
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_DOMAIN=scjsnext.com

# Firebase Configuration (อัพเดตค่าเหล่านี้)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAvEe6PF9mnwN8Vqf9wqWUkWA58coXKpiA
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=paymentnew-dae57.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=paymentnew-dae57
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=paymentnew-dae57.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1074850368558
NEXT_PUBLIC_FIREBASE_APP_ID=1:1074850368558:web:f7c3c3f162dfc8af1fa3bf

# Security Configuration
SESSION_SECRET=4a8f2e9c1b7d6e3f5a8b2c9d1e4f7a0b3c6d9e2f5a8b1c4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b
CSRF_SECRET=9d2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f
ENCRYPTION_KEY=06b259db817f41fbb73ac82a252a3b30
HASH_SALT=dae13683bf304cfb90c3c97b649131aa
EOF

chmod 600 Frontend/.env.local
```

### 5. Deploy Application
```bash
cd deployment
docker-compose down 2>/dev/null || true
docker-compose up -d --build
```

</details>

---

## 🏥 การตรวจสอบการทำงาน

### 1. ตรวจสอบ Container Status
```bash
cd /var/www/scjsnext/deployment
docker-compose ps

# ผลลัพธ์ที่ต้องการ: ทุก container ต้องเป็น "Up"
```

### 2. ตรวจสอบ Health Checks
```bash
# ตรวจสอบ Next.js app
curl http://localhost:3000/api/health

# ตรวจสอบ Nginx
curl http://localhost/nginx-health

# ตรวจสอบผ่าน domain (ถ้า DNS ชี้แล้ว)
curl https://scjsnext.com/nginx-health
```

### 3. ดู Logs
```bash
# ดู logs ทั้งหมด
docker-compose logs

# ดู logs แบบ real-time
docker-compose logs -f

# ดู logs เฉพาะ app
docker-compose logs nextjs-app
```

---

## ☁️ การตั้งค่า Cloudflare

> **⚠️ สำคัญ**: ต้องทำให้เสร็จเพื่อให้เว็บไซต์เข้าถึงได้

### 1. DNS Records
ไปที่ Cloudflare Dashboard → DNS:
```
Type: A
Name: scjsnext.com
IPv4: 167.172.65.185
Proxy Status: ☁️ Proxied (เปิด)

Type: A  
Name: www
IPv4: 167.172.65.185
Proxy Status: ☁️ Proxied (เปิด)
```

### 2. SSL/TLS Settings
ไปที่ SSL/TLS → Overview:
- **SSL/TLS encryption mode**: `Full` (ไม่ใช่ Full Strict)
- **Always Use HTTPS**: `On`
- **HSTS**: `On`

### 3. Security Settings
ไปที่ Security:
- **Security Level**: `Medium` หรือ `High`
- **Bot Fight Mode**: `On`

---

## 🔧 การจัดการหลังการติดตั้ง

### คำสั่งพื้นฐาน
```bash
# ไปที่โฟลเดอร์ deployment เสมอ
cd /var/www/scjsnext/deployment

# ดูสถานะ
docker-compose ps

# ดู logs
docker-compose logs -f

# รีสตาร์ท
docker-compose restart

# หยุดระบบ
docker-compose down

# เริ่มระบบ
docker-compose up -d

# อัพเดตระบบ (หลัง git pull)
docker-compose up -d --build --force-recreate
```

### การอัพเดตโค้ด
```bash
cd /var/www/scjsnext

# สำรอง environment file
cp Frontend/.env.local /tmp/env.backup

# อัพเดตโค้ด
git pull origin main

# คืนค่า environment
cp /tmp/env.backup Frontend/.env.local

# รีบิลด์และรีสตาร์ท
cd deployment
docker-compose up -d --build --force-recreate
```

---

## 🚨 การแก้ไขปัญหาทั่วไป

### ปัญหา 1: คอนเทนเนอร์ไม่ขึ้น
```bash
# ดู error logs
docker-compose logs [container-name]

# ลองรีสตาร์ท
docker-compose restart

# หรือสร้างใหม่
docker-compose up -d --force-recreate
```

### ปัญหา 2: เว็บไซต์โหลดไม่ได้
```bash
# ตรวจสอบ DNS
dig scjsnext.com

# ตรวจสอบ local health
curl http://localhost/nginx-health

# ตรวจสอบ Cloudflare
curl -I https://scjsnext.com
```

### ปัญหา 3: 503 Service Unavailable
```bash
# ตรวจสอบ rate limiting
docker-compose logs nginx-proxy | grep "limiting"

# รีสตาร์ท nginx
docker-compose restart nginx-proxy
```

### ปัญหา 4: Firebase ไม่ทำงาน
```bash
# แก้ไข Firebase config
nano Frontend/.env.local

# รีบิลด์
docker-compose up -d --build --force-recreate
```

---

## 📊 Monitoring และ Maintenance

### ตรวจสอบ Performance
```bash
# ดูการใช้ resources
docker stats

# ดูการใช้ disk space
df -h

# ดูการใช้ memory
free -h
```

### ล้าง Docker Cache
```bash
# ล้าง cache
docker system prune -af
docker volume prune -f

# รีสตาร์ท Docker
systemctl restart docker
```

---

## 🎉 เมื่อติดตั้งเสร็จแล้ว

### URL สำคัญ:
- **เว็บไซต์หลัก**: https://scjsnext.com
- **Health Check**: https://scjsnext.com/nginx-health
- **Alternative URL**: https://www.scjsnext.com

### Security Features ที่เปิดใช้:
- 🛡️ **Cloudflare Protection**: DDoS, Bot protection
- 🔒 **SSL/TLS Encryption**: Full encryption
- ⚡ **Rate Limiting**: ป้องกัน brute force
- 🔐 **Security Headers**: HSTS, CSP, X-Frame-Options
- 👤 **Non-root Containers**: รันด้วย user ปกติ
- 🔥 **UFW Firewall**: เปิดแค่ port ที่จำเป็น

---

## 📞 การติดต่อและสนับสนุน

### ไฟล์สำคัญ:
- **Logs**: `/var/log/payment-deployment.log`
- **Environment**: `/var/www/scjsnext/Frontend/.env.local`
- **Docker Compose**: `/var/www/scjsnext/deployment/docker-compose.yml`

### คำสั่งตรวจสอบระบบ:
```bash
# ข้อมูลระบบ
uname -a
free -h
df -h

# สถานะ Docker
systemctl status docker
docker --version

# สถานะเครือข่าย
ss -tulpn | grep :80
ss -tulpn | grep :443
```

---

**🎯 คู่มือนี้แก้ไขปัญหา Local ทำงานได้แต่ Server ไม่ได้ เรียบร้อยแล้ว!**  
**📞 หากยังมีปัญหา ให้ทำตามขั้นตอนการแก้ไขปัญหาด้านบน**