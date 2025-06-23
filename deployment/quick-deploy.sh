#!/bin/bash

# ===================================
# Quick Deploy Script - Multiple Options
# Next.js Payment System v2.0
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

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Quick Deploy - Choose Your Option${NC}"
echo -e "${BLUE} Next.js Payment System v2.0${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    print_error "Please run this script from the deployment directory."
    exit 1
fi

# Fix line endings for all scripts
print_status "Fixing script line endings..."
for file in *.sh; do
    sed -i 's/\r$//' "$file" 2>/dev/null || true
    chmod +x "$file" 2>/dev/null || true
done

echo "Please choose your deployment option:"
echo ""
echo "1. 🚀 No SSL (HTTP only) - Quick start, works immediately"
echo "   URL: http://167.172.65.185"
echo ""
echo "2. ☁️ Cloudflare SSL - Use existing Cloudflare setup"
echo "   URL: https://scjsnext.com (requires Cloudflare configuration)"
echo ""
echo "3. 🔒 Let's Encrypt SSL - Full SSL setup with free certificate"
echo "   URL: https://scjsnext.com (requires domain pointing to server)"
echo ""
echo "4. 🛠️ Install Dependencies Only - Setup server environment"
echo ""
echo "0. ❌ Exit"
echo ""

read -p "Enter your choice (0-4): " choice

case $choice in
    1)
        print_status "Selected: No SSL Deployment"
        echo ""
        print_status "This will deploy your application with HTTP only."
        print_status "Your app will be accessible at: http://167.172.65.185"
        echo ""
        read -p "Continue? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_status "Starting No-SSL deployment..."
            
            # Stop any existing containers
            docker-compose down --remove-orphans 2>/dev/null || true
            docker-compose -f docker-compose-cloudflare.yml down --remove-orphans 2>/dev/null || true
            
            # Deploy with no SSL
            docker-compose -f docker-compose-no-ssl.yml up -d --build
            
            # Wait and check
            sleep 20
            print_status "Checking deployment..."
            
            if curl -f -s "http://localhost/health" > /dev/null; then
                print_status "✅ Deployment successful!"
                echo ""
                echo "🌐 Your application is now running at:"
                echo "   - http://167.172.65.185"
                echo "   - http://localhost (when connected via SSH)"
                echo ""
                echo "📋 Management commands:"
                echo "   - View logs: docker-compose -f docker-compose-no-ssl.yml logs -f"
                echo "   - Restart: docker-compose -f docker-compose-no-ssl.yml restart"
                echo "   - Stop: docker-compose -f docker-compose-no-ssl.yml down"
            else
                print_error "Deployment may have failed. Check logs:"
                docker-compose -f docker-compose-no-ssl.yml logs
            fi
        fi
        ;;
    2)
        print_status "Selected: Cloudflare SSL Deployment"
        echo ""
        print_warning "Requirements:"
        echo "- Domain scjsnext.com must be added to Cloudflare"
        echo "- DNS A records pointing to 167.172.65.185"
        echo "- SSL/TLS mode set to 'Full' in Cloudflare"
        echo ""
        read -p "Have you configured Cloudflare? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_status "Starting Cloudflare SSL deployment..."
            ./deploy-cloudflare.sh
        else
            print_warning "Please configure Cloudflare first:"
            echo "1. Add scjsnext.com to Cloudflare"
            echo "2. Set DNS A records to point to 167.172.65.185"
            echo "3. Set SSL/TLS mode to 'Full'"
            echo "4. Enable 'Always Use HTTPS'"
        fi
        ;;
    3)
        print_status "Selected: Let's Encrypt SSL Deployment"
        echo ""
        print_warning "Requirements:"
        echo "- Domain scjsnext.com must point to this server (167.172.65.185)"
        echo "- No Cloudflare proxy (DNS only)"
        echo "- Rate limit: 5 certificates per week"
        echo ""
        
        # Check if domain points to this server
        CURRENT_IP=$(curl -s https://ipinfo.io/ip 2>/dev/null || echo "167.172.65.185")
        DOMAIN_IP=$(dig +short scjsnext.com | head -1)
        
        if [ "$CURRENT_IP" = "$DOMAIN_IP" ]; then
            print_status "✅ Domain correctly points to this server"
            read -p "Continue with Let's Encrypt SSL? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                print_status "Starting Let's Encrypt SSL deployment..."
                ./deploy-production.sh
            fi
        else
            print_error "❌ Domain does not point to this server"
            echo "Current server IP: $CURRENT_IP"
            echo "Domain points to: $DOMAIN_IP"
            echo ""
            echo "Please update your DNS records or use Cloudflare SSL option."
        fi
        ;;
    4)
        print_status "Selected: Install Dependencies Only"
        echo ""
        print_status "This will install Docker, setup firewall, and prepare the server."
        read -p "Continue? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_status "Installing dependencies..."
            ./install-dependencies.sh
            print_status "✅ Dependencies installed successfully!"
            echo ""
            echo "📋 Next steps:"
            echo "1. Run this script again to deploy your application"
            echo "2. Choose option 1, 2, or 3 for deployment"
        fi
        ;;
    0)
        print_status "Exiting..."
        exit 0
        ;;
    *)
        print_error "Invalid choice. Please run the script again."
        exit 1
        ;;
esac

echo ""
print_status "🎉 Operation completed!"