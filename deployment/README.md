# Next.js Payment System v2.0 - Production Deployment

> **🚀 ระบบ Deployment ที่ออกแบบให้ทำงานได้รอบเดียวไม่ติดปัญหา**

## 📁 ไฟล์ในโฟลเดอร์นี้

### 🔧 การติดตั้งและการจัดการ
- **`INSTALLATION_GUIDE.md`** - คู่มือติดตั้งแบบละเอียดตั้งแต่ต้นจนจบ ⭐ **อ่านนี้ก่อน**
- **`production-deploy.sh`** - สคริปต์ติดตั้งอัตโนมัติสำหรับ production
- **`quick-reinstall.sh`** - สคริปต์ติดตั้งใหม่อย่างรวดเร็ว

### 🐳 Docker Configuration
- **`docker-compose.yml`** - การตั้งค่า Docker Compose สำหรับ production
- **`Dockerfile`** - Multi-stage production Dockerfile

### 🌐 Nginx Configuration
- **`nginx/nginx.conf`** - การตั้งค่า Nginx หลักพร้อม Cloudflare integration
- **`nginx/conf.d/default.conf`** - การตั้งค่า server สำหรับ scjsnext.com

---

## 🚀 วิธีใช้งาน

### การติดตั้งครั้งแรก
```bash
# 1. ไปที่โฟลเดอร์ deployment
cd /var/www/scjsnext/deployment

# 2. รันสคริปต์ติดตั้ง
sudo ./production-deploy.sh
```

### การติดตั้งใหม่หมด (เมื่อมีปัญหา)
```bash
sudo ./quick-reinstall.sh
```

### การจัดการทั่วไป
```bash
# ดูสถานะ
docker compose ps

# ดู logs
docker compose logs -f

# รีสตาร์ท
docker compose restart

# อัพเดต (หลัง git pull)
docker compose up -d --build --force-recreate
```

---

## 🎯 Features

### 🔒 Security
- ✅ Cloudflare SSL integration
- ✅ Real IP detection from Cloudflare
- ✅ Rate limiting optimized for Next.js
- ✅ Security headers (HSTS, CSP, etc.)
- ✅ Non-root container execution
- ✅ UFW firewall configuration

### ⚡ Performance
- ✅ Optimized for Next.js App Router
- ✅ Static file caching (1 year)
- ✅ Gzip compression
- ✅ Rate limiting for prefetch (500 req/s)
- ✅ Enhanced proxy buffering
- ✅ System performance tuning

### 🏥 Health & Monitoring
- ✅ Automated health checks
- ✅ Container health monitoring
- ✅ Structured logging
- ✅ Log rotation
- ✅ Performance metrics

### 🛠️ Management
- ✅ Zero-downtime deployment
- ✅ Automatic environment setup
- ✅ Quick reinstall capability
- ✅ Comprehensive error handling

---

## 📊 System Requirements

- **OS**: Ubuntu 20.04 LTS+
- **RAM**: 2GB+ (แนะนำ 4GB+)
- **Storage**: 20GB+ (แนะนำ 50GB+)
- **CPU**: 2+ cores
- **Network**: Static IP

---

## 🌐 URLs

- **เว็บไซต์หลัก**: https://scjsnext.com
- **Health Check**: https://scjsnext.com/nginx-health
- **Alternative**: https://www.scjsnext.com

---

## 📞 การแก้ไขปัญหา

สำหรับคำแนะนำการแก้ไขปัญหาแบบละเอียด ดูใน [INSTALLATION_GUIDE.md](./INSTALLATION_GUIDE.md)

### ปัญหาที่พบบ่อย

1. **503 Service Unavailable** → ตรวจสอบ rate limiting
2. **คอนเทนเนอร์ไม่ขึ้น** → ดู logs และรีสตาร์ท
3. **SSL Error** → ตรวจสอบการตั้งค่า Cloudflare
4. **ช้า/หยุดทำงาน** → ตรวจสอบ memory และล้าง cache

---

## 📋 Checklist การติดตั้ง

### Pre-installation
- [ ] Cloudflare DNS ชี้ไปยัง server IP
- [ ] Cloudflare SSL/TLS ตั้งเป็น "Full"
- [ ] Server มี Ubuntu 20.04+ และ RAM 2GB+
- [ ] โค้ดอยู่ใน `/var/www/scjsnext`

### Installation
- [ ] รัน `sudo ./production-deploy.sh`
- [ ] ตอบ "Y" ใน Cloudflare checklist
- [ ] รอ health checks ผ่านทั้งหมด
- [ ] ทดสอบเข้า https://scjsnext.com

### Post-installation
- [ ] ทดสอบฟีเจอร์ต่างๆ ของเว็บไซต์
- [ ] ตรวจสอบ SSL certificate
- [ ] บันทึก deployment report

---

**🎯 ระบบนี้ออกแบบให้ทำงานได้รอบเดียวไม่ติดปัญหา สำหรับ production ที่ใช้ Cloudflare SSL**