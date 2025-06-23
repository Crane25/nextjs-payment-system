#!/bin/bash

# ===================================
# Auto Update Script
# Next.js Payment System
# Fixes SESSION_SECRET Error
# ===================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print status
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
echo -e "${BLUE} Auto Update & Fix SESSION_SECRET${NC}"
echo -e "${BLUE} Payment System v2.0${NC}"
echo -e "${BLUE}========================================${NC}"

# Check if we're in the right directory
if [ ! -d "/var/www/scjsnext" ]; then
    print_error "Project directory /var/www/scjsnext not found!"
    exit 1
fi

print_status "Going to project directory..."
cd /var/www/scjsnext

print_status "Checking current git status..."
git status --short

print_status "Pulling latest changes from GitHub..."
git pull origin main

print_status "Checking if new files are present..."
if [ -f "Frontend/src/config/env.server.ts" ]; then
    print_status "✅ env.server.ts found - SERVER CONFIG FIX APPLIED"
else
    print_error "❌ env.server.ts not found - Update may have failed"
    exit 1
fi

print_status "Going to deployment directory..."
cd deployment

print_status "Checking Docker Compose configuration..."
if grep -q "SESSION_SECRET=" docker-compose-no-ssl.yml; then
    print_status "✅ SESSION_SECRET found in Docker config"
else
    print_error "❌ SESSION_SECRET not found in Docker config"
    exit 1
fi

print_status "Stopping existing containers..."
docker-compose -f docker-compose-no-ssl.yml down --remove-orphans || true

print_status "Removing old Docker images..."
docker image prune -f || true

print_status "Building and starting containers with new configuration..."
docker-compose -f docker-compose-no-ssl.yml up -d --build

print_status "Waiting for containers to be ready..."
sleep 15

print_status "Checking container status..."
docker-compose -f docker-compose-no-ssl.yml ps

print_status "Testing nginx configuration..."
docker-compose -f docker-compose-no-ssl.yml exec nginx nginx -t

print_status "Checking application logs for errors..."
docker-compose -f docker-compose-no-ssl.yml logs nextjs | tail -20

# Check if containers are running
if docker-compose -f docker-compose-no-ssl.yml ps | grep -q "Up"; then
    print_status "✅ Containers are running successfully!"
else
    print_error "❌ Some containers failed to start. Checking logs..."
    docker-compose -f docker-compose-no-ssl.yml logs
    exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Update Summary${NC}"
echo -e "${BLUE}========================================${NC}"
print_status "🎯 SESSION_SECRET Error Fix Applied Successfully!"

echo ""
echo -e "${GREEN}🌐 Website URLs:${NC}"
echo "   - http://167.172.65.185 (Server IP)"
echo "   - http://localhost (if accessing locally)"

echo ""
echo -e "${GREEN}📊 Container Status:${NC}"
docker-compose -f docker-compose-no-ssl.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo -e "${GREEN}🔍 Testing Application:${NC}"
print_status "Testing application accessibility..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost | grep -q "200"; then
    print_status "✅ Application is accessible and working!"
    echo ""
    echo -e "${GREEN}🎉 SUCCESS: SESSION_SECRET error should be fixed!${NC}"
    echo -e "${GREEN}   Open http://167.172.65.185 and check browser console${NC}"
    echo -e "${GREEN}   The SESSION_SECRET error should no longer appear${NC}"
else
    print_warning "⚠️ Application may not be fully ready yet."
    echo "   Please wait a moment and check http://167.172.65.185"
fi

echo ""
echo -e "${GREEN}📝 Useful Commands:${NC}"
echo "   - View logs: docker-compose -f docker-compose-no-ssl.yml logs -f"
echo "   - Restart: docker-compose -f docker-compose-no-ssl.yml restart"
echo "   - Stop: docker-compose -f docker-compose-no-ssl.yml down"

print_status "Update completed!"
echo -e "${BLUE}========================================${NC}" 