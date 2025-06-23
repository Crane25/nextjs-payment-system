# 🚀 คู่มือติดตั้ง Next.js บน DigitalOcean Droplet

คู่มือนี้จะช่วยคุณติดตั้งและ deploy Next.js application ไปยัง DigitalOcean Droplet พร้อม SSL certificate และ domain scjsnext.com

## 📋 ข้อกำหนดเบื้องต้น

- DigitalOcean Droplet (Ubuntu 20.04 LTS หรือสูงกว่า)
- Domain name (scjsnext.com) ที่ชี้ไปยัง Droplet IP
- Email address สำหรับ SSL certificate

## 🛠️ ขั้นตอนการติดตั้ง

### 1. เตรียม DigitalOcean Droplet

1. สร้าง Droplet ใหม่บน DigitalOcean:
   - **Image**: Ubuntu 20.04 LTS
   - **Size**: Basic - 2GB RAM, 1 vCPU, 50GB SSD ($12/month)
   - **Region**: เลือกที่ใกล้ผู้ใช้ที่สุด
   - **Authentication**: SSH Key (แนะนำ) หรือ Password

2. รอจน Droplet พร้อมใช้งานและจดบันทึก IP address

### 2. ตั้งค่า DNS Records

ไปยัง DNS provider ของคุณ (เช่น Cloudflare, Namecheap) และตั้งค่า:

```
Type    Name    Value               TTL
A       @       YOUR_DROPLET_IP     300
A       www     YOUR_DROPLET_IP     300
```

### 3. เชื่อมต่อกับ Droplet

```bash
ssh root@YOUR_DROPLET_IP
```

### 4. รัน Script ติดตั้งอัตโนมัติ

```bash
# สร้าง user ใหม่ (แนะนำ)
adduser deploy
usermod -aG sudo deploy
su - deploy

# Download และรัน installation script
wget https://raw.githubusercontent.com/your-repo/paymentnew/main/deployment/install.sh
chmod +x install.sh
./install.sh
```

### 5. Upload Project Files

#### วิธีที่ 1: ใช้ Git (แนะนำ)

```bash
cd /var/www/scjsnext
git clone https://github.com/your-username/paymentnew.git .
```

#### วิธีที่ 2: ใช้ SCP

```bash
# จากเครื่อง local
scp -r paymentnew/ deploy@YOUR_DROPLET_IP:/var/www/scjsnext/
```

### 6. ตั้งค่า Environment Variables

```bash
cd /var/www/scjsnext/Frontend
cp ../deployment/env.example .env.local

# แก้ไขไฟล์ .env.local
nano .env.local
```

**ใส่ค่าตัวแปรจาก Firebase และการตั้งค่าอื่นๆ:**

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAvEe...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=paymentnew-dae57.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=paymentnew-dae57
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=paymentnew-dae57.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1074850368558
NEXT_PUBLIC_FIREBASE_APP_ID=1:1074850368558:web:...
NODE_ENV=production
```

### 7. แก้ไข Docker Compose Configuration

```bash
cd /var/www/scjsnext/deployment
nano docker-compose.yml
```

**แก้ไข email address ใน certbot service:**

```yaml
command: certonly --webroot -w /var/www/certbot --force-renewal --email YOUR_EMAIL@example.com -d scjsnext.com -d www.scjsnext.com --agree-tos
```

### 8. Deploy Application

```bash
cd /var/www/scjsnext/deployment
chmod +x deploy.sh
./deploy.sh
```

## 🔐 การตั้งค่า SSL Certificate

Script จะทำการติดตั้ง SSL certificate อัตโนมัติโดยใช้ Let's Encrypt

### ตรวจสอบ SSL Certificate

```bash
# ตรวจสอบสถานะ certificate
docker-compose exec certbot certbot certificates

# ทดสอบการต่ออายุ
docker-compose run --rm certbot renew --dry-run
```

## 📊 การตรวจสอบและจัดการ

### ตรวจสอบสถานะ Services

```bash
cd /var/www/scjsnext/deployment

# ดู container ที่กำลังทำงาน
docker-compose ps

# ดู logs
docker-compose logs -f

# ดู logs ของ service เฉพาะ
docker-compose logs nginx
docker-compose logs nextjs
```

### คำสั่งที่มีประโยชน์

```bash
# Restart services
docker-compose restart

# Stop services
docker-compose down

# Update application
git pull origin main
docker-compose up -d --build

# View system resources
htop
df -h
free -h
```

## 🔄 การอัปเดต Application

```bash
cd /var/www/scjsnext

# Pull latest changes
git pull origin main

# Rebuild and restart
cd deployment
docker-compose up -d --build
```

## 🚨 การแก้ไขปัญหา

### ตรวจสอบ Logs

```bash
# Application logs
docker-compose logs nextjs

# Nginx logs
docker-compose logs nginx

# System logs
journalctl -u docker
```

### ปัญหาที่พบบ่อย

1. **Domain ไม่สามารถเข้าถึงได้**
   - ตรวจสอบ DNS records
   - ตรวจสอบ firewall: `sudo ufw status`

2. **SSL Certificate Error**
   - ตรวจสอบว่า domain ชี้มาที่ server ถูกต้อง
   - รัน: `docker-compose logs certbot`

3. **Application ไม่ทำงาน**
   - ตรวจสอบ .env.local file
   - ตรวจสอบ Docker images: `docker images`

### การสำรองข้อมูล

```bash
# สำรอง SSL certificates
sudo tar -czf ssl-backup.tar.gz /var/www/scjsnext/deployment/certbot/

# สำรอง application data
sudo tar -czf app-backup.tar.gz /var/www/scjsnext/
```

## 🎯 การปรับแต่งประสิทธิภาพ

### ติดตั้ง Monitoring

```bash
# Install htop for system monitoring
sudo apt install htop

# Install Docker stats
docker stats
```

### ตั้งค่า Log Rotation

```bash
# สร้างไฟล์ logrotate
sudo nano /etc/logrotate.d/nginx-docker

# เพิ่มเนื้อหา:
/var/www/scjsnext/deployment/nginx/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    create 0644 root root
    postrotate
        docker-compose -f /var/www/scjsnext/deployment/docker-compose.yml exec nginx nginx -s reload
    endscript
}
```

## 📱 การติดตาม

### Health Check URL

- **Application**: https://scjsnext.com/api/health
- **SSL Check**: https://www.ssllabs.com/ssltest/

### Performance Monitoring

```bash
# ตรวจสอบ CPU และ Memory
htop

# ตรวจสอบ Disk Usage
df -h

# ตรวจสอบ Network
iftop
```

## 🆘 การติดต่อและสนับสนุน

หากพบปัญหาในการติดตั้ง:

1. ตรวจสอบ logs ด้วยคำสั่งที่ระบุไว้
2. ตรวจสอบ DNS และ SSL configuration
3. ตรวจสอบ firewall settings
4. ตรวจสอบ Docker services status

---

## 📝 บันทึกสำคัญ

- ✅ Backup ข้อมูลสำคัญก่อนทำการอัปเดต
- ✅ ตรวจสอบ SSL certificate จะหมดอายุใน 90 วัน
- ✅ Monitor system resources เป็นประจำ
- ✅ เก็บ logs สำหรับการแก้ไขปัญหา

**🎉 ยินดีด้วย! คุณติดตั้ง Next.js application บน DigitalOcean เรียบร้อยแล้ว**

เข้าชมเว็บไซต์ได้ที่: https://scjsnext.com 