#!/bin/bash

# ===================================
# Upload Files Script (No Git Required)
# สำหรับ upload ไฟล์ไปยัง DigitalOcean Droplet
# ===================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration - แก้ไขค่าเหล่านี้
SERVER_IP="YOUR_DROPLET_IP"           # เปลี่ยนเป็น IP ของ Droplet
SERVER_USER="deploy"                  # ชื่อ user บน server
SERVER_PATH="/var/www/scjsnext"       # path บน server
LOCAL_PROJECT_DIR="../"               # path ของโปรเจ็คในเครื่อง

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
echo -e "${BLUE} File Upload Script${NC}"
echo -e "${BLUE} Target: $SERVER_USER@$SERVER_IP:$SERVER_PATH${NC}"
echo -e "${BLUE}========================================${NC}"

# Check if SSH key exists
if [ ! -f ~/.ssh/id_rsa ]; then
    print_warning "SSH key not found. You may need to enter password."
fi

# Test SSH connection
print_status "Testing SSH connection..."
if ssh -o ConnectTimeout=5 $SERVER_USER@$SERVER_IP "echo 'Connection successful'" 2>/dev/null; then
    print_status "✅ SSH connection successful"
else
    print_error "❌ Cannot connect to server. Please check:"
    echo "  - Server IP: $SERVER_IP"
    echo "  - Username: $SERVER_USER"
    echo "  - SSH key or password"
    exit 1
fi

# Create directory structure on server
print_status "Creating directories on server..."
ssh $SERVER_USER@$SERVER_IP "mkdir -p $SERVER_PATH"

# Upload files using rsync
print_status "Uploading project files..."

# Create exclusion list
cat > /tmp/rsync_exclude << EOF
node_modules/
.next/
.git/
*.log
.env.local
.DS_Store
Thumbs.db
coverage/
.nyc_output/
EOF

# Upload files with rsync
rsync -avz \
    --exclude-from=/tmp/rsync_exclude \
    --progress \
    $LOCAL_PROJECT_DIR \
    $SERVER_USER@$SERVER_IP:$SERVER_PATH/

# Clean up temp file
rm /tmp/rsync_exclude

# Set proper permissions
print_status "Setting file permissions..."
ssh $SERVER_USER@$SERVER_IP "
    cd $SERVER_PATH
    chmod +x deployment/install.sh
    chmod +x deployment/deploy.sh
    chmod -R 755 deployment/
"

print_status "✅ Files uploaded successfully!"
echo ""
echo "📋 Next steps:"
echo "1. SSH to server: ssh $SERVER_USER@$SERVER_IP"
echo "2. Go to project: cd $SERVER_PATH"
echo "3. Set up environment: cp deployment/env.example Frontend/.env.local"
echo "4. Edit environment: nano Frontend/.env.local"
echo "5. Deploy: cd deployment && ./deploy.sh"
echo ""
print_status "Upload completed!" 