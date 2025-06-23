#!/bin/bash

# Fix Nginx Mount Issue - Quick Resolution Script
# This script fixes the Docker nginx configuration mounting error

echo "🔧 Fixing Nginx Docker Mount Issue..."
echo "======================================="

# Navigate to deployment directory
cd /var/www/scjsnext/deployment

# Stop any running containers
echo "📦 Stopping existing containers..."
docker-compose -f docker-compose-no-ssl.yml down 2>/dev/null || true

# Remove any orphaned containers
echo "🧹 Cleaning up orphaned containers..."
docker system prune -f

# Verify the nginx-no-ssl.conf file exists
if [ ! -f "./nginx/nginx-no-ssl.conf" ]; then
    echo "❌ Error: nginx-no-ssl.conf file is missing!"
    echo "📝 Creating nginx-no-ssl.conf file..."
    
    # Create the nginx directory if it doesn't exist
    mkdir -p ./nginx
    
    # Create the nginx-no-ssl.conf file (this should already be done via Git/upload)
    echo "⚠️  Please ensure nginx-no-ssl.conf is uploaded to deployment/nginx/ directory"
    echo "   You can find this file in your local project at deployment/nginx/nginx-no-ssl.conf"
    exit 1
fi

echo "✅ nginx-no-ssl.conf file found"

# Create logs directory if it doesn't exist
echo "📁 Creating nginx logs directory..."
mkdir -p ./nginx/logs

# Set proper permissions
echo "🔐 Setting proper permissions..."
chmod 644 ./nginx/nginx-no-ssl.conf
chmod 755 ./nginx/logs

# Build and start containers
echo "🚀 Building and starting containers..."
docker-compose -f docker-compose-no-ssl.yml up --build -d

# Wait a moment for containers to start
echo "⏳ Waiting for containers to initialize..."
sleep 10

# Check container status
echo "📊 Container Status:"
docker-compose -f docker-compose-no-ssl.yml ps

# Check if containers are running
if docker-compose -f docker-compose-no-ssl.yml ps | grep -q "Up"; then
    echo ""
    echo "🎉 SUCCESS! Containers are running!"
    echo "🌐 Your application should be available at: http://$(curl -s ifconfig.me || echo 'YOUR_SERVER_IP')"
    echo ""
    echo "📋 Useful commands:"
    echo "   View logs: docker-compose -f docker-compose-no-ssl.yml logs -f"
    echo "   Stop: docker-compose -f docker-compose-no-ssl.yml down"
    echo "   Restart: docker-compose -f docker-compose-no-ssl.yml restart"
else
    echo ""
    echo "❌ Some containers failed to start. Checking logs..."
    echo "📋 Container logs:"
    docker-compose -f docker-compose-no-ssl.yml logs --tail=50
    
    echo ""
    echo "🔍 Troubleshooting steps:"
    echo "1. Check if nginx-no-ssl.conf file exists and has correct content"
    echo "2. Verify file permissions are correct"
    echo "3. Check if ports 80 and 3000 are available"
    echo "4. Review Docker logs above for specific errors"
fi

echo ""
echo "�� Script completed!" 