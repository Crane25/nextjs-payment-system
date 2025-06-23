#!/bin/bash

# ===================================
# Deployment Script (No SSL)
# Next.js Payment System
# ===================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/var/www/scjsnext"
DEPLOYMENT_DIR="$PROJECT_DIR/deployment"

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
echo -e "${BLUE} Deploying Next.js Application (No SSL)${NC}"
echo -e "${BLUE} Payment System v2.0${NC}"
echo -e "${BLUE}========================================${NC}"

# Check if we're in the right directory
if [ ! -f "docker-compose-no-ssl.yml" ] && [ ! -f "docker-compose.yml" ]; then
    print_error "docker-compose.yml not found. Please run this script from the deployment directory."
    exit 1
fi

# Check if .env.local exists
if [ ! -f "../Frontend/.env.local" ]; then
    print_warning ".env.local file not found in Frontend directory"
    print_status "Creating .env.local from template..."
    
    if [ -f "env.example" ]; then
        cp env.example ../Frontend/.env.local
        print_warning "Please edit ../Frontend/.env.local with your environment variables"
        echo "Press Enter to continue after editing .env.local..."
        read
    else
        print_error "env.example not found. Please create ../Frontend/.env.local manually"
        exit 1
    fi
fi

# Create docker-compose-no-ssl.yml if it doesn't exist
if [ ! -f "docker-compose-no-ssl.yml" ]; then
    print_status "Creating docker-compose-no-ssl.yml..."
    cat > docker-compose-no-ssl.yml << 'EOF'
version: '3.8'

services:
  # Next.js Application
  nextjs:
    build:
      context: ..
      dockerfile: deployment/Dockerfile
    container_name: nextjs-app
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3000
    networks:
      - app-network
    volumes:
      - ../Frontend/.env.local:/app/.env.local:ro

  # Nginx Reverse Proxy (No SSL)
  nginx:
    image: nginx:alpine
    container_name: nginx-proxy
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx-no-ssl.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/logs:/var/log/nginx
    networks:
      - app-network
    depends_on:
      - nextjs

networks:
  app-network:
    driver: bridge
EOF
fi

# Create nginx-no-ssl.conf if it doesn't exist
if [ ! -f "nginx/nginx-no-ssl.conf" ]; then
    print_status "Creating nginx configuration without SSL..."
    mkdir -p nginx
    cat > nginx/nginx-no-ssl.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    
    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    
    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log;
    
    # Basic settings
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    
    # Upstream for Next.js
    upstream nextjs {
        server nextjs:3000;
    }
    
    server {
        listen 80;
        server_name _;
        
        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        
        # Main location
        location / {
            proxy_pass http://nextjs;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            
            # Timeouts
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }
        
        # API rate limiting
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://nextjs;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
        
        # Static files caching
        location /_next/static/ {
            proxy_pass http://nextjs;
            proxy_cache_valid 200 1y;
            add_header Cache-Control "public, immutable";
        }
        
        # Health check
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
EOF
fi

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose -f docker-compose-no-ssl.yml down --remove-orphans || true

# Remove old images (optional)
read -p "Do you want to remove old Docker images? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Removing old Docker images..."
    docker system prune -f
    docker image prune -a -f
fi

# Build and start containers
print_status "Building and starting containers..."
docker-compose -f docker-compose-no-ssl.yml up -d --build

# Wait for containers to be ready
print_status "Waiting for containers to be ready..."
sleep 15

# Check container status
print_status "Checking container status..."
docker-compose -f docker-compose-no-ssl.yml ps

# Test nginx configuration
print_status "Testing nginx configuration..."
docker-compose -f docker-compose-no-ssl.yml exec nginx nginx -t

# Check if containers are running
if docker-compose -f docker-compose-no-ssl.yml ps | grep -q "Up"; then
    print_status "Containers are running successfully!"
else
    print_error "Some containers failed to start"
    docker-compose -f docker-compose-no-ssl.yml logs
    exit 1
fi

# Display final status
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Deployment Summary${NC}"
echo -e "${BLUE}========================================${NC}"

print_status "Application deployed successfully!"
echo ""
echo "🌐 Website URLs:"
echo "   - http://$(curl -s ifconfig.me) (Server IP)"
echo "   - http://localhost (if accessing locally)"
echo ""
echo "📊 Container Status:"
docker-compose -f docker-compose-no-ssl.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "📝 Useful Commands:"
echo "   - View logs: docker-compose -f docker-compose-no-ssl.yml logs -f"
echo "   - Restart: docker-compose -f docker-compose-no-ssl.yml restart"
echo "   - Stop: docker-compose -f docker-compose-no-ssl.yml down"
echo "   - Update: docker-compose -f docker-compose-no-ssl.yml up -d --build"
echo ""

# Check if application is accessible
print_status "Testing application accessibility..."
sleep 5
if curl -s -I "http://localhost" | grep -q "200\|301\|302"; then
    print_status "✅ Application is accessible!"
else
    print_warning "⚠️  Application might not be ready yet. Please wait a moment and try again."
fi

print_status "Deployment completed!"
print_status "Your application is running on port 80 (HTTP only)"
echo "" 