#!/bin/bash

# ========================================
# Ubuntu Deployment Script for Next.js Payment System
# Optimized for Ubuntu 20.04+ and production deployment
# ========================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="nextjs-payment-system"
PROJECT_DIR="/var/www/scjsnext"
DOMAIN="scjsnext.com"
SERVER_IP="167.172.65.185"

# Logging
LOG_FILE="/var/log/payment-deployment.log"
exec 1> >(tee -a "$LOG_FILE")
exec 2> >(tee -a "$LOG_FILE" >&2)

echo_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

echo_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

echo_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        echo_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

check_system() {
    echo_info "Checking system requirements..."
    
    # Check Ubuntu version
    if ! grep -q "Ubuntu" /etc/os-release; then
        echo_error "This script is designed for Ubuntu. Other distributions may not work properly."
        exit 1
    fi
    
    # Check minimum requirements
    TOTAL_RAM=$(free -m | awk 'NR==2{print $2}')
    if [ "$TOTAL_RAM" -lt 1900 ]; then
        echo_warning "RAM is less than 2GB ($TOTAL_RAM MB). Performance may be affected."
    fi
    
    TOTAL_DISK=$(df -m / | awk 'NR==2{print $4}')
    if [ "$TOTAL_DISK" -lt 15000 ]; then
        echo_warning "Available disk space is less than 15GB. May need more space."
    fi
    
    echo_success "System check passed"
}

update_system() {
    echo_info "Updating system packages..."
    apt update && apt upgrade -y
    apt install -y curl wget git ufw fail2ban htop net-tools
    echo_success "System updated successfully"
}

install_docker() {
    echo_info "Installing Docker..."
    
    if command -v docker &> /dev/null; then
        echo_info "Docker is already installed"
        return 0
    fi
    
    # Remove old versions
    apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
    
    # Install Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    
    # Enable and start Docker
    systemctl enable docker
    systemctl start docker
    
    # Install Docker Compose
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    
    # Create docker group and add current user
    usermod -aG docker $USER
    
    echo_success "Docker installed successfully"
}

setup_firewall() {
    echo_info "Setting up firewall..."
    
    # Reset UFW
    ufw --force reset
    
    # Default policies
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH (important!)
    ufw allow ssh
    ufw allow 22/tcp
    
    # Allow HTTP and HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # Allow Docker ports (internal)
    ufw allow 3000/tcp
    
    # Enable firewall
    ufw --force enable
    
    echo_success "Firewall configured successfully"
}

setup_fail2ban() {
    echo_info "Setting up Fail2Ban..."
    
    # Configure Fail2Ban for SSH
    cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
EOF
    
    systemctl enable fail2ban
    systemctl restart fail2ban
    
    echo_success "Fail2Ban configured successfully"
}

setup_project() {
    echo_info "Setting up project directory..."
    
    # Create project directory
    mkdir -p "$PROJECT_DIR"
    cd "$PROJECT_DIR"
    
    # If this is a fresh installation, you might want to clone from Git
    # For now, we assume the code is already in place
    if [ ! -f "deployment/docker-compose.yml" ]; then
        echo_warning "Docker compose file not found. Please ensure code is properly uploaded."
        echo_info "Expected location: $PROJECT_DIR/deployment/docker-compose.yml"
        exit 1
    fi
    
    # Set proper permissions
    chown -R www-data:www-data "$PROJECT_DIR"
    chmod -R 755 "$PROJECT_DIR"
    
    echo_success "Project directory setup completed"
}

create_env_file() {
    echo_info "Creating environment file..."
    
    ENV_FILE="$PROJECT_DIR/Frontend/.env.local"
    
    if [ -f "$ENV_FILE" ]; then
        echo_warning "Environment file already exists. Backing up..."
        cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    cat > "$ENV_FILE" << 'EOF'
# Production Environment Variables
NODE_ENV=production
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_DOMAIN=scjsnext.com

# Firebase Configuration (Update these with your values)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAvEe6PF9mnwN8Vqf9wqWUkWA58coXKpiA
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=paymentnew-dae57.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=paymentnew-dae57
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=paymentnew-dae57.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1074850368558
NEXT_PUBLIC_FIREBASE_APP_ID=1:1074850368558:web:f7c3c3f162dfc8af1fa3bf

# Security Configuration
SESSION_SECRET=4a8f2e9c1b7d6e3f5a8b2c9d1e4f7a0b3c6d9e2f5a8b1c4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b
CSRF_SECRET=9d2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f
ENCRYPTION_KEY=06b259db817f41fbb73ac82a252a3b30
HASH_SALT=dae13683bf304cfb90c3c97b649131aa

# Feature Flags
SECURITY_HEADERS_ENABLED=true
FORCE_HTTPS=false
SECURE_COOKIES=true
EOF
    
    chmod 600 "$ENV_FILE"
    chown www-data:www-data "$ENV_FILE"
    
    echo_success "Environment file created"
    echo_warning "Please review and update Firebase configuration in $ENV_FILE"
}

