#!/bin/bash

# SEO Automation System - Setup Script
# This script automates the installation and configuration process

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════╗"
    echo "║          SEO Automation System Setup Script           ║"
    echo "║                    Version 1.0.0                      ║"
    echo "╚═══════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_requirements() {
    log_info "Checking system requirements..."
    
    # Check OS
    if [[ "$OSTYPE" != "linux-gnu"* ]]; then
        log_error "This script is designed for Linux systems only"
        exit 1
    fi
    
    # Check Ubuntu version
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        if [[ "$ID" != "ubuntu" ]] || [[ "$VERSION_ID" != "22.04" && "$VERSION_ID" != "20.04" ]]; then
            log_warn "This script is tested on Ubuntu 20.04 and 22.04"
            read -p "Continue anyway? (y/n) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi
    fi
    
    # Check RAM
    total_ram=$(free -m | awk '/^Mem:/{print $2}')
    if [ "$total_ram" -lt 16000 ]; then
        log_warn "System has ${total_ram}MB RAM. Recommended: 16GB+"
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    # Check disk space
    available_space=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')
    if [ "$available_space" -lt 50 ]; then
        log_warn "Available disk space: ${available_space}GB. Recommended: 50GB+"
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    log_info "System requirements check completed"
}

install_dependencies() {
    log_info "Installing system dependencies..."
    
    # Update package list
    sudo apt update
    
    # Install required packages
    sudo apt install -y \
        curl \
        wget \
        git \
        build-essential \
        software-properties-common \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        unzip \
        jq
    
    log_info "System dependencies installed"
}

install_nodejs() {
    log_info "Installing Node.js 20.x..."
    
    # Check if Node.js is already installed
    if command -v node &> /dev/null; then
        node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$node_version" -ge 20 ]; then
            log_info "Node.js $(node -v) is already installed"
            return
        else
            log_warn "Node.js $(node -v) is installed but version 20.x is required"
        fi
    fi
    
    # Install Node.js 20.x
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    
    # Verify installation
    log_info "Node.js $(node -v) installed"
    log_info "npm $(npm -v) installed"
}

install_docker() {
    log_info "Installing Docker..."
    
    # Check if Docker is already installed
    if command -v docker &> /dev/null; then
        log_info "Docker $(docker --version) is already installed"
    else
        # Install Docker
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        rm get-docker.sh
        
        # Add current user to docker group
        sudo usermod -aG docker $USER
        log_warn "You need to log out and back in for docker group changes to take effect"
    fi
    
    # Install Docker Compose
    if command -v docker-compose &> /dev/null; then
        log_info "Docker Compose is already installed"
    else
        sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
        log_info "Docker Compose installed"
    fi
}

install_pm2() {
    log_info "Installing PM2..."
    
    if command -v pm2 &> /dev/null; then
        log_info "PM2 is already installed"
    else
        sudo npm install -g pm2
        log_info "PM2 installed"
    fi
}

