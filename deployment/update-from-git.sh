#!/bin/bash

# Update from Git Script for Ubuntu Server
# Usage: ./update-from-git.sh [repository-url]

set -e  # Exit on any error

# Configuration
PROJECT_DIR="/var/www/paymentnew"  # Change this to your project path
GITHUB_REPO="${1:-https://github.com/YOUR_USERNAME/YOUR_REPOSITORY_NAME.git}"
BACKUP_DIR="/tmp/paymentnew-backup-$(date +%Y%m%d-%H%M%S)"

echo "🚀 Starting Git update process..."
echo "Repository: $GITHUB_REPO"
echo "Project Directory: $PROJECT_DIR"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Function to backup important files
backup_files() {
    echo "📦 Backing up important files..."
    if [ -f "$PROJECT_DIR/Frontend/.env.local" ]; then
        cp "$PROJECT_DIR/Frontend/.env.local" "$BACKUP_DIR/.env.local"
        echo "✅ Backed up .env.local"
    fi
    
    if [ -f "$PROJECT_DIR/Frontend/.env.production" ]; then
        cp "$PROJECT_DIR/Frontend/.env.production" "$BACKUP_DIR/.env.production"
        echo "✅ Backed up .env.production"
    fi
    
    # Backup any custom configuration files
    if [ -f "$PROJECT_DIR/deployment/docker-compose.override.yml" ]; then
        cp "$PROJECT_DIR/deployment/docker-compose.override.yml" "$BACKUP_DIR/docker-compose.override.yml"
        echo "✅ Backed up docker-compose.override.yml"
    fi
}

# Function to restore important files
restore_files() {
    echo "📂 Restoring important files..."
    if [ -f "$BACKUP_DIR/.env.local" ]; then
        cp "$BACKUP_DIR/.env.local" "$PROJECT_DIR/Frontend/.env.local"
        echo "✅ Restored .env.local"
    fi
    
    if [ -f "$BACKUP_DIR/.env.production" ]; then
        cp "$BACKUP_DIR/.env.production" "$PROJECT_DIR/Frontend/.env.production"
        echo "✅ Restored .env.production"
    fi
    
    if [ -f "$BACKUP_DIR/docker-compose.override.yml" ]; then
        cp "$BACKUP_DIR/docker-compose.override.yml" "$PROJECT_DIR/deployment/docker-compose.override.yml"
        echo "✅ Restored docker-compose.override.yml"
    fi
}

# Stop services if running
stop_services() {
    echo "🛑 Stopping services..."
    if [ -f "$PROJECT_DIR/deployment/docker-compose.yml" ]; then
        cd "$PROJECT_DIR/deployment"
        docker-compose down || true
        echo "✅ Docker services stopped"
    fi
}

# Check if project directory exists
if [ -d "$PROJECT_DIR" ]; then
    echo "📁 Project directory exists, updating..."
    
    # Backup important files
    backup_files
    
    # Stop services
    stop_services
    
    # Remove old project
    rm -rf "$PROJECT_DIR"
    echo "✅ Removed old project files"
else
    echo "📁 Project directory doesn't exist, creating new..."
fi

# Clone fresh repository
echo "📥 Cloning repository..."
git clone "$GITHUB_REPO" "$PROJECT_DIR"
echo "✅ Repository cloned successfully"

# Restore important files
restore_files

# Set proper permissions
echo "🔐 Setting permissions..."
chown -R www-data:www-data "$PROJECT_DIR" 2>/dev/null || true
chmod -R 755 "$PROJECT_DIR"
chmod 600 "$PROJECT_DIR/Frontend/.env"* 2>/dev/null || true

# Install dependencies
echo "📦 Installing dependencies..."
cd "$PROJECT_DIR/Frontend"
npm ci --production
echo "✅ Dependencies installed"

# Build application
echo "🔨 Building application..."
npm run build
echo "✅ Application built successfully"

# Start services
echo "🚀 Starting services..."
cd "$PROJECT_DIR/deployment"
docker-compose up -d
echo "✅ Services started"

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Health check
echo "🏥 Performing health check..."
if curl -f http://localhost:3000/api/health >/dev/null 2>&1; then
    echo "✅ Health check passed"
else
    echo "⚠️  Health check failed, but services may still be starting"
fi

# Cleanup
echo "🧹 Cleaning up..."
rm -rf "$BACKUP_DIR"

echo "🎉 Update completed successfully!"
echo "📊 Summary:"
echo "   - Repository: $GITHUB_REPO"
echo "   - Project: $PROJECT_DIR"
echo "   - Status: Running"
echo ""
echo "🔗 Access your application at: http://your-server-ip:3000" 