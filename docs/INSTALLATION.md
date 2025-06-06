# Installation Guide

This guide will walk you through the complete installation process of the SEO Automation System.

## Prerequisites

Before you begin, ensure you have the following:

### System Requirements
- **Operating System**: Ubuntu 22.04 LTS (recommended) or Ubuntu 20.04 LTS
- **CPU**: Minimum 4 cores (8 cores recommended)
- **RAM**: Minimum 16GB (32GB recommended)
- **Storage**: 100GB SSD with at least 50GB free space
- **Network**: Stable internet connection (1Gbps recommended)

### Software Requirements
- Node.js 20.x or higher
- npm 10.x or higher
- Docker 24.x or higher
- Docker Compose 2.x or higher
- Git 2.x or higher
- PM2 (will be installed globally)

### Required Accounts
- Proxy service account (e.g., mobile-proxies.ru)
- Anti-captcha service accounts (at least one):
  - [Anti-Captcha](https://anti-captcha.com)
  - [2Captcha](https://2captcha.com)
  - [CapSolver](https://capsolver.com)

## Step 1: System Preparation

### 1.1 Update System
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential software-properties-common
```

### 1.2 Install Node.js
```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### 1.3 Install Docker
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add current user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version
```

**Note**: You need to log out and log back in for the docker group changes to take effect.

### 1.4 Install PM2
```bash
sudo npm install -g pm2
pm2 --version
```

## Step 2: Clone and Setup Repository

### 2.1 Clone Repository
```bash
cd ~
git clone https://github.com/yourusername/seo-automation.git
cd seo-automation
```

### 2.2 Install Dependencies
```bash
npm install
```

### 2.3 Build TypeScript
```bash
npm run build
```

## Step 3: Configuration

### 3.1 Environment Variables
```bash
# Copy example environment file
cp .env.example .env

# Edit environment variables
nano .env
```

Key configuration variables:

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/seo-automation
REDIS_URL=redis://localhost:6379

# Proxy Service
PROXY_PROVIDER=mobile-proxies.ru
PROXY_API_KEY=your_actual_api_key_here

# Anti-captcha Services (add your actual keys)
ANTICAPTCHA_KEY=your_anticaptcha_key
TWOCAPTCHA_KEY=your_2captcha_key
CAPSOLVER_KEY=your_capsolver_key

# Browser Settings
BROWSER_HEADLESS=true  # Set to false for debugging
MAX_CONCURRENT_TASKS=10  # Adjust based on your server capacity

# Monitoring (optional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
```

### 3.2 Proxy Configuration
Create proxy configuration file:
```bash
nano config/proxies.json
```

Example configuration:
```json
{
  "providers": [
    {
      "name": "mobile-proxies.ru",
      "type": "mobile",
      "apiUrl": "https://api.mobile-proxies.ru/v1",
      "regions": ["RU"],
      "rotationInterval": 300000,
      "concurrent": 200
    }
  ]
}
```

### 3.3 Search Queries
Create your search queries file:
```bash
nano config/search-queries.txt
```

Format: `query|target_domain`
```
купить телефон москва|example.com
iphone 15 pro купить|example.com
смартфон недорого|example.com
```

## Step 4: Start Infrastructure

### 4.1 Start Docker Services
```bash
# Start MongoDB, Redis, and monitoring services
docker-compose up -d

# Verify services are running
docker-compose ps
```

### 4.2 Initialize Database
```bash
# Run database migrations
npm run migrate

# Create indexes
npm run cli db:create-indexes
```

### 4.3 Generate Initial Profiles
```bash
# Generate 50 profiles for Moscow region
npm run cli profiles:create --count 50 --region Moscow
```

## Step 5: Start Application

### 5.1 Start with PM2
```bash
# Start application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions printed by this command
```

### 5.2 Verify Installation
```bash
# Check application status
pm2 status

# View logs
pm2 logs seo-automation

# Check system health
npm run cli system:status
```

## Step 6: Access Web Interface

1. Open your browser and navigate to: `http://your-server-ip:3000`
2. Default credentials (if authentication is enabled):
   - Username: `admin`
   - Password: `changeme`

3. **Important**: Change the default password immediately!

## Step 7: Monitoring Setup

### 7.1 Grafana
1. Access Grafana: `http://your-server-ip:3001`
2. Default credentials: `admin` / `admin`
3. Import dashboards from `config/grafana/dashboards/`

### 7.2 Prometheus
1. Access Prometheus: `http://your-server-ip:9090`
2. Verify targets are up: Status → Targets

## Step 8: Setup Automation

### 8.1 Configure Cron Jobs
```bash
# Setup automated tasks
./scripts/setup-cron.sh

# Verify cron jobs
crontab -l
```

### 8.2 Configure Daily Routine
```bash
# Make scripts executable
chmod +x scripts/*.sh

# Test daily routine
./scripts/daily-routine.sh
```

## Post-Installation

### Security Checklist
- [ ] Changed all default passwords
- [ ] Configured firewall rules
- [ ] Enabled SSL/TLS for web interface
- [ ] Restricted MongoDB access
- [ ] Set up backup routine

### Performance Tuning
```bash
# Increase system limits
echo "fs.file-max = 100000" | sudo tee -a /etc/sysctl.conf
echo "* soft nofile 100000" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 100000" | sudo tee -a /etc/security/limits.conf

# Apply changes
sudo sysctl -p
```

### Firewall Configuration
```bash
# Allow required ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 3000/tcp  # Web Interface
sudo ufw allow 3001/tcp  # Grafana
sudo ufw allow 9090/tcp  # Prometheus
sudo ufw enable
```

## Troubleshooting

### Common Issues

**1. Docker permission denied**
```bash
# Make sure user is in docker group
sudo usermod -aG docker $USER
# Log out and log back in
```

**2. MongoDB connection failed**
```bash
# Check if MongoDB is running
docker-compose ps
# Restart MongoDB
docker-compose restart mongodb
```

**3. Playwright browsers not installing**
```bash
# Install browser dependencies
npx playwright install-deps
# Force reinstall browsers
npx playwright install chromium --force
```

**4. Out of memory errors**
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=8192"
# Add to ~/.bashrc to make permanent
```

### Getting Help

If you encounter issues:
1. Check the [Troubleshooting Guide](TROUBLESHOOTING.md)
2. Review logs: `pm2 logs seo-automation`
3. Open an issue on GitHub
4. Join our Discord community

## Next Steps

1. Read the [Configuration Guide](CONFIGURATION.md) to customize settings
2. Review the [API Documentation](API.md) for integration options
3. Set up monitoring alerts
4. Start creating your first SEO campaigns!

---

Installation completed! 🎉 Your SEO Automation System is now ready to use.