setup_project() {
    log_info "Setting up project..."
    
    # Install npm dependencies
    log_info "Installing npm dependencies..."
    npm install
    
    # Build TypeScript
    log_info "Building TypeScript..."
    npm run build
    
    # Create necessary directories
    log_info "Creating directories..."
    mkdir -p logs data backups config/grafana/dashboards config/grafana/provisioning
    
    # Copy environment file
    if [ ! -f .env ]; then
        log_info "Creating .env file..."
        cp .env.example .env
        log_warn "Please edit .env file with your API keys and configuration"
    else
        log_info ".env file already exists"
    fi
    
    # Create default config files if they don't exist
    if [ ! -f config/proxies.json ]; then
        log_info "Creating default proxy configuration..."
        cat > config/proxies.json << 'EOF'
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
  ],
  "validation": {
    "checkInterval": 60000,
    "timeout": 5000,
    "retries": 3
  }
}
EOF
    fi
    
    if [ ! -f config/anticaptcha.json ]; then
        log_info "Creating default anticaptcha configuration..."
        cat > config/anticaptcha.json << 'EOF'
{
  "services": [
    {
      "name": "anticaptcha",
      "priority": 1,
      "supportedTypes": ["recaptcha", "yandex", "image"],
      "timeout": 180000,
      "maxAttempts": 3
    },
    {
      "name": "2captcha",
      "priority": 2,
      "supportedTypes": ["recaptcha", "yandex"],
      "timeout": 180000,
      "maxAttempts": 2
    }
  ]
}
EOF
    fi
    
    # Create Prometheus configuration
    if [ ! -f config/prometheus.yml ]; then
        log_info "Creating Prometheus configuration..."
        cat > config/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'seo-automation'
    static_configs:
      - targets: ['host.docker.internal:3000']
    metrics_path: '/metrics'
    
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['host.docker.internal:9100']
EOF
    fi
    
    # Set permissions
    chmod 600 .env
    chmod +x scripts/*.sh
}

install_playwright_browsers() {
    log_info "Installing Playwright browsers..."
    
    # Install Playwright browsers and dependencies
    npx playwright install chromium
    npx playwright install-deps chromium
    
    log_info "Playwright browsers installed"
}

start_docker_services() {
    log_info "Starting Docker services..."
    
    # Start services
    docker-compose up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to start..."
    sleep 10
    
    # Check service health
    if docker-compose ps | grep -q "unhealthy\|Exit"; then
        log_error "Some services failed to start properly"
        docker-compose ps
        exit 1
    fi
    
    log_info "Docker services started successfully"
}

initialize_database() {
    log_info "Initializing database..."
    
    # Wait for MongoDB to be ready
    max_attempts=30
    attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if docker exec seo-mongodb mongosh --eval "db.adminCommand('ping')" &> /dev/null; then
            log_info "MongoDB is ready"
            break
        fi
        
        attempt=$((attempt + 1))
        log_info "Waiting for MongoDB... ($attempt/$max_attempts)"
        sleep 2
    done
    
    if [ $attempt -eq $max_attempts ]; then
        log_error "MongoDB failed to start"
        exit 1
    fi
    
    # Run migrations
    log_info "Running database migrations..."
    npm run migrate || log_warn "Migration script not found, skipping..."
}

setup_pm2() {
    log_info "Setting up PM2..."
    
    # Start application with PM2
    pm2 start ecosystem.config.js
    
    # Save PM2 configuration
    pm2 save
    
    # Setup PM2 startup script
    log_info "Setting up PM2 startup script..."
    pm2 startup systemd -u $USER --hp $HOME
    
    log_info "PM2 setup completed"
}

print_summary() {
    echo
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║         Installation Completed Successfully!          ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
    echo
    echo -e "${BLUE}Next Steps:${NC}"
    echo "1. Edit the .env file with your API keys:"
    echo "   nano .env"
    echo
    echo "2. Add your search queries to config/search-queries.txt"
    echo
    echo "3. Create initial profiles:"
    echo "   npm run cli profiles:create --count 50 --region Moscow"
    echo
    echo "4. Access the web interface:"
    echo "   http://localhost:3000"
    echo
    echo "5. Access monitoring dashboards:"
    echo "   - Grafana: http://localhost:3001 (admin/admin)"
    echo "   - Prometheus: http://localhost:9090"
    echo
    echo -e "${YELLOW}Important:${NC}"
    echo "- Remember to log out and back in for Docker permissions"
    echo "- Configure your proxy and anticaptcha services in .env"
    echo "- Review security settings before production use"
    echo
    echo -e "${GREEN}Happy SEO Automation! 🚀${NC}"
}

# Main execution
main() {
    print_banner
    
    # Check if running as root
    if [ "$EUID" -eq 0 ]; then 
        log_error "Please do not run this script as root"
        exit 1
    fi
    
    # Run installation steps
    check_requirements
    install_dependencies
    install_nodejs
    install_docker
    install_pm2
    setup_project
    install_playwright_browsers
    start_docker_services
    initialize_database
    setup_pm2
    
    # Print summary
    print_summary
}

# Run main function
main "$@"