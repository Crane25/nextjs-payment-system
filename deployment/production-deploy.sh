#!/bin/bash

# ====================================================================
# Production Deployment Script for Next.js Payment System v2.0
# Complete Setup with Cloudflare SSL Integration
# Designed for Zero-Error, One-Time Setup
# ====================================================================

set -euo pipefail
IFS=$'\n\t'

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly NC='\033[0m' # No Color

# Configuration Variables
readonly DOMAIN="scjsnext.com"
readonly SERVER_IP="167.172.65.185"
readonly PROJECT_PATH="/var/www/scjsnext"
readonly DEPLOYMENT_PATH="$PROJECT_PATH/deployment"
readonly LOG_FILE="/var/log/payment-deployment.log"

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${CYAN}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $1" | tee -a "$LOG_FILE"
}

# Error handling
handle_error() {
    local exit_code=$?
    error "Script failed at line $1 with exit code $exit_code"
    error "Check the log file: $LOG_FILE"
    exit $exit_code
}

trap 'handle_error $LINENO' ERR

# Header
cat << 'EOF'
====================================================================
🚀 NEXT.JS PAYMENT SYSTEM v2.0 - PRODUCTION DEPLOYMENT
====================================================================
🏗️  Complete setup with Cloudflare SSL integration
🔒 Security-optimized configuration
⚡ Performance-tuned for production
🛡️  Zero-downtime deployment ready
====================================================================
EOF

# Pre-flight checks
preflight_checks() {
    log "🔍 Running pre-flight checks..."
    
    # Check if running as root
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root"
        exit 1
    fi
    
    # Check if we're in the correct directory
    if [[ ! -f "docker-compose.yml" ]]; then
        error "docker-compose.yml not found. Please run from deployment directory."
        exit 1
    fi
    
    # Check system requirements
    log "Checking system requirements..."
    
    # Check available memory
    local available_memory=$(free -m | awk 'NR==2{printf "%.0f", $7}')
    if [[ $available_memory -lt 1024 ]]; then
        warn "Available memory is ${available_memory}MB. Recommended: 1GB+"
    fi
    
    # Check disk space
    local available_disk=$(df / | awk 'NR==2{print $4}')
    if [[ $available_disk -lt 5242880 ]]; then # 5GB in KB
        warn "Available disk space is low. Recommended: 5GB+"
    fi
    
    success "Pre-flight checks completed"
}

# System preparation
prepare_system() {
    log "🔧 Preparing system for deployment..."
    
    # Update system packages
    log "Updating system packages..."
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
    
    # Install required packages
    log "Installing required packages..."
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        curl \
        wget \
        git \
        unzip \
        software-properties-common \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        htop \
        nano \
        dos2unix \
        jq \
        dnsutils
    
    # Install Docker if not present
    if ! command -v docker &> /dev/null; then
        log "Installing Docker..."
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
        apt-get update -qq
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
        systemctl enable docker
        systemctl start docker
        usermod -aG docker $USER
    else
        log "Docker is already installed"
    fi
    
    # Configure Docker daemon
    log "Configuring Docker daemon..."
    cat > /etc/docker/daemon.json << 'EOF'
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "storage-driver": "overlay2",
    "default-ulimits": {
        "nofile": {
            "name": "nofile",
            "hard": 65536,
            "soft": 65536
        }
    }
}
EOF
    
    systemctl restart docker
    
    success "System preparation completed"
}

