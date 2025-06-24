# คู่มือติดตั้ง Next.js Payment System v2.0 สำหรับ Production

> **🎯 คู่มือนี้ออกแบบให้ทำงานได้รอบเดียวไม่ติดปัญหาอะไร**  
> **⚡ ใช้เวลาประมาณ 15-20 นาทีในการติดตั้งครบ**

## 📋 สารบัญ

1. [ข้อกำหนดระบบ](#ข้อกำหนดระบบ)
2. [การเตรียม Cloudflare](#การเตรียม-cloudflare)
3. [การเตรียม Server](#การเตรียม-server)
4. [การติดตั้งระบบ](#การติดตั้งระบบ)
5. [การตรวจสอบการทำงาน](#การตรวจสอบการทำงาน)
6. [การจัดการระบบ](#การจัดการระบบ)
7. [การแก้ไขปัญหา](#การแก้ไขปัญหา)

---

## 🖥️ ข้อกำหนดระบบ

### Server Requirements
- **OS**: Ubuntu 20.04 LTS หรือใหม่กว่า
- **RAM**: ขั้นต่ำ 2GB (แนะนำ 4GB+)
- **Storage**: ขั้นต่ำ 20GB (แนะนำ 50GB+)
- **CPU**: ขั้นต่ำ 2 cores
- **Network**: Static IP address

### ข้อมูล Server ที่ใช้
- **Domain**: `scjsnext.com`
- **Server IP**: `167.172.65.185`
- **Location**: `/var/www/scjsnext`

---

## ☁️ การเตรียม Cloudflare

> **⚠️ สำคัญ**: ต้องทำให้เสร็จก่อนติดตั้งระบบ

### 1. เข้าสู่ Cloudflare Dashboard
1. เข้า [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. เลือกโดเมน `scjsnext.com`

### 2. ตั้งค่า DNS Records
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

### 3. ตั้งค่า SSL/TLS
ไปที่ **SSL/TLS** → **Overview**:
- **SSL/TLS encryption mode**: `Full` (ไม่ใช่ Full Strict)
- **Always Use HTTPS**: `On`
- **HTTP Strict Transport Security (HSTS)**: `On`
- **Minimum TLS Version**: `1.2`

### 4. ตั้งค่า Speed
ไปที่ **Speed** → **Optimization**:
- **Auto Minify**: เปิด HTML, CSS, JS
- **Brotli**: `On`
- **Rocket Loader**: `Off` (สำคัญสำหรับ Next.js)

### 5. ตั้งค่า Security
ไปที่ **Security** → **Settings**:
- **Security Level**: `Medium` หรือ `High`
- **Bot Fight Mode**: `On`
- **Browser Integrity Check**: `On`

### 6. ตั้งค่า Caching (ไม่บังคับ)
ไปที่ **Caching** → **Configuration**:
- **Caching Level**: `Standard`
- **Browser Cache TTL**: `4 hours`
- **Always Online**: `On`

### 7. ตรวจสอบ DNS Propagation
```bash
# ตรวจสอบว่า domain ชี้ไป Cloudflare แล้ว
dig scjsnext.com

# ผลลัพธ์ที่ต้องการ: IP ที่ขึ้นต้นด้วย 104.21.x.x, 172.67.x.x, หรือ 104.16.x.x
```

---

## 🖥️ การเตรียม Server

### 1. เชื่อมต่อ SSH
```bash
ssh root@167.172.65.185
```

### 2. อัพเดตระบบ (ถ้าจำเป็น)
```bash
apt update && apt upgrade -y
```

### 3. เตรียมโค้ด
```bash
# สร้างโฟลเดอร์และ clone โค้ด
mkdir -p /var/www
cd /var/www
git clone https://github.com/YOUR_USERNAME/nextjs-payment-system.git scjsnext
cd scjsnext
```

> **📝 หมายเหตุ**: แทนที่ `YOUR_USERNAME` ด้วย username จริงของ GitHub

---

## 🚀 การติดตั้งระบบ

### วิธีที่ 1: การติดตั้งอัตโนมัติ (แนะนำ)

```bash
# ไปที่โฟลเดอร์ deployment
cd /var/www/scjsnext/deployment

# ให้สิทธิ์รันสคริปต์
chmod +x *.sh

# รันสคริปต์ติดตั้ง
sudo ./production-deploy.sh
```

สคริปต์จะทำการ:
1. ✅ ตรวจสอบระบบและข้อกำหนด
2. ✅ ติดตั้ง Docker และ dependencies
3. ✅ สร้างไฟล์ environment อัตโนมัติ
4. ✅ ตรวจสอบการตั้งค่า Cloudflare
5. ✅ สร้างและรันคอนเทนเนอร์
6. ✅ ทำ health checks ครบถ้วน
7. ✅ ปรับแต่งประสิทธิภาพและความปลอดภัย

### วิธีที่ 2: การติดตั้งด้วยตนเอง

<details>
<summary>คลิกเพื่อดูขั้นตอนการติดตั้งด้วยตนเอง</summary>

#### 1. ติดตั้ง Docker
```bash
# ติดตั้ง Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# เปิดใช้งาน Docker
systemctl enable docker
systemctl start docker
```

#### 2. เตรียมไฟล์ Environment
```bash
cd /var/www/scjsnext
cp deployment/env.example Frontend/.env.local
nano Frontend/.env.local  # แก้ไขตามต้องการ
```

#### 3. สร้างและรันคอนเทนเนอร์
```bash
cd deployment
docker compose up -d --build
```

#### 4. รอระบบพร้อมใช้งาน
```bash
# ตรวจสอบ logs
docker compose logs -f

# ตรวจสอบสถานะ
docker compose ps
```

</details>

---

## 🏥 การตรวจสอบการทำงาน

### 1. ตรวจสอบคอนเทนเนอร์
```bash
cd /var/www/scjsnext/deployment
docker compose ps

# ผลลัพธ์ที่ต้องการ: ทุกคอนเทนเนอร์ status เป็น "Up"
```

### 2. ตรวจสอบ Health Checks
```bash
# ตรวจสอบ Next.js app
curl http://localhost:3000/api/health

# ตรวจสอบ Nginx
curl http://localhost/nginx-health

# ตรวจสอบผ่าน Cloudflare
curl https://scjsnext.com/nginx-health
```

### 3. ตรวจสอบ Logs
```bash
# ดู logs ทั้งหมด
docker compose logs

# ดู logs แบบ real-time
docker compose logs -f

# ดู logs ของ app เฉพาะ
docker compose logs nextjs-app

# ดู logs ของ nginx เฉพาะ
docker compose logs nginx-proxy
```

### 4. ทดสอบเว็บไซต์
1. เปิดเบราว์เซอร์ไปที่ `https://scjsnext.com`
2. ตรวจสอบว่า SSL เขียวและโหลดไม่มีปัญหา
3. ทดสอบฟีเจอร์ต่างๆ ของเว็บไซต์

---

## 🔧 การจัดการระบบ

### คำสั่งพื้นฐาน

```bash
# ไปที่โฟลเดอร์ deployment เสมอ
cd /var/www/scjsnext/deployment

# ดูสถานะคอนเทนเนอร์
docker compose ps

# ดู logs
docker compose logs -f

# รีสตาร์ทระบบ
docker compose restart

# หยุดระบบ
docker compose down

# เริ่มระบบ
docker compose up -d

# อัพเดตระบบ (หลังจาก git pull)
docker compose up -d --build --force-recreate
```

### การอัพเดตโค้ด

```bash
cd /var/www/scjsnext

# สำรองข้อมูลสำคัญ
cp Frontend/.env.local /tmp/env.backup

# ดึงโค้ดใหม่
git pull origin main

# คืนค่า environment
cp /tmp/env.backup Frontend/.env.local

# รีบิลด์และรีสตาร์ท
cd deployment
docker compose up -d --build --force-recreate
```

### การติดตั้งใหม่หมด (Quick Reinstall)

```bash
cd /var/www/scjsnext/deployment
sudo ./quick-reinstall.sh
```

---

## 🚨 การแก้ไขปัญหา

### ปัญหา 1: คอนเทนเนอร์ไม่ขึ้น

**อาการ**: `docker compose ps` แสดงสถานะ "Exited"

**วิธีแก้**:
```bash
# ดู error logs
docker compose logs [container-name]

# ลองรีสตาร์ท
docker compose restart

# หรือสร้างใหม่
docker compose up -d --force-recreate
```

### ปัญหา 2: เว็บไซต์โหลดไม่ได้

**อาการ**: ไม่สามารถเข้า `https://scjsnext.com` ได้

**วิธีตรวจสอบ**:
```bash
# 1. ตรวจสอบ DNS
dig scjsnext.com

# 2. ตรวจสอบ local health
curl http://localhost/nginx-health

# 3. ตรวจสอบ Cloudflare
curl -I https://scjsnext.com
```

**วิธีแก้**:
- รอ DNS propagation (5-15 นาที)
- ตรวจสอบการตั้งค่า Cloudflare อีกครั้ง
- รีสตาร์ทระบบ

### ปัญหา 3: 503 Service Unavailable

**อาการ**: เว็บไซต์เข้าได้แต่บางไฟล์โหลดไม่ได้

**วิธีแก้**:
```bash
# ตรวจสอบ rate limiting
docker compose logs nginx-proxy | grep "limiting"

# ปรับ rate limit ถ้าจำเป็น (แก้ไขใน nginx config)
nano nginx/conf.d/default.conf

# รีสตาร์ท nginx
docker compose restart nginx-proxy
```

### ปัญหา 4: ความจำไม่พอ

**อาการ**: ระบบช้าหรือคอนเทนเนอร์หยุดทำงาน

**วิธีแก้**:
```bash
# ตรวจสอบการใช้ memory
free -h
docker stats

# ล้าง Docker cache
docker system prune -af
docker volume prune -f

# รีสตาร์ทระบบ
systemctl restart docker
```

### ปัญหา 5: Environment Variables ผิด

**อาการ**: เว็บไซต์ขึ้นแต่ฟีเจอร์ไม่ทำงาน

**วิธีแก้**:
```bash
# ตรวจสอบไฟล์ env
cat Frontend/.env.local

# แก้ไขตามต้องการ
nano Frontend/.env.local

# รีบิลด์คอนเทนเนอร์
cd deployment
docker compose up -d --build --force-recreate
```

---

## 📞 การติดต่อและสนับสนุน

### ข้อมูลระบบสำคัญ

- **Log Files**: `/var/log/payment-deployment.log`
- **Environment**: `/var/www/scjsnext/Frontend/.env.local`
- **Docker Compose**: `/var/www/scjsnext/deployment/docker-compose.yml`

### คำสั่งตรวจสอบระบบ

```bash
# ข้อมูลระบบ
uname -a
free -h
df -h

# สถานะ Docker
systemctl status docker
docker --version
docker compose version

# สถานะเครือข่าย
ss -tulpn | grep :80
ss -tulpn | grep :443
```

---

## 🎉 การติดตั้งเสร็จสมบูรณ์

เมื่อติดตั้งเสร็จแล้ว คุณจะได้:

✅ **เว็บไซต์ที่ทำงานได้**: https://scjsnext.com  
✅ **SSL Certificate**: จาก Cloudflare  
✅ **Performance Optimization**: Caching, Compression, Rate Limiting  
✅ **Security Features**: Headers, Firewall, Container Security  
✅ **Health Monitoring**: Automated health checks  
✅ **Log Management**: Structured logging และ rotation  

### URL สำคัญ

- **เว็บไซต์หลัก**: https://scjsnext.com
- **Health Check**: https://scjsnext.com/nginx-health
- **Alternative URL**: https://www.scjsnext.com

### Security Features ที่เปิดใช้งาน

🛡️ **Cloudflare Protection**: DDoS, Bot protection, WAF  
🔒 **SSL/TLS Encryption**: Full encryption ด้วย Cloudflare  
⚡ **Rate Limiting**: ป้องกัน brute force และ spam  
🔐 **Security Headers**: HSTS, CSP, X-Frame-Options  
👤 **Non-root Containers**: รันด้วย user ปกติไม่ใช่ root  
🔥 **UFW Firewall**: เปิดแค่ port ที่จำเป็น  

---

**🎯 คู่มือนี้ออกแบบให้ทำงานได้รอบเดียวไม่ติดปัญหา!**  
**📞 หากมีปัญหาให้ทำตามขั้นตอนการแก้ไขปัญหาด้านบน**