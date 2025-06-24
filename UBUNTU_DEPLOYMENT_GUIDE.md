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

## 📝 สำหรับผู้เริ่มต้นที่ไม่คุ้นเคยกับ Git

### 🤔 Git คืออะไร?
Git เป็นเครื่องมือจัดการ source code ที่ช่วยให้คุณสามารถ:
- **ดาวน์โหลดโค้ด** จาก GitHub/GitLab มาใช้บน server
- **อัพเดตโค้ด** เมื่อมีการแก้ไขใหม่
- **จัดการ version** ของโค้ดอย่างมีระบบ

### 📋 คำสั่ง Git พื้นฐานที่ต้องรู้
```bash
# ตรวจสอบว่า Git ติดตั้งแล้วหรือไม่
git --version

# ดาวน์โหลดโค้ดจาก repository
git clone https://github.com/USERNAME/REPOSITORY.git

# ตรวจสอบสถานะไฟล์
git status

# ดูประวัติการแก้ไข
git log --oneline -10

# อัพเดตโค้ดล่าสุด
git pull origin main

# ดู URL ของ repository
git remote -v
```

### 🚀 วิธีใช้งาน Git ในกรณีนี้
1. **Clone repository**: ดาวน์โหลดโค้ดครั้งแรก
2. **Pull updates**: อัพเดตโค้ดเมื่อมีการแก้ไขใหม่
3. **Check status**: ตรวจสอบว่ามีไฟล์ใดถูกแก้ไขบ้าง

### ⚠️ ข้อควรระวัง
- **ไม่ต้องกลัว Git!** มันเป็นเครื่องมือที่ช่วยให้ชีวิตง่ายขึ้น
- **สำรอง .env.local เสมอ** ก่อน git pull
- **ใช้ HTTPS แทน SSH** ถ้าไม่มี SSH key setup

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

### 2. ติดตั้ง Git และ Tools พื้นฐาน
```bash
# อัพเดตระบบก่อน
apt update && apt upgrade -y

# ติดตั้ง Git และ tools ที่จำเป็น
apt install -y git curl wget nano vim htop net-tools unzip

# ตรวจสอบ Git version
git --version
```

### 3. ตั้งค่า Git (ไม่บังคับ)
```bash
# ตั้งค่า Git config (ไม่บังคับ แต่แนะนำ)
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
git config --global init.defaultBranch main
```

### 4. อัพโหลดโค้ดขึ้น Server

#### วิธีที่ 1: Clone จาก GitHub (แนะนำ)
```bash
# สร้างโฟลเดอร์
mkdir -p /var/www
cd /var/www

# Clone repository (แทนที่ URL ด้วย repo จริงของคุณ)
git clone https://github.com/Crane25/nextjs-payment-system.git scjsnext

# เข้าไปในโฟลเดอร์
cd scjsnext

# ตรวจสอบ branch ปัจจุบัน
git branch -a
git status
```

#### วิธีที่ 2: อัพโหลดผ่าน SCP (ถ้าไม่มี Git repo)
```bash
# บนเครื่อง Local (ไม่ใช่บน server)
scp -r ./paymentnew root@167.172.65.185:/var/www/scjsnext

# หรือใช้ rsync (แนะนำกว่า)
rsync -avz --progress ./paymentnew/ root@167.172.65.185:/var/www/scjsnext/
```

#### วิธีที่ 3: อัพโหลดผ่าน ZIP file
```bash
# บนเครื่อง Local - สร้าง ZIP file
zip -r paymentnew.zip paymentnew/

# อัพโหลด ZIP file
scp paymentnew.zip root@167.172.65.185:/tmp/

# บน Server - แตก ZIP file
cd /var/www
unzip /tmp/paymentnew.zip
mv paymentnew scjsnext
rm /tmp/paymentnew.zip
```

### 5. ตรวจสอบไฟล์ที่จำเป็น
```bash
cd /var/www/scjsnext

# ตรวจสอบโครงสร้างโฟลเดอร์
ls -la

# ตรวจสอบไฟล์สำคัญ
ls -la deployment/
ls -la Frontend/

# ตรวจสอบว่ามีไฟล์ deployment scripts
ls -la deployment/ubuntu-deploy.sh
ls -la deployment/docker-compose.yml
ls -la deployment/Dockerfile
```