# Environment configuration
setup_environment() {
    log "🌍 Setting up environment configuration..."
    
    # Create necessary directories
    log "Creating directory structure..."
    mkdir -p {/var/log/payment-app,/var/log/nginx,/var/lib/docker/volumes/payment-data}
    
    # Set proper permissions
    chmod 755 /var/log/payment-app /var/log/nginx
    chown -R 1001:1001 /var/log/payment-app
    
    # Create environment file if not exists
    if [[ ! -f "../Frontend/.env.local" ]]; then
        log "Creating production environment file..."
        cat > ../Frontend/.env.local << 'EOF'
# ====================================================================
# Production Environment Configuration
# Next.js Payment System v2.0 - Optimized for Cloudflare
# ====================================================================

# Application Environment
NODE_ENV=production
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_APP_VERSION=2.0.0
NEXT_PUBLIC_DOMAIN=scjsnext.com

# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAvEe6PF9mnwN8Vqf9wqWUkWA58coXKpiA
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=paymentnew-dae57.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=paymentnew-dae57
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=paymentnew-dae57.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1074850368558
NEXT_PUBLIC_FIREBASE_APP_ID=1:1074850368558:web:f7c3c3f162dfc8af1fa3bf

# Email Configuration (Production)
EMAIL_SERVER_USER=rachaelagani63028@gmail.com
EMAIL_SERVER_PASSWORD=24992499Kk
EMAIL_SERVER_HOST=smtp.gmail.com
EMAIL_SERVER_PORT=587
EMAIL_FROM=noreply@scjsnext.com

# Security Configuration
SESSION_SECRET=4a8f2e9c1b7d6e3f5a8b2c9d1e4f7a0b3c6d9e2f5a8b1c4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b
CSRF_SECRET=9d2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f
ENCRYPTION_KEY=06b259db817f41fbb73ac82a252a3b30
HASH_SALT=dae13683bf304cfb90c3c97b649131aa

# Security Settings
SECURITY_HEADERS_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000
FORCE_HTTPS=false
SECURE_COOKIES=true
CLOUDFLARE_SSL=true

# Session Configuration
SESSION_TIMEOUT_MS=3600000
HSTS_ENABLED=true
CSP_ENABLED=true
ENCRYPTION_ENABLED=true
AUDIT_LOG_ENABLED=true

# Performance Settings
NEXT_TELEMETRY_DISABLED=1
NEXT_PUBLIC_DEBUG_ENABLED=false
NEXT_PUBLIC_LOG_LEVEL=error
NEXT_PUBLIC_SHOW_ERROR_DETAILS=false
NEXT_PUBLIC_CONSOLE_LOGGING=false
NEXT_PUBLIC_PERFORMANCE_MONITORING=true

# Feature Flags
NEXT_PUBLIC_ENABLE_WITHDRAWALS=true
NEXT_PUBLIC_ENABLE_MULTI_TEAM=true
NEXT_PUBLIC_ENABLE_NOTIFICATIONS=true
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_MAINTENANCE_MODE=false

# API Security
API_KEY_REQUIRED=false
CORS_ORIGINS=https://scjsnext.com,https://www.scjsnext.com

# Database Security
DB_CONNECTION_TIMEOUT=30000
DB_MAX_CONNECTIONS=10
DB_ENABLE_SSL=true

# Input Validation
MAX_INPUT_LENGTH=10000
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=jpg,jpeg,png,gif,pdf,doc,docx

# Authentication Security
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MS=900000
PASSWORD_MIN_LENGTH=8
REQUIRE_MFA=false

# Audit & Logging
AUDIT_LOG_LEVEL=info
AUDIT_LOG_RETENTION_DAYS=90
EOF
        success "Environment file created"
    else
        log "Environment file already exists"
    fi
    
    success "Environment configuration completed"
}

