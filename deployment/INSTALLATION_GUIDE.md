# 🚀 คู่มือการติดตั้ง Next.js Payment System v2.0

## 📋 ขั้นตอนการติดตั้งใหม่หมดทั้งระบบ

### 🎯 สำหรับผู้ที่ต้องการติดตั้งใหม่หมด

```bash
# 1. SSH เข้าเซิร์ฟเวอร์
ssh root@167.172.65.185

# 2. ไปยังโฟลเดอร์ project
cd /var/www/scjsnext

# 3. อัพเดท code จาก Git
git pull origin main

# 4. รันการติดตั้งใหม่หมด
cd deployment
./reinstall.sh
```

### ⚡ สำหรับการอัพเดทปกติ

```bash
# 1. SSH เข้าเซิร์ฟเวอร์
ssh root@167.172.65.185

# 2. อัพเดท code
cd /var/www/scjsnext
git pull origin main

# 3. รัน deployment
cd deployment
./deploy.sh
```

---

## 🛠️ สคริปต์ที่พร้อมใช้งาน

### 1. `deploy.sh` - การ Deploy ปกติ
- ใช้สำหรับการอัพเดทและ deploy ปกติ
- รักษา data และ configuration เดิมไว้
- ทำ health check และ validation

### 2. `reinstall.sh` - การติดตั้งใหม่หมด
- ⚠️ **ลบทุกอย่างและติดตั้งใหม่หมด**
- ลบ containers, images, volumes ทั้งหมด
- สร้าง configuration ใหม่
- เหมาะสำหรับแก้ปัญหาที่ซับซ้อน

---

## 🔧 การแก้ไขปัญหาเร่งด่วน

### ปัญหา: เว็บไซต์เข้าไม่ได้
```bash
cd /var/www/scjsnext/deployment

# ตรวจสอบสถานะ
docker compose ps

# ดู logs
docker compose logs --tail=50

# รีสตาร์ท
docker compose restart
```

### ปัญหา: 503 Service Unavailable
```bash
# ตรวจสอบ Next.js
docker compose logs nextjs --tail=50

# รีสตาร์ท Next.js
docker compose restart nextjs

# ตรวจสอบ health
curl http://localhost:3000/api/health
```

### ปัญหา: Container ไม่ start
```bash
# ลบและสร้างใหม่
docker compose down -v
docker compose up -d --build

# หากยังไม่ได้ ใช้ reinstall
./reinstall.sh
```

---

## 📊 การตรวจสอบระบบ

### Health Checks
```bash
# ตรวจสอบ containers
docker compose ps

# ตรวจสอบ health endpoints
curl https://scjsnext.com/health
curl https://scjsnext.com/api/health

# ตรวจสอบ logs
docker compose logs -f
```

### Performance Monitoring
```bash
# Resource usage
docker stats

# Disk space
df -h
docker system df

# Network
netstat -tlnp | grep :80
```

---

## 🔄 การอัพเดทระบบ

### การอัพเดทปกติ (แนะนำ)
```bash
cd /var/www/scjsnext
git pull origin main
cd deployment
./deploy.sh
```

### การติดตั้งใหม่หมด (เมื่อมีปัญหา)
```bash
cd /var/www/scjsnext/deployment
./reinstall.sh
```

---

## 🚨 Emergency Recovery

### หาก Git มีปัญหา
```bash
cd /var/www/scjsnext
git fetch origin
git reset --hard origin/main
git clean -fd
cd deployment
./deploy.sh
```

### หาก Docker มีปัญหา
```bash
# หยุดทุกอย่าง
docker stop $(docker ps -aq)
docker rm $(docker ps -aq)
docker system prune -af

# รีสตาร์ท Docker service
systemctl restart docker

# ติดตั้งใหม่
cd /var/www/scjsnext/deployment
./reinstall.sh
```

---

## 📝 Logs & Debugging

### ตำแหน่งไฟล์ Log
```bash
# Application logs
docker compose logs nextjs

# Nginx logs
docker compose logs nginx

# System logs
journalctl -u docker

# Container-specific logs
docker logs container_name
```

### การดู Real-time Logs
```bash
# ทุก containers
docker compose logs -f

# เฉพาะ Next.js
docker compose logs -f nextjs

# เฉพาะ Nginx
docker compose logs -f nginx
```

---

## 🔒 Security Checklist

### การตรวจสอบความปลอดภัย
```bash
# ตรวจสอบ SSL
curl -I https://scjsnext.com

# ตรวจสอบ headers
curl -I https://scjsnext.com | grep -i security

# ตรวจสอบ rate limiting
# (ทดสอบโดยส่ง requests หลายครั้ง)

# ตรวจสอบ firewall
ufw status
```

### การอัพเดทความปลอดภัย
```bash
# อัพเดท OS
apt update && apt upgrade -y

# อัพเดท Docker images
docker compose pull
docker compose up -d

# ตรวจสอบ vulnerabilities
docker scout quickview
```

---

## 📞 ติดต่อและช่วยเหลือ

### เมื่อมีปัญหา
1. ตรวจสอบ logs ก่อน: `docker compose logs -f`
2. ดูสถานะ containers: `docker compose ps`
3. ทดสอบ health endpoints
4. หากไม่ได้ผล ใช้ `./reinstall.sh`

### ข้อมูลสำคัญ
- **เซิร์ฟเวอร์**: 167.172.65.185
- **โดเมน**: scjsnext.com
- **Project path**: /var/www/scjsnext
- **Deployment path**: /var/www/scjsnext/deployment

### Health Endpoints
- **Website**: https://scjsnext.com
- **Health Check**: https://scjsnext.com/health
- **API Health**: https://scjsnext.com/api/health

---

## 🎯 Quick Commands Reference

```bash
# การจัดการพื้นฐาน
docker compose ps              # ดูสถานะ
docker compose logs -f         # ดู logs
docker compose restart         # รีสตาร์ท
docker compose up -d --build   # rebuild และ start

# การแก้ไขปัญหา
./deploy.sh                    # deploy ปกติ
./reinstall.sh                 # ติดตั้งใหม่หมด
docker system prune -af        # ทำความสะอาด Docker

# การตรวจสอบ
curl https://scjsnext.com/health
docker stats
df -h
```

---

*อัพเดทล่าสุด: 2025-06-23*
*สำหรับ Next.js Payment System v2.0*