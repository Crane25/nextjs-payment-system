#!/bin/bash

# Deploy Firestore Security Rules to Production
# สำหรับแก้ปัญหาการสมัครสมาชิกใน production server

echo "🔐 Deploying Firestore Security Rules..."
echo "========================================"

# ตรวจสอบว่ามี Firebase CLI หรือไม่
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it first:"
    echo "   npm install -g firebase-tools"
    exit 1
fi

# ตรวจสอบว่า login แล้วหรือไม่
echo "🔍 Checking Firebase authentication..."
firebase projects:list > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ Not logged in to Firebase. Please run:"
    echo "   firebase login"
    exit 1
fi

# แสดงโปรเจคปัจจุบัน
echo "📋 Current Firebase project:"
firebase use

# ยืนยันการ deploy
echo ""
echo "⚠️  Warning: This will update Firestore Security Rules in production!"
echo "📝 Changes include:"
echo "   - Relaxed rules for usernames collection"
echo "   - Multiple fallback rules for registration"
echo "   - Emergency rules for production issues"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled."
    exit 1
fi

# Deploy rules
echo "🚀 Deploying Firestore rules..."
firebase deploy --only firestore:rules

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Firestore rules deployed successfully!"
    echo ""
    echo "🎯 Next steps:"
    echo "1. Test user registration on production server"
    echo "2. Check Firestore console for usernames collection data"
    echo "3. Monitor console logs for any remaining errors"
    echo ""
    echo "📊 Rules summary:"
    echo "- usernames collection: 3 fallback rules for production"
    echo "- users collection: 3 fallback rules for production"
    echo "- Emergency rules for auth token issues"
else
    echo ""
    echo "❌ Deployment failed!"
    echo "Please check the error messages above."
    exit 1
fi 