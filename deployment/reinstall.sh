#!/bin/bash

# ===================================
# Complete System Reinstallation Script
# Next.js Payment System v2.0
# ลบและติดตั้งใหม่หมดทั้งระบบ
# ===================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Complete System Reinstallation${NC}"
echo -e "${BLUE} Next.js Payment System v2.0${NC}"
echo -e "${BLUE}========================================${NC}"

print_warning "⚠️ คำเตือน: สคริปต์นี้จะลบและติดตั้งระบบใหม่หมดทั้งหมด!"
print_warning "⚠️ ข้อมูลทั้งหมดจะถูกลบ รวมถึง logs และ cache!"
echo ""
read -p "คุณแน่ใจหรือไม่? พิมพ์ 'YES' เพื่อดำเนินการ: " confirm

if [ "$confirm" != "YES" ]; then
    print_status "ยกเลิกการติดตั้ง"
    exit 0
fi

print_status "🚀 เริ่มการติดตั้งใหม่หมดทั้งระบบ..."

# ขั้นตอนที่ 1: หยุดและลบ containers ทั้งหมด
print_status "1️⃣ หยุดและลบ containers ทั้งหมด..."
cd /var/www/scjsnext/deployment 2>/dev/null || cd $(pwd)

# หยุด containers ทั้งหมด
docker compose down -v --remove-orphans 2>/dev/null || true
docker stop $(docker ps -aq) 2>/dev/null || true
docker rm $(docker ps -aq) 2>/dev/null || true

# ลบ images ที่เกี่ยวข้อง
print_status "ลบ Docker images..."
docker rmi $(docker images -q --filter "reference=*nextjs*") 2>/dev/null || true
docker rmi $(docker images -q --filter "reference=*nginx*") 2>/dev/null || true

# ลบ volumes ทั้งหมด
print_status "ลบ Docker volumes..."
docker volume rm $(docker volume ls -q) 2>/dev/null || true

# ลบ networks ที่สร้างขึ้น
print_status "ลบ Docker networks..."
docker network rm payment-network 2>/dev/null || true
docker network prune -f 2>/dev/null || true

# ทำความสะอาด Docker system
print_status "ทำความสะอาด Docker system..."
docker system prune -af --volumes 2>/dev/null || true

print_status "✅ ลบ containers และ images เสร็จสิ้น"

# ขั้นตอนที่ 2: อัพเดท code จาก Git
print_status "2️⃣ อัพเดท code จาก Git..."
cd /var/www/scjsnext

# Backup .env.local หากมี
if [ -f "Frontend/.env.local" ]; then
    print_status "สำรอง .env.local file..."
    cp Frontend/.env.local /tmp/env.local.backup
    ENV_BACKUP_AVAILABLE=true
else
    ENV_BACKUP_AVAILABLE=false
fi

# Reset Git repository
print_status "รีเซ็ต Git repository..."
git fetch origin
git reset --hard origin/main
git clean -fd

# คืนค่า .env.local
if [ "$ENV_BACKUP_AVAILABLE" = true ]; then
    print_status "คืนค่า .env.local file..."
    cp /tmp/env.local.backup Frontend/.env.local
    rm /tmp/env.local.backup
fi

print_status "✅ อัพเดท code เสร็จสิ้น"

# ขั้นตอนที่ 3: เตรียมระบบ
print_status "3️⃣ เตรียมระบบ..."

