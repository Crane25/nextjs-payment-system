# 🚀 Next.js Payment System v2.0 - Production Deployment

## ภาพรวม

ระบบ Payment Next.js v2.0 พร้อมการใช้งานผ่าน Cloudflare SSL, Docker containerization และการปรับแต่งเพื่อประสิทธิภาพสูงสุด

## 🏗️ สถาปัตยกรรมระบบ

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│  Cloudflare │────│     Nginx    │────│   Next.js   │────│   Firebase   │
│   SSL/CDN   │    │ Reverse Proxy│    │ Application │    │   Backend    │
└─────────────┘    └──────────────┘    └─────────────┘    └──────────────┘
      │                     │                   │                   │
   ✅ HTTPS              ✅ Rate Limit      ✅ Production      ✅ Auth & DB
   ✅ DDoS Protection    ✅ Compression     ✅ Optimized       ✅ Real-time
   ✅ Global CDN         ✅ Load Balance    ✅ Secure          ✅ Scalable
```

## 📋 ข้อกำหนดเบื้องต้น

### เซิร์ฟเวอร์
- **OS**: Ubuntu 20.04+ / Debian 11+
- **RAM**: 2GB+ (แนะนำ 4GB)
- **Storage**: 20GB+ SSD
- **CPU**: 2 cores+
- **Network**: Static IP address

### ซอฟต์แวร์
- Docker Engine 20.10+
- Docker Compose v2.0+
- Git
- Nginx (จะติดตั้งใน container)

### โดเมนและ DNS
- โดเมนที่ลงทะเบียนแล้ว
- Cloudflare account (Free plan เพียงพอ)
- DNS records ที่ตั้งค่าแล้ว

## 🛠️ การติดตั้ง

### 1. เตรียมเซิร์ฟเวอร์

```bash
# อัพเดทระบบ
sudo apt update && sudo apt upgrade -y

# ติดตั้ง Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# ติดตั้ง Git และเครื่องมือเสริม
sudo apt install -y git curl wget dos2unix

# รีสตาร์ทเพื่อใช้งาน Docker
sudo reboot
```

### 2. ตั้งค่า Cloudflare

#### DNS Settings
1. เข้า Cloudflare Dashboard
2. เลือกโดเมนของคุณ
3. ไป DNS → Records
4. เพิ่ม A records:
   ```
   Type: A
   Name: @
   Content: 167.172.65.185
   Proxy: ☁️ Proxied
   
   Type: A  
   Name: www
   Content: 167.172.65.185
   Proxy: ☁️ Proxied
   ```

#### SSL/TLS Settings
1. ไป SSL/TLS → Overview
2. ตั้งค่า SSL/TLS encryption mode: **Full**
3. ไป SSL/TLS → Edge Certificates
4. เปิด **Always Use HTTPS**: ON
5. เปิด **HTTP Strict Transport Security (HSTS)**: ON

#### Security Settings (แนะนำ)
1. ไป Security → Settings
2. ตั้งค่า Security Level: **Medium** หรือ **High**
3. เปิด **Bot Fight Mode**: ON
4. ไป Security → WAF
5. สร้าง Custom Rules ตามความต้องการ

### 3. Clone และตั้งค่า Project

```bash
# Clone repository
cd /var/www
sudo git clone https://github.com/Crane25/nextjs-payment-system.git scjsnext
sudo chown -R $USER:$USER scjsnext
cd scjsnext

# สร้าง production environment file
cp Frontend/.env.example Frontend/.env.local
nano Frontend/.env.local  # แก้ไขค่าตามต้องการ
```

### 4. รัน Deployment Script

```bash
cd deployment
chmod +x deploy.sh
./deploy.sh
```

Script จะทำการ:
- ✅ ตรวจสอบการตั้งค่า Cloudflare
- ✅ สร้าง `.env.local` หากไม่มี
- ✅ ตรวจสอบ Docker configuration
- ✅ Build และ start containers
- ✅ ทดสอบ health checks
- ✅ แสดงสรุปการติดตั้ง

## 🔧 การจัดการระบบ

### คำสั่งพื้นฐาน

```bash
cd /var/www/scjsnext/deployment

# ดูสถานะ containers
docker compose ps

# ดู logs
docker compose logs -f
docker compose logs nextjs  # เฉพาะ Next.js
docker compose logs nginx   # เฉพาะ Nginx

# รีสตาร์ท services
docker compose restart
docker compose restart nextjs  # เฉพาะ Next.js
docker compose restart nginx   # เฉพาะ Nginx

# อัพเดทระบบ
git pull origin main
docker compose up -d --build

# หยุดระบบ
docker compose down

# หยุดและลบ volumes
docker compose down -v
```

### การ Monitor

```bash
# ตรวจสอบ health
curl https://scjsnext.com/health
curl https://scjsnext.com/api/health

# ดู resource usage
docker stats

# ตรวจสอบ disk space
df -h
docker system df

# ดู network connections
docker compose ps --format "table {{.Name}}\t{{.Ports}}\t{{.Status}}"
```

## 🚨 การแก้ไขปัญหา

### ปัญหาทั่วไป

#### 1. Container ไม่สามารถ start ได้
```bash
# ตรวจสอบ logs
docker compose logs

# ตรวจสอบ disk space
df -h

# ลบ containers เก่า
docker compose down -v
docker system prune -f
docker compose up -d --build
```

#### 2. เว็บไซต์เข้าไม่ได้
```bash
# ตรวจสอบ nginx config
docker compose exec nginx nginx -t