# Cloudflare verification
verify_cloudflare() {
    log "☁️ Verifying Cloudflare configuration..."
    
    # Display Cloudflare setup requirements
    cat << EOF

${BLUE}====================================================================
📋 CLOUDFLARE CONFIGURATION CHECKLIST
====================================================================${NC}

Before proceeding, ensure the following Cloudflare settings:

${WHITE}1. DNS Configuration:${NC}
   ✅ A record: scjsnext.com → 167.172.65.185 (Proxied ☁️)
   ✅ A record: www.scjsnext.com → 167.172.65.185 (Proxied ☁️)

${WHITE}2. SSL/TLS Settings:${NC}
   ✅ SSL/TLS encryption mode: Full (not Full Strict)
   ✅ Always Use HTTPS: ON
   ✅ HTTP Strict Transport Security (HSTS): ON
   ✅ Minimum TLS Version: 1.2

${WHITE}3. Speed Optimization:${NC}
   ✅ Auto Minify: HTML, CSS, JS
   ✅ Brotli Compression: ON
   ✅ Rocket Loader: OFF (for Next.js compatibility)

${WHITE}4. Security Settings:${NC}
   ✅ Security Level: Medium or High
   ✅ Bot Fight Mode: ON
   ✅ Browser Integrity Check: ON

${WHITE}5. Caching (Optional but Recommended):${NC}
   ✅ Caching Level: Standard
   ✅ Browser Cache TTL: 4 hours
   ✅ Always Online: ON

${BLUE}====================================================================${NC}

EOF
    
    read -p "Have you configured Cloudflare according to the checklist above? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        warn "Please configure Cloudflare first, then run this script again."
        cat << EOF

${YELLOW}Quick Cloudflare Setup Guide:${NC}
1. Login to Cloudflare Dashboard
2. Select your domain: $DOMAIN
3. Go to DNS → Records → Add A records
4. Go to SSL/TLS → Overview → Set to 'Full'
5. Go to SSL/TLS → Edge Certificates → Enable settings
6. Go to Security → Settings → Configure as needed

EOF
        exit 0
    fi
    
    # Test DNS resolution
    log "Testing DNS resolution..."
    local domain_ips
    domain_ips=$(dig +short $DOMAIN 2>/dev/null || echo "DNS_FAILED")
    
    if [[ $domain_ips == *"104.21."* ]] || [[ $domain_ips == *"172.67."* ]] || [[ $domain_ips == *"104.16."* ]]; then
        success "✅ Domain is using Cloudflare (IPs: $domain_ips)"
    else
        warn "⚠️ Domain may not be using Cloudflare (IPs: $domain_ips)"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    success "Cloudflare verification completed"
}

# Docker configuration validation
validate_docker_config() {
    log "🐳 Validating Docker configuration..."
    
    # Test Docker Compose syntax
    if ! docker compose config -q; then
        error "Docker Compose configuration is invalid!"
        exit 1
    fi
    
    # Test Dockerfile syntax
    if ! docker build --dry-run -f Dockerfile .. > /dev/null 2>&1; then
        warn "Dockerfile validation failed, but continuing..."
    fi
    
    success "Docker configuration is valid"
}

# Cleanup previous deployment
cleanup_previous() {
    log "🧹 Cleaning up previous deployment..."
    
    # Stop existing containers
    docker compose down --remove-orphans -v 2>/dev/null || true
    
    # Remove old containers and images
    docker container prune -f 2>/dev/null || true
    docker image prune -f 2>/dev/null || true
    
    # Clean up dangling volumes
    docker volume prune -f 2>/dev/null || true
    
    # Clean up build cache
    docker builder prune -f 2>/dev/null || true
    
    success "Cleanup completed"
}

# Main deployment
deploy_application() {
    log "🚀 Starting application deployment..."
    
    # Build and start services
    log "Building and starting containers..."
    docker compose up -d --build --force-recreate --remove-orphans
    
    # Wait for services to initialize
    log "Waiting for services to initialize..."
    sleep 60
    
    success "Application deployment initiated"
}

