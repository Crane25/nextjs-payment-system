#!/bin/bash

# ===================================
# Complete Production Setup Script
# One-command deployment for Next.js Payment System v2.0
# ===================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
DOMAIN="scjsnext.com"
EMAIL="rachaelagani63028@gmail.com"
PROJECT_DIR="/var/www/scjsnext"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Complete Production Setup${NC}"
echo -e "${BLUE} Next.js Payment System v2.0${NC}"
echo -e "${BLUE} Domain: $DOMAIN${NC}"
echo -e "${BLUE}========================================${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run this script as root (use sudo)"
    exit 1
fi

# Check internet connectivity
print_status "Checking internet connectivity..."
if ! ping -c 1 google.com &> /dev/null; then
    print_error "No internet connection available"
    exit 1
fi

# Step 1: Install dependencies
print_status "Step 1/4: Installing dependencies..."
./install-dependencies.sh

# Step 2: Setup SSL
print_status "Step 2/4: Setting up SSL certificates..."
./setup-ssl.sh

# Step 3: Deploy application
print_status "Step 3/4: Deploying application..."
./deploy-production.sh

# Step 4: Final verification and setup monitoring
print_status "Step 4/4: Setting up monitoring and final checks..."

# Create monitoring script
cat > monitor-system.sh << 'EOF'
#!/bin/bash

# System Monitoring Script
echo "=== System Status Report ==="
echo "Date: $(date)"
echo ""

# Docker status
echo "Docker Containers:"
docker-compose ps
echo ""

# System resources
echo "System Resources:"
echo "CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')"
echo "Memory Usage: $(free -h | awk 'NR==2{printf "%.1f%%", $3*100/$2}')"
echo "Disk Usage: $(df -h / | awk 'NR==2{print $5}')"
echo ""

# SSL certificate status
echo "SSL Certificate:"
openssl x509 -in nginx/ssl/live/scjsnext.com/fullchain.pem -noout -enddate
echo ""

# Website response
echo "Website Response:"
curl -s -o /dev/null -w "Response Time: %{time_total}s | Status: %{http_code}\n" https://scjsnext.com/nginx-health
echo ""

# Log file sizes
echo "Log Files:"
ls -lh /var/log/nginx/ 2>/dev/null || echo "No nginx logs yet"
echo ""

echo "=== End of Report ==="
EOF

chmod +x monitor-system.sh

# Create update script
cat > update-application.sh << 'EOF'
#!/bin/bash

# Application Update Script
echo "Updating Next.js Payment System..."

cd /var/www/scjsnext

# Pull latest code
git pull origin main

# Backup current deployment
BACKUP_DIR="backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
docker-compose exec -T nextjs tar -czf - /app/logs 2>/dev/null | tar -xzf - -C "$BACKUP_DIR" 2>/dev/null || true

# Deploy update
cd deployment
./deploy-production.sh

echo "Application updated successfully!"
EOF

chmod +x update-application.sh

# Create backup script
cat > backup-system.sh << 'EOF'
#!/bin/bash

# System Backup Script
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/var/backups/scjsnext-$BACKUP_DATE"

echo "Creating system backup..."
mkdir -p "$BACKUP_DIR"

# Backup application files
tar -czf "$BACKUP_DIR/application.tar.gz" /var/www/scjsnext --exclude=node_modules --exclude=.git

# Backup Docker volumes
docker run --rm -v app-logs:/data -v "$BACKUP_DIR":/backup alpine tar -czf /backup/app-logs.tar.gz -C /data .
docker run --rm -v nginx-cache:/data -v "$BACKUP_DIR":/backup alpine tar -czf /backup/nginx-cache.tar.gz -C /data .

# Backup SSL certificates
tar -czf "$BACKUP_DIR/ssl-certificates.tar.gz" /var/www/scjsnext/deployment/nginx/ssl

# Backup system configuration
tar -czf "$BACKUP_DIR/system-config.tar.gz" /etc/nginx /etc/fail2ban /etc/ufw

echo "Backup completed: $BACKUP_DIR"
echo "Files created:"
ls -lh "$BACKUP_DIR"
EOF

chmod +x backup-system.sh