# ตรวจสอบ Cloudflare DNS
dig scjsnext.com
nslookup scjsnext.com

# ทดสอบการเชื่อมต่อ
curl -I http://localhost
curl -I https://scjsnext.com
```

#### 3. 503 Service Unavailable
```bash
# ตรวจสอบ Next.js health
docker compose logs nextjs --tail=50
curl http://localhost:3000/api/health

# รีสตาร์ท Next.js
docker compose restart nextjs

# ตรวจสอบ rate limiting
docker compose logs nginx | grep limit_req
```

#### 4. SSL Certificate ไม่ทำงาน
```bash
# ตรวจสอบ Cloudflare SSL mode
# ต้องเป็น "Full" ไม่ใช่ "Full (strict)"

# ตรวจสอบ DNS propagation
dig +trace scjsnext.com

# Clear Cloudflare cache
# ไป Cloudflare Dashboard → Caching → Purge Everything
```

### Log Files

```bash
# Application logs
docker compose logs nextjs > app.log

# Nginx access logs
docker compose exec nginx cat /var/log/nginx/access.log

# Nginx error logs  
docker compose exec nginx cat /var/log/nginx/error.log

# System logs
journalctl -u docker -f
```

## 🔒 Security Best Practices

### การตั้งค่าความปลอดภัย

1. **Firewall Configuration**
   ```bash
   sudo ufw enable
   sudo ufw allow 22    # SSH
   sudo ufw allow 80    # HTTP
   sudo ufw allow 443   # HTTPS
   ```

2. **Regular Updates**
   ```bash
   # อัพเดท OS
   sudo apt update && sudo apt upgrade -y
   
   # อัพเดท Docker images
   docker compose pull
   docker compose up -d
   ```

3. **Backup Strategy**
   ```bash
   # Backup configurations
   tar -czf backup-$(date +%Y%m%d).tar.gz \
     Frontend/.env.local \
     deployment/
   
   # Backup volumes
   docker run --rm \
     -v app-logs:/data \
     -v $(pwd):/backup \
     alpine tar czf /backup/app-logs-$(date +%Y%m%d).tar.gz /data
   ```

### Rate Limiting Configuration

ระบบมี rate limiting หลายระดับ:

- **Static files**: 100 req/s (burst: 500)
- **API endpoints**: 20 req/s (burst: 100)  
- **General requests**: 10 req/s (burst: 50)
- **Login attempts**: 5 req/minute (burst: 10)

## 📊 Performance Monitoring

### Metrics ที่ควร Monitor

1. **Response Times**
   ```bash
   curl -w "@curl-format.txt" -o /dev/null -s https://scjsnext.com
   ```

2. **Container Resources**
   ```bash
   docker stats --no-stream
   ```

3. **Nginx Metrics**
   ```bash
   # Request rate
   docker compose exec nginx grep -c "$(date '+%d/%b/%Y')" /var/log/nginx/access.log
   
   # Error rate
   docker compose exec nginx grep -c "$(date '+%d/%b/%Y')" /var/log/nginx/error.log
   ```

### Performance Optimizations

ระบบได้รับการปรับแต่ง:

- ✅ **Gzip Compression**: ลดขนาดไฟล์ 60-80%
- ✅ **Static File Caching**: Cache 1 ปี
- ✅ **Proxy Buffering**: เพิ่มประสิทธิภาพ I/O
- ✅ **Keep-Alive Connections**: ลด latency
- ✅ **Worker Optimization**: 4096 connections per worker

## 📞 Support & Maintenance

### การอัพเดทระบบ

```bash
# อัพเดทจาก Git
cd /var/www/scjsnext
git pull origin main

# Rebuild และ deploy
cd deployment
docker compose up -d --build

# ตรวจสอบ health
./deploy.sh
```

### การสำรองข้อมูล

```bash
# สำรอง configuration
mkdir -p backups/$(date +%Y%m%d)
cp -r deployment/ backups/$(date +%Y%m%d)/
cp Frontend/.env.local backups/$(date +%Y%m%d)/

# สำรอง Docker volumes
docker run --rm \
  -v app-logs:/source:ro \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/volumes-$(date +%Y%m%d).tar.gz /source
```

## 🎯 Next Steps

หลังจากติดตั้งเสร็จ แนะนำให้:

1. ✅ ทดสอบการทำงานของระบบทั้งหมด
2. ✅ ตั้งค่า monitoring และ alerting
3. ✅ สร้าง backup strategy
4. ✅ ทบทวนการตั้งค่าความปลอดภัย
5. ✅ เตรียม disaster recovery plan

## 📚 เอกสารเพิ่มเติม

- [Next.js Production Deployment](https://nextjs.org/docs/deployment)
- [Docker Compose Production](https://docs.docker.com/compose/production/)
- [Nginx Performance Tuning](https://nginx.org/en/docs/http/ngx_http_core_module.html)
- [Cloudflare Security Settings](https://developers.cloudflare.com/security/)

---

## 📧 ติดต่อ

หากมีปัญหาหรือต้องการความช่วยเหลือ:

- **GitHub Issues**: [nextjs-payment-system/issues](https://github.com/Crane25/nextjs-payment-system/issues)
- **Documentation**: README.md in project root
- **Server Health**: https://scjsnext.com/health

---

*Last updated: $(date '+%Y-%m-%d %H:%M:%S')*