### 6. รันสคริปต์ติดตั้งอัตโนมัติ
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

### 1. เตรียมระบบและติดตั้ง Git
```bash
# เชื่อมต่อ server
ssh root@167.172.65.185

# อัพเดตระบบ
apt update && apt upgrade -y

# ติดตั้ง packages พื้นฐาน (รวมถึง Git)
apt install -y git curl wget nano vim htop net-tools unzip ufw fail2ban

# ตรวจสอบ Git version
git --version

# ตั้งค่า Git (ไม่บังคับ)
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### 2. ดาวน์โหลดโค้ด
```bash
# วิธีที่ 1: Clone จาก GitHub
mkdir -p /var/www
cd /var/www
git clone https://github.com/Crane25/nextjs-payment-system.git scjsnext
cd scjsnext

# วิธีที่ 2: อัพโหลดผ่าน SCP (บน local machine)
# scp -r ./paymentnew root@167.172.65.185:/var/www/scjsnext

# ตรวจสอบไฟล์
ls -la
ls -la deployment/
```

### 3. ติดตั้ง Docker
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

### 4. ตั้งค่า Firewall
```bash
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

### 5. เตรียม Environment File
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

### 6. Deploy Application
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

#### วิธีที่ 1: ใช้ Git (แนะนำ)
```bash
cd /var/www/scjsnext

# สำรอง environment file
cp Frontend/.env.local /tmp/env.backup

# ตรวจสอบสถานะ Git
git status
git log --oneline -5

# อัพเดตโค้ด
git pull origin main

# คืนค่า environment
cp /tmp/env.backup Frontend/.env.local

# รีบิลด์และรีสตาร์ท
cd deployment
docker-compose up -d --build --force-recreate
```

#### วิธีที่ 2: อัพโหลดไฟล์ใหม่
```bash
cd /var/www

# สำรอง environment file
cp scjsnext/Frontend/.env.local /tmp/env.backup

# ลบโฟลเดอร์เก่า (ระวัง!)
rm -rf scjsnext

# อัพโหลดไฟล์ใหม่ (ใช้ SCP หรือ rsync)
# scp -r ./paymentnew root@167.172.65.185:/var/www/scjsnext

# คืนค่า environment
cp /tmp/env.backup scjsnext/Frontend/.env.local

# Deploy ใหม่
cd scjsnext/deployment
docker-compose up -d --build
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

### ปัญหา 5: Git ไม่ได้ติดตั้งหรือใช้งานไม่ได้
```bash
# ตรวจสอบว่า Git ติดตั้งแล้วหรือไม่
git --version

# ถ้ายังไม่มี ให้ติดตั้ง
apt update
apt install -y git

# ตั้งค่า Git ใหม่
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# ถ้า clone ไม่ได้ อาจเป็นปัญหา SSH key หรือ HTTPS
# ลองใช้ HTTPS แทน SSH
git clone https://github.com/USERNAME/REPO.git

# หรือถ้าเป็น private repo ต้องใช้ personal access token
```

### ปัญหา 6: Git pull ไม่ได้ (conflict หรือ permissions)
```bash
# ตรวจสอบสถานะ
cd /var/www/scjsnext
git status

# ถ้ามี conflicts ให้ reset hard (ระวัง! จะเสีย local changes)
git reset --hard HEAD
git pull origin main

# หรือถ้าอยากเก็บ local changes
git stash
git pull origin main
git stash pop

# ถ้ามีปัญหา permissions
chown -R root:root /var/www/scjsnext
chmod -R 755 /var/www/scjsnext
```

### ปัญหา 7: ไม่มี repository หรือไม่รู้ Git URL
```bash
# ตรวจสอบ remote URL
cd /var/www/scjsnext
git remote -v

# ถ้าไม่มี repository ให้ใช้วิธีอัพโหลดไฟล์แบบ manual
# 1. ใช้ SCP/SFTP
# 2. ใช้ ZIP file
# 3. ใช้ rsync

# ตัวอย่าง rsync (บน local machine)
rsync -avz --progress --delete ./paymentnew/ root@167.172.65.185:/var/www/scjsnext/
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