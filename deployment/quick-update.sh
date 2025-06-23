#!/bin/bash

# Quick Update Script
# Usage: ./quick-update.sh

echo "🔄 Quick update from Git..."

# Go to project directory
cd /var/www/paymentnew || cd ~/paymentnew || { echo "❌ Project directory not found"; exit 1; }

# Backup .env files
echo "📦 Backing up .env files..."
cp Frontend/.env.local /tmp/.env.local.backup 2>/dev/null || true
cp Frontend/.env.production /tmp/.env.production.backup 2>/dev/null || true

# Stop Docker services
echo "🛑 Stopping services..."
cd deployment
docker-compose down 2>/dev/null || true

# Update from Git
echo "📥 Updating from Git..."
cd ..
git fetch origin
git reset --hard origin/main

# Restore .env files
echo "📂 Restoring .env files..."
cp /tmp/.env.local.backup Frontend/.env.local 2>/dev/null || true
cp /tmp/.env.production.backup Frontend/.env.production 2>/dev/null || true

# Install dependencies and build
echo "📦 Installing dependencies..."
cd Frontend
npm ci

echo "🔨 Building application..."
npm run build

# Start services
echo "🚀 Starting services..."
cd ../deployment
docker-compose up -d

echo "✅ Update completed!" 