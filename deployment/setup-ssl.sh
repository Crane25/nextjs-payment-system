#!/bin/bash

# ===================================
# SSL Setup Script with Let's Encrypt
# Production SSL Configuration
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
echo -e "${BLUE} SSL Setup with Let's Encrypt${NC}"
echo -e "${BLUE} Domain: $DOMAIN${NC}"
echo -e "${BLUE}========================================${NC}"

# Check if we're in the right directory
cd $PROJECT_DIR/deployment

# Create SSL directory structure
print_status "Creating SSL directory structure..."
mkdir -p nginx/ssl/live/$DOMAIN
mkdir -p nginx/ssl/archive/$DOMAIN

# Create temporary nginx config for initial cert request
print_status "Creating temporary nginx configuration..."
cat > nginx/nginx-temp.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name scjsnext.com www.scjsnext.com;
        
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
            try_files $uri =404;
        }
        
        location / {
            return 200 "Server is ready for SSL setup";
            add_header Content-Type text/plain;
        }
    }
}
EOF

# Stop any existing containers
print_status "Stopping existing containers..."
docker-compose down --remove-orphans 2>/dev/null || true

# Start temporary nginx for certificate request
print_status "Starting temporary nginx for certificate validation..."
docker run -d --name temp-nginx \
  -p 80:80 \
  -v $(pwd)/nginx/nginx-temp.conf:/etc/nginx/nginx.conf:ro \
  -v certbot-webroot:/var/www/certbot \
  nginx:alpine

# Wait for nginx to start
sleep 5

# Test if domain points to this server
print_status "Testing domain configuration..."
CURRENT_IP=$(curl -s https://ipinfo.io/ip)
DOMAIN_IP=$(dig +short $DOMAIN)

if [ "$CURRENT_IP" != "$DOMAIN_IP" ]; then
    print_warning "Domain $DOMAIN does not point to this server"
    print_warning "Current server IP: $CURRENT_IP"
    print_warning "Domain points to: $DOMAIN_IP"
    print_warning "Please update your DNS records before continuing"
    
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_error "SSL setup cancelled"
        docker stop temp-nginx && docker rm temp-nginx
        exit 1
    fi
fi

# Request SSL certificate
print_status "Requesting SSL certificate from Let's Encrypt..."
docker run --rm \
  -v certbot-certs:/etc/letsencrypt \
  -v certbot-webroot:/var/www/certbot \
  certbot/certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email $EMAIL \
  --agree-tos \
  --no-eff-email \
  --force-renewal \
  -d $DOMAIN \
  -d www.$DOMAIN

# Stop temporary nginx
print_status "Stopping temporary nginx..."
docker stop temp-nginx && docker rm temp-nginx

# Copy certificates to local directory for nginx
print_status "Copying certificates..."
docker run --rm \
  -v certbot-certs:/etc/letsencrypt \
  -v $(pwd)/nginx/ssl:/ssl \
  alpine sh -c "
    mkdir -p /ssl/live/$DOMAIN
    cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem /ssl/live/$DOMAIN/
    cp /etc/letsencrypt/live/$DOMAIN/privkey.pem /ssl/live/$DOMAIN/
    cp /etc/letsencrypt/live/$DOMAIN/chain.pem /ssl/live/$DOMAIN/
    chmod 644 /ssl/live/$DOMAIN/*.pem
  "

# Verify certificates exist
if [ ! -f "nginx/ssl/live/$DOMAIN/fullchain.pem" ]; then
    print_error "SSL certificate not found!"
    exit 1
fi

# Clean up temporary config
rm nginx/nginx-temp.conf

# Create SSL renewal script
print_status "Creating SSL renewal script..."
cat > renew-ssl.sh << 'EOF'
#!/bin/bash

# SSL Certificate Renewal Script
echo "Renewing SSL certificates..."

docker run --rm \
  -v certbot-certs:/etc/letsencrypt \
  -v certbot-webroot:/var/www/certbot \
  certbot/certbot renew \
  --webroot \
  --webroot-path=/var/www/certbot

# Copy renewed certificates
docker run --rm \
  -v certbot-certs:/etc/letsencrypt \
  -v $(pwd)/nginx/ssl:/ssl \
  alpine sh -c "
    cp /etc/letsencrypt/live/scjsnext.com/fullchain.pem /ssl/live/scjsnext.com/
    cp /etc/letsencrypt/live/scjsnext.com/privkey.pem /ssl/live/scjsnext.com/
    cp /etc/letsencrypt/live/scjsnext.com/chain.pem /ssl/live/scjsnext.com/
    chmod 644 /ssl/live/scjsnext.com/*.pem
  "

# Reload nginx
docker-compose exec nginx nginx -s reload

echo "SSL renewal completed!"
EOF

chmod +x renew-ssl.sh

# Add cron job for auto-renewal
print_status "Setting up automatic SSL renewal..."
(crontab -l 2>/dev/null; echo "0 12 * * * cd $PROJECT_DIR/deployment && ./renew-ssl.sh >> /var/log/ssl-renewal.log 2>&1") | crontab -

# Create SSL test script
cat > test-ssl.sh << 'EOF'
#!/bin/bash

echo "Testing SSL configuration..."

# Test SSL certificate
echo "Certificate details:"
openssl x509 -in nginx/ssl/live/scjsnext.com/fullchain.pem -text -noout | grep -E "(Subject:|Issuer:|Not Before:|Not After:)"

# Test HTTPS connection
echo ""
echo "Testing HTTPS connection:"
curl -I https://scjsnext.com 2>/dev/null | head -1

echo ""
echo "SSL Grade test: https://www.ssllabs.com/ssltest/analyze.html?d=scjsnext.com"
EOF

chmod +x test-ssl.sh

print_status "✅ SSL setup completed successfully!"
echo ""
echo "🔒 SSL Certificate Details:"
echo "   - Domain: $DOMAIN"
echo "   - Certificate Location: nginx/ssl/live/$DOMAIN/"
echo "   - Auto-renewal: Configured (runs daily at 12:00 PM)"
echo ""
echo "📋 SSL Files Created:"
echo "   - nginx/ssl/live/$DOMAIN/fullchain.pem"
echo "   - nginx/ssl/live/$DOMAIN/privkey.pem"
echo "   - nginx/ssl/live/$DOMAIN/chain.pem"
echo ""
echo "🛠️ Scripts Created:"
echo "   - renew-ssl.sh (manual renewal)"
echo "   - test-ssl.sh (test SSL configuration)"
echo ""
echo "📋 Next steps:"
echo "1. Run: ./deploy-production.sh"
echo "2. Test: ./test-ssl.sh"
echo ""
print_status "Ready for production deployment with SSL!"