deploy_application() {
    echo_info "Deploying application..."
    
    cd "$PROJECT_DIR/deployment"
    
    # Stop existing containers
    docker-compose down 2>/dev/null || true
    
    # Remove old images
    docker system prune -f
    
    # Build and start containers
    docker-compose up -d --build --remove-orphans
    
    echo_success "Application deployment started"
}

wait_for_services() {
    echo_info "Waiting for services to be ready..."
    
    # Wait for Next.js app
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
            echo_success "Next.js app is ready"
            break
        fi
        
        attempt=$((attempt + 1))
        echo_info "Waiting for Next.js app... (attempt $attempt/$max_attempts)"
        sleep 10
    done
    
    if [ $attempt -eq $max_attempts ]; then
        echo_error "Next.js app failed to start within expected time"
        return 1
    fi
    
    # Wait for Nginx
    attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost/nginx-health > /dev/null 2>&1; then
            echo_success "Nginx is ready"
            break
        fi
        
        attempt=$((attempt + 1))
        echo_info "Waiting for Nginx... (attempt $attempt/$max_attempts)"
        sleep 5
    done
    
    if [ $attempt -eq $max_attempts ]; then
        echo_error "Nginx failed to start within expected time"
        return 1
    fi
}

run_tests() {
    echo_info "Running deployment tests..."
    
    # Test local endpoints
    echo_info "Testing local endpoints..."
    
    if ! curl -s http://localhost:3000/api/health | grep -q "ok"; then
        echo_error "Health check failed for Next.js app"
        return 1
    fi
    
    if ! curl -s http://localhost/nginx-health | grep -q "ok"; then
        echo_error "Health check failed for Nginx"
        return 1
    fi
    
    # Test external connectivity (if domain is configured)
    echo_info "Testing external connectivity..."
    
    if curl -s -k https://$DOMAIN/nginx-health > /dev/null 2>&1; then
        echo_success "External connectivity test passed"
    else
        echo_warning "External connectivity test failed. Check Cloudflare configuration."
    fi
    
    echo_success "Deployment tests completed"
}

setup_monitoring() {
    echo_info "Setting up monitoring..."
    
    # Create monitoring script
    cat > /usr/local/bin/check-payment-system << 'EOF'
#!/bin/bash
cd /var/www/scjsnext/deployment
if ! docker-compose ps | grep -q "Up"; then
    echo "$(date): Payment system containers are down. Restarting..." >> /var/log/payment-system.log
    docker-compose up -d
fi
EOF
    
    chmod +x /usr/local/bin/check-payment-system
    
    # Add cron job for monitoring
    (crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/check-payment-system") | crontab -
    
    echo_success "Monitoring setup completed"
}

show_deployment_info() {
    echo_info "Deployment completed successfully!"
    echo ""
    echo_success "=== DEPLOYMENT SUMMARY ==="
    echo "Project Directory: $PROJECT_DIR"
    echo "Domain: https://$DOMAIN"
    echo "Server IP: $SERVER_IP"
    echo "Log File: $LOG_FILE"
    echo ""
    echo_success "=== USEFUL COMMANDS ==="
    echo "Check status: cd $PROJECT_DIR/deployment && docker-compose ps"
    echo "View logs: cd $PROJECT_DIR/deployment && docker-compose logs -f"
    echo "Restart: cd $PROJECT_DIR/deployment && docker-compose restart"
    echo "Update: cd $PROJECT_DIR && git pull && cd deployment && docker-compose up -d --build"
    echo ""
    echo_success "=== HEALTH CHECK URLS ==="
    echo "Local Next.js: http://localhost:3000/api/health"
    echo "Local Nginx: http://localhost/nginx-health"
    echo "External: https://$DOMAIN/nginx-health"
    echo ""
    echo_warning "=== IMPORTANT NOTES ==="
    echo "1. Review Firebase configuration in $PROJECT_DIR/Frontend/.env.local"
    echo "2. Ensure Cloudflare DNS is properly configured"
    echo "3. Monitor logs for any issues: docker-compose logs -f"
    echo "4. Set up SSL certificate if not using Cloudflare"
}

main() {
    echo_info "Starting Ubuntu deployment for Next.js Payment System"
    echo_info "Timestamp: $(date)"
    echo ""
    
    check_root
    check_system
    update_system
    install_docker
    setup_firewall
    setup_fail2ban
    setup_project
    create_env_file
    deploy_application
    wait_for_services
    run_tests
    setup_monitoring
    show_deployment_info
    
    echo_success "Deployment script completed successfully!"
}

# Run main function
main "$@"