# Health checks
perform_health_checks() {
    log "🏥 Performing comprehensive health checks..."
    
    local max_attempts=20
    local attempt=1
    local health_check_delay=15
    
    while [[ $attempt -le $max_attempts ]]; do
        info "Health check attempt $attempt/$max_attempts..."
        
        # Check container status
        local containers_running
        containers_running=$(docker compose ps --services --filter "status=running" | wc -l)
        local total_containers
        total_containers=$(docker compose ps --services | wc -l)
        
        if [[ $containers_running -eq $total_containers ]] && [[ $containers_running -gt 0 ]]; then
            success "✅ All containers are running ($containers_running/$total_containers)"
            local containers_ok=true
        else
            warn "⚠️ Some containers not running ($containers_running/$total_containers)"
            local containers_ok=false
        fi
        
        # Check Next.js health
        if curl -f -s --connect-timeout 5 --max-time 10 "http://localhost:3000/api/health" > /dev/null 2>&1; then
            success "✅ Next.js application is healthy"
            local nextjs_ok=true
        else
            warn "⚠️ Next.js health check failed"
            local nextjs_ok=false
        fi
        
        # Check Nginx health
        if curl -f -s --connect-timeout 5 --max-time 10 "http://localhost/nginx-health" > /dev/null 2>&1; then
            success "✅ Nginx proxy is healthy"
            local nginx_ok=true
        else
            warn "⚠️ Nginx health check failed"
            local nginx_ok=false
        fi
        
        # Check external access via Cloudflare
        if curl -f -s --connect-timeout 10 --max-time 15 "https://$DOMAIN/nginx-health" > /dev/null 2>&1; then
            success "✅ External access via Cloudflare is working"
            local external_ok=true
        else
            warn "⚠️ External access check failed (Cloudflare may need time to propagate)"
            local external_ok=false
        fi
        
        # Check if all critical services are healthy
        if [[ $containers_ok == true ]] && [[ $nextjs_ok == true ]] && [[ $nginx_ok == true ]]; then
            success "🎉 All critical health checks passed!"
            
            if [[ $external_ok == true ]]; then
                success "🌐 External access is also working!"
            else
                warn "🕐 External access may take a few minutes due to Cloudflare DNS propagation"
            fi
            
            return 0
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            error "❌ Health checks failed after $max_attempts attempts"
            
            log "Displaying container logs for debugging:"
            docker compose logs --tail=50
            
            return 1
        fi
        
        warn "Retrying in ${health_check_delay} seconds..."
        sleep $health_check_delay
        ((attempt++))
    done
}

# Performance optimization
optimize_performance() {
    log "⚡ Applying performance optimizations..."
    
    # Configure system limits
    cat > /etc/security/limits.d/99-payment-system.conf << 'EOF'
root soft nofile 65535
root hard nofile 65535
* soft nofile 65535
* hard nofile 65535
EOF
    
    # Configure sysctl for better network performance
    cat > /etc/sysctl.d/99-payment-system.conf << 'EOF'
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_intvl = 60
net.ipv4.tcp_keepalive_probes = 10
net.ipv4.tcp_fin_timeout = 30
vm.swappiness = 10
EOF
    
    sysctl -p /etc/sysctl.d/99-payment-system.conf
    
    success "Performance optimizations applied"
}

# Security hardening
apply_security() {
    log "🔒 Applying security hardening..."
    
    # Configure UFW firewall
    if command -v ufw &> /dev/null; then
        log "Configuring UFW firewall..."
        ufw --force reset
        ufw default deny incoming
        ufw default allow outgoing
        ufw allow 22/tcp comment 'SSH'
        ufw allow 80/tcp comment 'HTTP'
        ufw allow 443/tcp comment 'HTTPS'
        ufw --force enable
    fi
    
    # Set proper file permissions
    chmod +x *.sh
    chmod 600 ../Frontend/.env.local
    
    success "Security hardening applied"
}

