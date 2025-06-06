# SEO Automation System

Advanced SEO automation system for search engine optimization through behavioral factors improvement. The system simulates real user behavior to improve website positions in Yandex and Google search results.

⚠️ **Disclaimer**: This software is provided for educational and research purposes only. Users are responsible for compliance with search engine terms of service and local regulations.

## 🚀 Features

- **200+ Unique Browser Profiles** - Each with individual fingerprints and behavior patterns
- **Multi-Search Engine Support** - Works with both Yandex and Google
- **Smart Task Distribution** - Intelligent scheduling and prioritization
- **Anti-Detection System** - Advanced browser fingerprinting and stealth techniques
- **Real-time Monitoring** - Comprehensive metrics and position tracking
- **Automated Captcha Solving** - Integration with multiple anti-captcha services
- **Proxy Rotation** - Automatic proxy management and rotation
- **Detailed Analytics** - ROI tracking and performance metrics

## 📋 Requirements

- Ubuntu 22.04 LTS or higher
- Node.js 20.x or higher
- Docker & Docker Compose
- 16GB RAM minimum (32GB recommended)
- 100GB SSD storage
- Stable internet connection (1Gbps recommended)

## 🛠️ Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/seo-automation.git
cd seo-automation
```

### 2. Run setup script
```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### 3. Configure environment
```bash
cp .env.example .env
nano .env  # Edit with your API keys
```

### 4. Start the system
```bash
docker-compose up -d
npm run build
pm2 start ecosystem.config.js
```

### 5. Access the dashboard
Open http://localhost:3000 in your browser

## 📖 Documentation

- [Installation Guide](docs/INSTALLATION.md) - Detailed installation instructions
- [Configuration Guide](docs/CONFIGURATION.md) - System configuration options
- [API Reference](docs/API.md) - REST API documentation
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issues and solutions

## 🎯 Basic Usage

### Create profiles
```bash
npm run cli profiles:create --count 50 --region Moscow
```

### Start a search campaign
```bash
npm run cli tasks:create \
  --type search \
  --query "your search query" \
  --target "yourdomain.com" \
  --engine yandex \
  --profiles 30
```

### Monitor positions
```bash
npm run cli metrics:positions --domain yourdomain.com
```

### View system status
```bash
npm run cli system:status
```

## 🏗️ Architecture

The system consists of several key components:

- **Profile Manager** - Manages browser profiles and fingerprints
- **Task Scheduler** - Distributes and schedules tasks
- **Browser Pool** - Manages Playwright browser instances
- **Behavior Engine** - Simulates human-like behavior
- **Proxy Service** - Handles proxy rotation
- **Metrics Service** - Collects and analyzes performance data

## 🧪 Testing

Run the test suite:
```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# All tests with coverage
npm run test:coverage
```

## 📊 Monitoring

- **Grafana Dashboard**: http://localhost:3001 (admin/admin)
- **Prometheus Metrics**: http://localhost:9090
- **API Health Check**: http://localhost:3000/health

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚖️ Legal Notice

This software is designed for legitimate SEO testing and optimization of your own websites. Users must:
- Comply with all applicable laws and regulations
- Respect robots.txt files and rate limits
- Use the software only on websites they own or have permission to test
- Not use the software for malicious purposes or to harm others

## 🆘 Support

- **Documentation**: [/docs](./docs)
- **Issues**: [GitHub Issues](https://github.com/yourusername/seo-automation/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/seo-automation/discussions)

## 🙏 Acknowledgments

- [Playwright](https://playwright.dev/) - Browser automation
- [Puppeteer Stealth](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth) - Anti-detection techniques
- [Anti-captcha](https://anti-captcha.com/) - Captcha solving service

---

Made with ❤️ by the SEO Automation Team