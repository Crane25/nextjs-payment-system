# 🚀 Production Deployment Guide
**Next.js Payment System v2.0 with Cloudflare SSL**

## ⚡ Quick Start (ใช้งานได้ทันที)

```bash
# บน server ที่ได้รับการเตรียมไว้แล้ว
cd /var/www/scjsnext
git pull origin main
cd deployment
./deploy.sh
```

## 🔧 การติดตั้งครั้งแรก

### ขั้นตอนที่ 1: เตรียม Server

```bash
# SSH เข้า server
ssh root@167.172.65.185

# อัพเดทระบบ
apt update && apt upgrade -y

# ติดตั้ง Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# ติดตั้ง Docker Compose
curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# ติดตั้ง Git
apt install -y git

# ตั้งค่า Firewall
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

### ขั้นตอนที่ 2: Clone โปรเจ็ค

```bash
# สร้างโฟลเดอร์
mkdir -p /var/www

# Clone โปรเจ็ค
cd /var/www
git clone https://github.com/Crane25/nextjs-payment-system.git scjsnext
cd scjsnext
```

### ขั้นตอนที่ 3: ตั้งค่า Cloudflare

**⚠️ สำคัญ: ต้องตั้งค่า Cloudflare ก่อน deploy**

1. **DNS Settings ใน Cloudflare Dashboard:**
   ```
   Type: A
   Name: scjsnext.com
   Content: 167.172.65.185
   Proxy status: ☁️ Proxied (สีส้ม)
   
   Type: A  
   Name: www
   Content: 167.172.65.185
   Proxy status: ☁️ Proxied (สีส้ม)
   ```

2. **SSL/TLS Settings ใน Cloudflare:**
   ```
   SSL/TLS > Overview > Encryption mode: Full
   SSL/TLS > Edge Certificates > Always Use HTTPS: ON
   SSL/TLS > Edge Certificates > HTTP Strict Transport Security: Enable
   ```

3. **Security Settings (แนะนำ):**
   ```
   Security > Settings > Security Level: Medium
   Security > Settings > Bot Fight Mode: ON
   ```

### ขั้นตอนที่ 4: Deploy

```bash
# ไปที่โฟลเดอร์ deployment
cd deployment

# รัน deployment script
chmod +x deploy.sh
./deploy.sh
```

## 🌐 URL หลังจาก Deploy สำเร็จ

- **Primary:** https://scjsnext.com
- **WWW:** https://www.scjsnext.com  
- **Health Check:** https://scjsnext.com/health

## 🛠️ คำสั่งจัดการระบบ

### การจัดการ Application

```bash
# ดู logs
docker-compose logs -f

# ดู logs เฉพาะ Next.js
docker-compose logs -f nextjs

# ดู logs เฉพาะ Nginx
docker-compose logs -f nginx

# Restart application
docker-compose restart nextjs

# Restart ทั้งระบบ
docker-compose restart

# Stop ทั้งระบบ
docker-compose down

# อัพเดท application
git pull origin main
docker-compose up -d --build
```

### การตรวจสอบสถานะ

```bash
# ดูสถานะ containers
docker-compose ps

# ดูการใช้ resources
docker stats

# ทดสอบเว็บไซต์
curl -I https://scjsnext.com
curl https://scjsnext.com/health
```

## 🔍 Troubleshooting

### ปัญหาที่พบบ่อย

#### 1. เว็บไซต์เข้าไม่ได้
```bash
# ตรวจสอบ containers
docker-compose ps

# ตรวจสอบ logs
docker-compose logs nginx
docker-compose logs nextjs

# ตรวจสอบ firewall
ufw status
```

#### 2. SSL ไม่ทำงาน
```bash
# ตรวจสอบ Cloudflare settings
# - DNS ต้องเป็น Proxied (☁️)
# - SSL/TLS mode ต้องเป็น "Full"

# ตรวจสอบ nginx config
docker-compose exec nginx nginx -t
```

#### 3. 502 Bad Gateway
```bash
# ตรวจสอบ Next.js container
docker-compose logs nextjs

# Restart Next.js
docker-compose restart nextjs
```

#### 4. Real IP ไม่ถูกต้อง
```bash
# ตรวจสอบ Cloudflare IP ranges ใน nginx.conf
# หากมี IP ranges ใหม่ จาก Cloudflare อาจต้องอัพเดท
```

### การแก้ไขปัญหาทั่วไป

```bash
# รีสตาร์ททั้งระบบ
docker-compose down
docker-compose up -d

# ล้าง Docker cache
docker system prune -f

# อัพเดทและ rebuild
git pull origin main
docker-compose up -d --build --force-recreate
```

## 📊 การ Monitor และ Logging

### Log Files
```bash
# Application logs
docker-compose logs nextjs

# Web server logs  
docker-compose logs nginx

# System logs
journalctl -f
```

### Performance Monitoring
```bash
# ดูการใช้ CPU และ Memory
docker stats

# ดูขนาด logs
du -sh /var/lib/docker/containers/*/logs/

# ดู network traffic
ss -tuln
```

## 🔄 การอัพเดท

### อัพเดท Application
```bash
cd /var/www/scjsnext
git pull origin main
cd deployment
docker-compose up -d --build
```

### อัพเดท System
```bash
# อัพเดท packages
apt update && apt upgrade -y

# อัพเดท Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
```

## 🛡️ Security Features

### ✅ Features ที่เปิดใช้งานแล้ว:

- **Cloudflare SSL:** HTTPS encryption และ auto-renewal
- **Security Headers:** XSS Protection, Content Security Policy, HSTS
- **Rate Limiting:** API และ login endpoint protection  
- **Real IP Detection:** ดึง IP จริงจาก Cloudflare
- **Firewall:** UFW กับพอร์ตที่จำเป็นเท่านั้น
- **Container Security:** Non-root user, dropped capabilities
- **DDoS Protection:** ผ่าน Cloudflare

### 🔧 Cloudflare Features:

- **CDN:** Cache static files ทั่วโลก
- **DDoS Protection:** อัตโนมัติ
- **Bot Protection:** Bot Fight Mode
- **Analytics:** Real-time traffic analytics
- **WAF:** Web Application Firewall (ตั้งค่าเพิ่มได้)

## 📋 Checklist หลัง Deploy

- [ ] เว็บไซต์เข้าได้ผ่าน https://scjsnext.com
- [ ] SSL certificate ทำงานปกติ (เห็นไอคอนกุญแจ)
- [ ] Health check ตอบกลับ: https://scjsnext.com/health
- [ ] ไม่มี console errors ใน browser
- [ ] Cloudflare Analytics แสดงข้อมูล traffic
- [ ] Rate limiting ทำงาน (ทดสอบด้วยการส่ง request หลายครั้ง)

## 📞 Support

หากมีปัญหา:

1. **ตรวจสอบ logs:** `docker-compose logs -f`
2. **ตรวจสอบสถานะ:** `docker-compose ps`
3. **ทดสอบ connectivity:** `curl -I https://scjsnext.com`
4. **ตรวจสอบ Cloudflare dashboard:** Analytics และ Security events

---

**🎉 ระบบ Next.js Payment System v2.0 พร้อมใช้งาน production พร้อม enterprise-grade security ผ่าน Cloudflare!**