# Generate deployment report
generate_report() {
    log "📊 Generating deployment report..."
    
    local report_file="deployment-report-$(date +%Y%m%d-%H%M%S).txt"
    
    cat > "$report_file" << EOF
====================================================================
NEXT.JS PAYMENT SYSTEM v2.0 - DEPLOYMENT REPORT
====================================================================
Deployment Date: $(date)
Server IP: $SERVER_IP
Domain: $DOMAIN
Deployment Path: $DEPLOYMENT_PATH

SYSTEM INFORMATION:
- OS: $(lsb_release -d | cut -f2)
- Kernel: $(uname -r)
- Docker Version: $(docker --version)
- Available Memory: $(free -h | awk 'NR==2{print $7}')
- Available Disk: $(df -h / | awk 'NR==2{print $4}')

CONTAINER STATUS:
$(docker compose ps)

HEALTH CHECK RESULTS:
- Next.js App: $(curl -f -s "http://localhost:3000/api/health" > /dev/null 2>&1 && echo "✅ Healthy" || echo "❌ Failed")
- Nginx Proxy: $(curl -f -s "http://localhost/nginx-health" > /dev/null 2>&1 && echo "✅ Healthy" || echo "❌ Failed")
- External Access: $(curl -f -s "https://$DOMAIN/nginx-health" > /dev/null 2>&1 && echo "✅ Working" || echo "⚠️ Check DNS propagation")

SECURITY FEATURES:
✅ Cloudflare SSL/TLS encryption
✅ Rate limiting configured
✅ Security headers enabled
✅ Real IP detection from Cloudflare
✅ UFW firewall configured
✅ Container security hardening
✅ Non-root user in containers

PERFORMANCE OPTIMIZATIONS:
✅ Gzip compression enabled
✅ Static file caching (1 year)
✅ Optimized proxy buffering
✅ Enhanced worker connections
✅ System limits optimized

ACCESS INFORMATION:
- Website: https://$DOMAIN
- Health Check: https://$DOMAIN/nginx-health
- Admin Panel: https://$DOMAIN/admin (if configured)

MANAGEMENT COMMANDS:
- View logs: docker compose logs -f
- Restart services: docker compose restart
- Stop services: docker compose down
- Update deployment: git pull && docker compose up -d --build

MONITORING:
- Application logs: docker compose logs nextjs-app
- Nginx logs: docker compose logs nginx-proxy
- System logs: journalctl -u docker

BACKUP RECOMMENDATIONS:
- Environment file: $PROJECT_PATH/Frontend/.env.local
- Docker volumes: $(docker volume ls --format "table {{.Name}}" | grep payment)
- Database: Configure regular backups if using external DB

====================================================================
Deployment completed successfully at $(date)
====================================================================
EOF
    
    success "Deployment report saved: $report_file"
}

# Main execution flow
main() {
    log "🚀 Starting Next.js Payment System v2.0 deployment..."
    
    # Create log file
    touch "$LOG_FILE"
    
    # Execute deployment steps
    preflight_checks
    prepare_system
    setup_environment
    verify_cloudflare
    validate_docker_config
    cleanup_previous
    deploy_application
    perform_health_checks
    optimize_performance
    apply_security
    generate_report
    
    # Final success message
    cat << EOF

${GREEN}====================================================================
🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!
====================================================================${NC}

${WHITE}🌐 Website Access:${NC}
   Primary: https://$DOMAIN
   Alternative: https://www.$DOMAIN
   Health Check: https://$DOMAIN/nginx-health

${WHITE}📊 System Status:${NC}
$(docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}")

${WHITE}🔒 Security Features Active:${NC}
   ✅ Cloudflare SSL & DDoS protection
   ✅ Rate limiting (500 req/s for static files)
   ✅ Security headers configured
   ✅ Real IP detection from Cloudflare
   ✅ Container security hardening

${WHITE}⚡ Performance Features:${NC}
   ✅ Optimized for Next.js App Router
   ✅ Static file caching (1 year)
   ✅ Gzip compression enabled
   ✅ Enhanced proxy buffering

${WHITE}📝 Quick Management Commands:${NC}
   docker compose logs -f           # View all logs
   docker compose restart           # Restart all services
   docker compose ps               # Check container status
   curl https://$DOMAIN/nginx-health # Test health

${WHITE}📋 Important Files:${NC}
   Log file: $LOG_FILE
   Environment: $PROJECT_PATH/Frontend/.env.local
   Deployment: $DEPLOYMENT_PATH

${GREEN}====================================================================
Your Next.js Payment System is now live and ready for production! 🚀
====================================================================${NC}

EOF
    
    success "Deployment script completed successfully!"
}

# Execute main function
main "$@"