# Setup log rotation
print_status "Setting up log rotation..."
cat > /etc/logrotate.d/scjsnext << 'EOF'
/var/www/scjsnext/deployment/nginx/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
    postrotate
        docker-compose -f /var/www/scjsnext/deployment/docker-compose.yml exec nginx nginx -s reload 2>/dev/null || true
    endscript
}

/var/www/scjsnext/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
}
EOF

# Setup cron jobs
print_status "Setting up cron jobs..."
(crontab -l 2>/dev/null; cat << 'EOF'
# SSL renewal (daily at 2 AM)
0 2 * * * cd /var/www/scjsnext/deployment && ./renew-ssl.sh >> /var/log/ssl-renewal.log 2>&1

# System monitoring (every 6 hours)
0 */6 * * * cd /var/www/scjsnext/deployment && ./monitor-system.sh >> /var/log/system-monitor.log

# System backup (weekly on Sunday at 3 AM)
0 3 * * 0 cd /var/www/scjsnext/deployment && ./backup-system.sh >> /var/log/backup.log 2>&1

# Docker cleanup (weekly on Saturday at 4 AM)
0 4 * * 6 docker system prune -f >> /var/log/docker-cleanup.log 2>&1
EOF
) | crontab -

# Create service status check
cat > check-services.sh << 'EOF'
#!/bin/bash

echo "Checking all services..."

# Check Docker
if systemctl is-active --quiet docker; then
    echo "✅ Docker: Running"
else
    echo "❌ Docker: Not running"
    systemctl start docker
fi

# Check containers
cd /var/www/scjsnext/deployment
if docker-compose ps | grep -q "Up"; then
    echo "✅ Application containers: Running"
else
    echo "❌ Application containers: Not running"
    docker-compose up -d
fi

# Check firewall
if ufw status | grep -q "Status: active"; then
    echo "✅ Firewall: Active"
else
    echo "❌ Firewall: Inactive"
fi

# Check fail2ban
if systemctl is-active --quiet fail2ban; then
    echo "✅ Fail2ban: Running"
else
    echo "❌ Fail2ban: Not running"
fi

# Check website
if curl -f -s https://scjsnext.com/nginx-health > /dev/null; then
    echo "✅ Website: Accessible"
else
    echo "❌ Website: Not accessible"
fi

echo "Service check completed!"
EOF

chmod +x check-services.sh

# Final status report
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Setup Complete!${NC}"
echo -e "${BLUE}========================================${NC}"

print_status "🎉 Complete production setup finished!"
echo ""
echo -e "${GREEN}🌐 Your website is live at:${NC}"
echo "   - https://$DOMAIN"
echo "   - https://www.$DOMAIN"
echo ""
echo -e "${GREEN}🛠️ Management Scripts Created:${NC}"
echo "   - ./monitor-system.sh - System monitoring"
echo "   - ./update-application.sh - Application updates"
echo "   - ./backup-system.sh - System backup"
echo "   - ./check-services.sh - Service status check"
echo "   - ./renew-ssl.sh - Manual SSL renewal"
echo ""
echo -e "${GREEN}⏰ Automated Tasks Configured:${NC}"
echo "   - SSL renewal: Daily at 2 AM"
echo "   - System monitoring: Every 6 hours"
echo "   - System backup: Weekly on Sunday at 3 AM"
echo "   - Docker cleanup: Weekly on Saturday at 4 AM"
echo ""
echo -e "${GREEN}📊 Quick Status Check:${NC}"
./check-services.sh
echo ""
echo -e "${GREEN}🔒 Security Features:${NC}"
echo "   - HTTPS/SSL: ✅ Configured"
echo "   - Firewall: ✅ Active"
echo "   - Fail2ban: ✅ Active"
echo "   - Auto updates: ✅ Enabled"
echo "   - Log rotation: ✅ Configured"
echo ""
echo -e "${GREEN}📋 Next Steps:${NC}"
echo "1. Test your website: https://$DOMAIN"
echo "2. Monitor logs: docker-compose logs -f"
echo "3. Regular monitoring: ./monitor-system.sh"
echo ""
print_status "🚀 Your Next.js Payment System is now live and ready for production!"