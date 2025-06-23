#!/bin/bash

# ===================================
# Auto Installation Script for DigitalOcean
# Domain: scjsnext.com
# ===================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="scjsnext.com"
EMAIL="your-email@example.com"  # Change this to your email
PROJECT_DIR="/var/www/scjsnext"
USER=$(whoami)

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} DigitalOcean Droplet Setup Script${NC}"
echo -e "${BLUE} Domain: ${DOMAIN}${NC}"
echo -e "${BLUE}========================================${NC}"

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

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root"
   exit 1
fi

# Update system packages
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
print_status "Installing required packages..."
sudo apt install -y \
    curl \
    wget \
    git \
    ufw \
    unzip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

# Install Docker
print_status "Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    sudo usermod -aG docker $USER
    print_status "Docker installed successfully"
else
    print_status "Docker is already installed"
fi

# Install Docker Compose
print_status "Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    print_status "Docker Compose installed successfully"
else
    print_status "Docker Compose is already installed"
fi

# Configure UFW Firewall
print_status "Configuring firewall..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# Create project directory
print_status "Creating project directory..."
sudo mkdir -p $PROJECT_DIR
sudo chown -R $USER:$USER $PROJECT_DIR

# Create necessary directories for deployment
print_status "Creating deployment directories..."
mkdir -p $PROJECT_DIR/deployment/nginx/sites-enabled
mkdir -p $PROJECT_DIR/deployment/nginx/logs
mkdir -p $PROJECT_DIR/deployment/certbot/conf
mkdir -p $PROJECT_DIR/deployment/certbot/www

# Create symbolic link for nginx site
print_status "Setting up nginx configuration..."
cd $PROJECT_DIR/deployment
ln -sf /var/www/scjsnext/deployment/nginx/sites-available/scjsnext.com nginx/sites-enabled/scjsnext.com

# Set proper permissions
sudo chown -R $USER:$USER $PROJECT_DIR
chmod -R 755 $PROJECT_DIR

print_status "Basic setup completed!"
print_warning "Next steps:"
echo "1. Upload your project files to: $PROJECT_DIR"
echo "2. Update the email in docker-compose.yml: $EMAIL"
echo "3. Create .env.local file in Frontend directory"
echo "4. Run: cd $PROJECT_DIR && docker-compose up -d"
echo ""
print_status "Firewall is configured to allow ports 22, 80, 443"
print_status "Project directory created at: $PROJECT_DIR"

# Display system information
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} System Information${NC}"
echo -e "${BLUE}========================================${NC}"
echo "OS: $(lsb_release -d | cut -f2)"
echo "Docker: $(docker --version)"
echo "Docker Compose: $(docker-compose --version)"
echo "IP Address: $(curl -s ifconfig.me)"
echo ""
print_status "Installation completed successfully!"
print_warning "Please reboot the system to ensure all changes take effect." 