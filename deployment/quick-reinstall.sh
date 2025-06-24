#!/bin/bash

# ====================================================================
# Quick Reinstallation Script
# Next.js Payment System v2.0
# Fast cleanup and reinstall for troubleshooting
# ====================================================================

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

echo -e "${BLUE}====================================================================
🔄 QUICK REINSTALLATION - Next.js Payment System v2.0
====================================================================${NC}"

print_warning "⚠️ This will completely remove and reinstall the entire system!"
print_warning "⚠️ All containers, images, volumes, and logs will be deleted!"
echo ""
read -p "Are you sure you want to continue? Type 'YES' to confirm: " confirm

if [ "$confirm" != "YES" ]; then
    print_status "Operation cancelled"
    exit 0
fi

print_status "🚀 Starting complete system reinstallation..."

# Step 1: Complete Docker cleanup
print_status "1️⃣ Performing complete Docker cleanup..."

# Stop all containers
print_status "Stopping all containers..."
docker stop $(docker ps -aq) 2>/dev/null || true

# Remove all containers
print_status "Removing all containers..."
docker rm $(docker ps -aq) 2>/dev/null || true

# Remove all images
print_status "Removing all Docker images..."
docker rmi $(docker images -aq) 2>/dev/null || true

# Remove all volumes
print_status "Removing all Docker volumes..."
docker volume rm $(docker volume ls -q) 2>/dev/null || true

# Remove all networks
print_status "Removing all Docker networks..."
docker network rm $(docker network ls -q) 2>/dev/null || true

# System-wide Docker cleanup
print_status "Performing system-wide Docker cleanup..."
docker system prune -af --volumes 2>/dev/null || true

# Clear Docker build cache
print_status "Clearing Docker build cache..."
docker builder prune -af 2>/dev/null || true

print_status "✅ Docker cleanup completed"

# Step 2: Update code from Git
print_status "2️⃣ Updating code from Git repository..."

cd /var/www/scjsnext

# Backup environment file if exists
if [ -f "Frontend/.env.local" ]; then
    print_status "Backing up environment file..."
    cp Frontend/.env.local /tmp/env.local.backup
    ENV_BACKUP=true
else
    ENV_BACKUP=false
fi

# Hard reset Git repository
print_status "Resetting Git repository..."
git fetch origin
git reset --hard origin/main
git clean -fd

# Restore environment file
if [ "$ENV_BACKUP" = true ]; then
    print_status "Restoring environment file..."
    cp /tmp/env.local.backup Frontend/.env.local
    rm /tmp/env.local.backup
fi

print_status "✅ Code update completed"

# Step 3: Clean filesystem
print_status "3️⃣ Cleaning filesystem..."

# Remove old logs and cache
print_status "Removing old logs and cache..."
rm -rf deployment/nginx/logs/* 2>/dev/null || true
rm -rf /var/log/payment-app/* 2>/dev/null || true
rm -rf /var/log/nginx/* 2>/dev/null || true
rm -rf Frontend/.next 2>/dev/null || true
rm -rf Frontend/node_modules 2>/dev/null || true

# Recreate necessary directories
print_status "Recreating directory structure..."
mkdir -p deployment/nginx/logs
mkdir -p /var/log/payment-app
mkdir -p /var/log/nginx
mkdir -p /var/lib/docker/volumes/payment-data

# Set proper permissions
print_status "Setting file permissions..."
chmod +x deployment/*.sh
chown -R 1001:1001 /var/log/payment-app 2>/dev/null || true

print_status "✅ Filesystem cleanup completed"

# Step 4: Restart Docker service
print_status "4️⃣ Restarting Docker service..."
systemctl restart docker
sleep 10

print_status "✅ Docker service restarted"

# Step 5: Run fresh installation
print_status "5️⃣ Running fresh installation..."

cd deployment

# Validate configuration before deployment
print_status "Validating configuration..."
if ! docker compose config -q; then
    print_error "Docker Compose configuration is invalid!"
    exit 1
fi

print_status "Configuration validated successfully"

# Run production deployment
print_status "Starting production deployment..."
./production-deploy.sh

print_status "✅ Fresh installation completed"

echo -e "${BLUE}====================================================================
🎉 QUICK REINSTALLATION COMPLETED SUCCESSFULLY!
====================================================================${NC}"

print_status "🌐 Your Next.js Payment System has been completely reinstalled!"
echo ""
echo -e "${GREEN}🔗 Access your website:${NC}"
echo "   Primary: https://scjsnext.com"
echo "   Health: https://scjsnext.com/nginx-health"
echo ""
echo -e "${GREEN}📊 Check status:${NC}"
echo "   docker compose ps"
echo "   docker compose logs -f"
echo ""
echo -e "${YELLOW}📝 Note:${NC}"
echo "   - System may take 2-3 minutes to fully warm up"
echo "   - Cloudflare cache may need 5-10 minutes to clear"
echo "   - Check browser console for any remaining errors"
echo ""

print_status "🚀 System reinstallation completed successfully!"