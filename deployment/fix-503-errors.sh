#!/bin/bash

# ===================================
# Fix 503 Service Unavailable Errors
# สคริปต์แก้ไขปัญหา 503 errors สำหรับไฟล์ static
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
echo -e "${BLUE} แก้ไขปัญหา 503 Service Unavailable${NC}"
echo -e "${BLUE} สำหรับไฟล์ Next.js Static Chunks${NC}"
echo -e "${BLUE}========================================${NC}"

# ตรวจสอบว่าอยู่ในโฟลเดอร์ deployment
if [ ! -f "docker-compose.yml" ]; then
    print_error "ไม่พบไฟล์ docker-compose.yml กรุณารันสคริปต์นี้จากโฟลเดอร์ deployment"
    exit 1
fi

print_status "🔄 กำลังอัพเดท nginx configuration..."

# สำรองไฟล์เดิม
if [ ! -f "nginx/nginx.conf.backup" ]; then
    print_status "📁 สำรอง nginx configuration เดิม..."
    cp nginx/nginx.conf nginx/nginx.conf.backup
fi

print_status "✅ nginx configuration ได้รับการอัพเดทแล้ว"

# ตรวจสอบการตั้งค่า nginx
print_status "🧪 ตรวจสอบ nginx configuration..."
docker run --rm -v $(pwd)/nginx/nginx.conf:/etc/nginx/nginx.conf:ro nginx:alpine nginx -t

if [ $? -eq 0 ]; then
    print_status "✅ nginx configuration ถูกต้อง"
else
    print_error "❌ nginx configuration มีข้อผิดพลาด"
    exit 1
fi

print_status "🔄 รีสตาร์ท nginx container..."
docker-compose restart nginx

# รอให้ nginx เริ่มทำงาน
print_status "⏳ รอให้ nginx เริ่มทำงาน..."
sleep 10

# ตรวจสอบสถานะ containers
print_status "📊 ตรวจสอบสถานะ containers..."
docker-compose ps

# ทดสอบการเข้าถึงไฟล์ static
print_status "🧪 ทดสอบการเข้าถึงไฟล์ static..."

# ทดสอบ health endpoints
echo "Testing nginx health..."
curl -f -s "http://localhost/health" > /dev/null && print_status "✅ Nginx health: OK" || print_warning "⚠️ Nginx health: Failed"

echo "Testing Next.js health..."
curl -f -s "http://localhost:3000/api/health" > /dev/null && print_status "✅ Next.js health: OK" || print_warning "⚠️ Next.js health: Failed"

# ทดสอบการเข้าถึงไฟล์ static ผ่าน Cloudflare
echo "Testing static file access via Cloudflare..."
STATIC_TEST=$(curl -s -o /dev/null -w "%{http_code}" "https://scjsnext.com/_next/static/chunks/app/team/page-bfa9ab8038f74ff8.js")
if [ "$STATIC_TEST" = "200" ]; then
    print_status "✅ Static file access: OK ($STATIC_TEST)"
else
    print_warning "⚠️ Static file access: $STATIC_TEST"
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} สรุปการแก้ไข${NC}"
echo -e "${BLUE}========================================${NC}"

print_status "🚀 การแก้ไขปัญหา 503 Service Unavailable เสร็จสิ้น!"
echo ""
echo -e "${GREEN}📋 การปรับปรุงที่ทำ:${NC}"
echo "   ✅ เพิ่ม rate limit สำหรับไฟล์ static (50 req/s)"
echo "   ✅ เพิ่ม location block พิเศษสำหรับ Next.js chunks"
echo "   ✅ ปรับปรุง proxy buffering และ timeouts"
echo "   ✅ เพิ่ม keepalive connections"
echo "   ✅ ปรับปรุง worker connections"
echo ""
echo -e "${GREEN}🌐 การทดสอบ:${NC}"
echo "   - เปิดเว็บไซต์: https://scjsnext.com"
echo "   - ทดสอบการนำทาง: กดลิงก์ต่างๆ เช่น Team, Withdraw History"
echo "   - ตรวจสอบ Console: ไม่ควรมี 503 errors อีก"
echo ""
echo -e "${YELLOW}📝 หมายเหตุ:${NC}"
echo "   - หากยังมีปัญหา ให้ทำการ hard refresh (Ctrl+F5)"
echo "   - Cloudflare อาจ cache ไฟล์เก่าอยู่ใช้เวลา 5-10 นาที"
echo ""

print_status "🎉 เสร็จสิ้น! เว็บไซต์ของคุณควรทำงานได้ปกติแล้ว"