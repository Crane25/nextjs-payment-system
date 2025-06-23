# 🚀 Production Deployment Guide
**Next.js Payment System v2.0 with SSL**

## 📋 Quick Start (One Command)

```bash
# Download and run complete setup
curl -fsSL https://raw.githubusercontent.com/yourusername/paymentnew/main/deployment/complete-setup.sh | sudo bash
```

## 🔧 Manual Setup

### Step 1: Upload Files
```bash
# Upload project to server
scp -r . root@your-server-ip:/var/www/scjsnext/
```

### Step 2: Run Setup Scripts
```bash
ssh root@your-server-ip
cd /var/www/scjsnext/deployment

# Make scripts executable
chmod +x *.sh

# Complete setup (all-in-one)
./complete-setup.sh

# OR run step by step:
./install-dependencies.sh
./setup-ssl.sh
./deploy-production.sh
```

## 🌐 URLs
- **Production:** https://scjsnext.com
- **Alternative:** https://www.scjsnext.com
- **Health Check:** https://scjsnext.com/nginx-health

## 🛠️ Management Commands

### Application Management
```bash
# View logs
docker-compose logs -f

# Restart application
docker-compose restart nextjs

# Update application
./update-application.sh

# Stop all services
docker-compose down
```

### SSL Management
```bash
# Renew SSL certificate
./renew-ssl.sh

# Test SSL configuration
./test-ssl.sh
```

### System Management
```bash
# System status
./monitor-system.sh

# Check all services
./check-services.sh

# Create backup
./backup-system.sh
```

## 📊 Monitoring

### Logs Location
- **Application:** `docker-compose logs nextjs`
- **Nginx:** `docker-compose logs nginx`
- **System:** `/var/log/`

### Health Checks
- **Application:** https://scjsnext.com/api/health
- **Nginx:** https://scjsnext.com/nginx-health
- **SSL Grade:** [SSL Labs Test](https://www.ssllabs.com/ssltest/analyze.html?d=scjsnext.com)

## 🔒 Security Features

✅ **SSL/HTTPS Enforcement**
- Let's Encrypt certificates
- Auto-renewal configured
- HSTS headers

✅ **Firewall Configuration**
- UFW firewall active
- Only ports 22, 80, 443 open

✅ **Intrusion Prevention**
- Fail2ban configured
- Rate limiting active

✅ **Security Headers**
- CSP (Content Security Policy)
- XSS Protection
- Frame Options
- HSTS

✅ **Container Security**
- Non-root user
- Read-only filesystem
- Dropped capabilities

## ⚙️ Configuration Files

### Environment Variables
- `Frontend/.env.local` - Application environment
- `Frontend/.env.production` - Production overrides

### Docker Configuration
- `docker-compose.yml` - Production with SSL
- `Dockerfile` - Multi-stage production build

### Nginx Configuration
- `nginx/nginx.conf` - SSL-enabled reverse proxy

## 🔄 Automated Tasks

| Task | Schedule | Description |
|------|----------|-------------|
| SSL Renewal | Daily 2 AM | Renew SSL certificates |
| System Monitor | Every 6 hours | Check system status |
| Backup | Weekly Sunday 3 AM | Full system backup |
| Docker Cleanup | Weekly Saturday 4 AM | Clean unused resources |

## 🆘 Troubleshooting

### SSL Issues
```bash
# Check certificate
openssl x509 -in nginx/ssl/live/scjsnext.com/fullchain.pem -text -noout

# Renew certificate
./renew-ssl.sh

# Check Nginx config
docker-compose exec nginx nginx -t
```

### Application Issues
```bash
# Check container status
docker-compose ps

# View application logs
docker-compose logs nextjs

# Restart application
docker-compose restart nextjs
```

### Performance Issues
```bash
# Check system resources
htop

# Check disk space
df -h

# Clean Docker
docker system prune -f
```

## 📈 Performance Optimizations

✅ **Nginx Optimizations**
- Gzip compression
- Static file caching
- HTTP/2 enabled
- Keep-alive connections

✅ **Application Optimizations**
- Multi-stage Docker build
- Production-optimized Next.js
- Image optimization
- Bundle optimization

✅ **Security Optimizations**
- Rate limiting
- Connection limiting
- Security headers
- Input validation

## 📞 Support

For issues and support:
1. Check logs: `docker-compose logs -f`
2. Run diagnostics: `./check-services.sh`
3. Review documentation above
4. Contact system administrator

---

**🎉 Your Next.js Payment System is production-ready with enterprise-grade security and performance!**