# ลบไฟล์ cache และ logs เก่า
print_status "ลบไฟล์ cache และ logs เก่า..."
rm -rf deployment/nginx/logs/* 2>/dev/null || true
rm -rf deployment/logs/* 2>/dev/null || true
rm -rf Frontend/.next 2>/dev/null || true
rm -rf Frontend/node_modules 2>/dev/null || true

# สร้างโฟลเดอร์ที่จำเป็น
print_status "สร้างโฟลเดอร์ที่จำเป็น..."
mkdir -p deployment/nginx/logs
mkdir -p deployment/logs
mkdir -p Frontend/logs

# ตั้งค่า permissions
print_status "ตั้งค่า file permissions..."
chmod +x deployment/*.sh
chown -R $USER:$USER /var/www/scjsnext
chown -R 1001:1001 deployment/logs/ 2>/dev/null || true

print_status "✅ เตรียมระบบเสร็จสิ้น"

# ขั้นตอนที่ 4: ตรวจสอบ environment file
print_status "4️⃣ ตรวจสอบ environment configuration..."

if [ ! -f "Frontend/.env.local" ]; then
    print_warning "ไม่พบ .env.local file กำลังสร้างใหม่..."
    
    cat > Frontend/.env.local << 'EOF'
# ===================================
# Production Environment Configuration
# Next.js Payment System v2.0
# ===================================

NODE_ENV=production
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_APP_VERSION=2.0.0
NEXT_PUBLIC_DOMAIN=scjsnext.com

# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAvEe6PF9mnwN8Vqf9wqWUkWA58coXKpiA
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=paymentnew-dae57.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=paymentnew-dae57
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=paymentnew-dae57.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1074850368558
NEXT_PUBLIC_FIREBASE_APP_ID=1:1074850368558:web:f7c3c3f162dfc8af1fa3bf

# Email Configuration
EMAIL_SERVER_USER=rachaelagani63028@gmail.com
EMAIL_SERVER_PASSWORD=24992499Kk
EMAIL_SERVER_HOST=smtp.gmail.com
EMAIL_SERVER_PORT=587
EMAIL_FROM=noreply@scjsnext.com

# Security Configuration (Production)
SESSION_SECRET=4a8f2e9c1b7d6e3f5a8b2c9d1e4f7a0b3c6d9e2f5a8b1c4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b
CSRF_SECRET=9d2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f
ENCRYPTION_KEY=06b259db817f41fbb73ac82a252a3b30
HASH_SALT=dae13683bf304cfb90c3c97b649131aa

# Security Settings
SECURITY_HEADERS_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000
FORCE_HTTPS=false
SECURE_COOKIES=true
CLOUDFLARE_SSL=true

# Session Settings
SESSION_TIMEOUT_MS=3600000
HSTS_ENABLED=true
CSP_ENABLED=true
ENCRYPTION_ENABLED=true
AUDIT_LOG_ENABLED=true

# Debug Configuration (Production)
NEXT_PUBLIC_DEBUG_ENABLED=false
NEXT_PUBLIC_LOG_LEVEL=error
NEXT_PUBLIC_SHOW_ERROR_DETAILS=false
NEXT_PUBLIC_CONSOLE_LOGGING=false
NEXT_PUBLIC_PERFORMANCE_MONITORING=true

# Feature Flags
NEXT_PUBLIC_ENABLE_WITHDRAWALS=true
NEXT_PUBLIC_ENABLE_MULTI_TEAM=true
NEXT_PUBLIC_ENABLE_NOTIFICATIONS=true
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_MAINTENANCE_MODE=false
EOF
    
    print_status "✅ สร้าง .env.local file เสร็จสิ้น"
else
    print_status "✅ พบ .env.local file แล้ว"
fi

print_status "✅ ตรวจสอบ environment เสร็จสิ้น"

# ขั้นตอนที่ 5: รันการติดตั้งใหม่
print_status "5️⃣ เริ่มการติดตั้งระบบใหม่..."

cd deployment

# ตรวจสอบ Docker Compose configuration
print_status "ตรวจสอบ Docker Compose configuration..."
if ! docker compose config -q; then
    print_error "Docker Compose configuration มีข้อผิดพลาด!"
    exit 1
fi

print_status "✅ Docker Compose configuration ถูกต้อง"

# รัน deployment script
print_status "รัน deployment script..."
echo ""
echo -e "${YELLOW}กำลังรัน deploy.sh...${NC}"
echo ""

./deploy.sh

print_status "✅ การติดตั้งระบบเสร็จสิ้น"

# ขั้นตอนที่ 6: ตรวจสอบสุดท้าย
print_status "6️⃣ ตรวจสอบการติดตั้งสุดท้าย..."

# รอให้ระบบพร้อม
sleep 30

# ตรวจสอบ containers
print_status "ตรวจสอบ container status..."
docker compose ps

# ตรวจสอบ health endpoints
print_status "ตรวจสอบ health endpoints..."

# Test local health
if curl -f -s --max-time 5 "http://localhost/health" > /dev/null; then
    print_status "✅ Nginx health: OK"
else
    print_warning "⚠️ Nginx health: Failed"
fi

if curl -f -s --max-time 5 "http://localhost:3000/api/health" > /dev/null; then
    print_status "✅ Next.js health: OK"
else
    print_warning "⚠️ Next.js health: Failed"
fi

# Test external access
if curl -f -s --max-time 10 "https://scjsnext.com/health" > /dev/null; then
    print_status "✅ External access via Cloudflare: OK"
else
    print_warning "⚠️ External access: Failed"
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} การติดตั้งใหม่เสร็จสิ้น! ${NC}"
echo -e "${BLUE}========================================${NC}"

print_status "🎉 ระบบได้รับการติดตั้งใหม่เรียบร้อยแล้ว!"
echo ""
echo -e "${GREEN}📋 สรุปการดำเนินการ:${NC}"
echo "   ✅ ลบ containers และ images เก่า"
echo "   ✅ อัพเดท code จาก Git"
echo "   ✅ ทำความสะอาดระบบ"
echo "   ✅ สร้าง environment configuration"
echo "   ✅ ติดตั้งระบบใหม่หมด"
echo "   ✅ ตรวจสอบการทำงาน"
echo ""
echo -e "${GREEN}🌐 การเข้าถึง:${NC}"
echo "   - เว็บไซต์: https://scjsnext.com"
echo "   - Health check: https://scjsnext.com/health"
echo ""
echo -e "${GREEN}📊 การจัดการ:${NC}"
echo "   - ดู logs: docker compose logs -f"
echo "   - ดูสถานะ: docker compose ps"
echo "   - รีสตาร์ท: docker compose restart"
echo ""
echo -e "${YELLOW}📝 หมายเหตุ:${NC}"
echo "   - ระบบอาจใช้เวลา 2-3 นาทีในการ warm up"
echo "   - Cloudflare cache อาจต้องรอ 5-10 นาที"
echo "   - ตรวจสอบ browser console สำหรับ errors"
echo ""

print_status "🚀 การติดตั้งใหม่เสร็จสมบูรณ์!"

# สร้างไฟล์ summary
cat > reinstall-summary.txt << EOF
# System Reinstallation Summary
Date: $(date)
Script: reinstall.sh
Status: COMPLETED

## Actions Performed:
1. ✅ Removed all Docker containers, images, and volumes
2. ✅ Updated code from Git repository  
3. ✅ Cleaned up old cache and logs
4. ✅ Recreated environment configuration
5. ✅ Performed fresh installation
6. ✅ Verified system health

## Container Status:
$(docker compose ps)

## Health Check Results:
- Nginx: $(curl -f -s --max-time 5 "http://localhost/health" > /dev/null && echo "OK" || echo "Failed")
- Next.js: $(curl -f -s --max-time 5 "http://localhost:3000/api/health" > /dev/null && echo "OK" || echo "Failed")
- External: $(curl -f -s --max-time 10 "https://scjsnext.com/health" > /dev/null && echo "OK" || echo "Failed")

## Next Steps:
- Monitor logs: docker compose logs -f
- Test website: https://scjsnext.com
- Check performance and errors
EOF

print_status "📄 สรุปการติดตั้งบันทึกไว้ในไฟล์: reinstall-summary.txt"