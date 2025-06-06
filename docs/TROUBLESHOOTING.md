# Troubleshooting Guide

This guide helps you diagnose and fix common issues with the SEO Automation System.

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Browser & Automation Issues](#browser--automation-issues)
3. [Proxy Issues](#proxy-issues)
4. [Captcha Issues](#captcha-issues)
5. [Performance Issues](#performance-issues)
6. [Database Issues](#database-issues)
7. [Profile Issues](#profile-issues)
8. [Task Execution Issues](#task-execution-issues)
9. [API Issues](#api-issues)
10. [Monitoring Issues](#monitoring-issues)

## Installation Issues

### Node.js Version Mismatch

**Problem**: `Error: Node.js version 20.x or higher is required`

**Solution**:
```bash
# Check current version
node --version

# Update Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### npm Install Fails

**Problem**: `npm ERR! code EACCES` or permission errors

**Solution**:
```bash
# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Or use sudo (not recommended)
sudo npm install -g pm2
```

### Docker Permission Denied

**Problem**: `docker: Got permission denied while trying to connect`

**Solution**:
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in, then verify
groups $USER
```

### Playwright Browsers Not Installing

**Problem**: `Failed to install browsers`

**Solution**:
```bash
# Install system dependencies
sudo apt-get install -y \
  libgbm-dev \
  libasound2 \
  libatk1.0-0 \
  libcups2 \
  libxss1 \
  libgtk-3-0

# Force reinstall
npx playwright install --force chromium
npx playwright install-deps chromium
```

## Browser & Automation Issues

### Browser Crashes Frequently

**Problem**: Browsers crash with `Target closed` or `Page crashed`

**Solution**:
1. Increase memory limits:
```bash
# In .env
BROWSER_POOL_SIZE=5  # Reduce pool size
NODE_OPTIONS="--max-old-space-size=8192"
```

2. Add browser arguments:
```javascript
// In config
BROWSER_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage,--disable-gpu
```

3. Check system resources:
```bash
# Monitor memory usage
free -h
htop

# Check for zombie processes
ps aux | grep chrome | grep defunct
```

### Headless Mode Detection

**Problem**: Sites detect headless browser

**Solution**:
1. Disable headless mode for debugging:
```bash
BROWSER_HEADLESS=false
```

2. Update stealth plugin:
```bash
npm update playwright-extra-plugin-stealth
```

3. Check fingerprint uniqueness:
```bash
npm run cli profiles:check-fingerprint --id profile-123
```

### Element Not Found Errors

**Problem**: `Element not found` or `Timeout waiting for selector`

**Solution**:
1. Increase timeouts:
```javascript
BROWSER_TIMEOUT=60000  # 60 seconds
```

2. Add better waiting strategies:
```javascript
// Wait for network idle
await page.waitForLoadState('networkidle');

// Wait for specific element
await page.waitForSelector('.search-results', { 
  state: 'visible',
  timeout: 30000 
});
```

## Proxy Issues

### All Proxies Failing

**Problem**: `No working proxies available`

**Solution**:
1. Check proxy credentials:
```bash
# Test proxy manually
curl -x http://user:pass@proxy:port https://api.ipify.org
```

2. Verify proxy configuration:
```json
// config/proxies.json
{
  "providers": [{
    "apiUrl": "https://api.mobile-proxies.ru/v1",
    "apiKey": "${PROXY_API_KEY}"  // Check this is set in .env
  }]
}
```

3. Test proxy rotation:
```bash
npm run cli proxies:test --provider mobile-proxies.ru
```

### High Proxy Failure Rate

**Problem**: Many proxy connection failures

**Solution**:
1. Increase rotation interval:
```bash
PROXY_ROTATION_INTERVAL=600000  # 10 minutes
```

2. Enable validation:
```bash
ENABLE_PROXY_VALIDATION=true
```

3. Check blacklisted IPs:
```bash
npm run cli proxies:check-blacklist
```

## Captcha Issues

### High Captcha Rate

**Problem**: Encountering captchas frequently

**Solution**:
1. Reduce request frequency:
```javascript
// Increase delays between actions
TASK_MIN_DELAY=5000
TASK_MAX_DELAY=15000
```

2. Improve behavior patterns:
```bash
# Add more organic activity
npm run cli tasks:create --type organic --profiles all
```

3. Rotate proxies more frequently:
```bash
PROXY_ROTATION_INTERVAL=180000  # 3 minutes
```

### Captcha Service Not Working

**Problem**: `Failed to solve captcha`

**Solution**:
1. Check service balance:
```bash
npm run cli captcha:balance
```

2. Test services:
```bash
npm run cli captcha:test --service anticaptcha
npm run cli captcha:test --service 2captcha
```

3. Switch primary service:
```json
// config/anticaptcha.json
{
  "services": [{
    "name": "2captcha",
    "priority": 1  // Make this primary
  }]
}
```

## Performance Issues

### High Memory Usage

**Problem**: System using too much RAM

**Solution**:
1. Reduce concurrent operations:
```bash
MAX_CONCURRENT_TASKS=5
BROWSER_POOL_SIZE=5
```

2. Enable memory limits:
```bash
MEMORY_LIMIT=4096  # 4GB max
```

3. Clean up old data:
```bash
npm run cli db:cleanup --days 7
```

### Slow Task Execution

**Problem**: Tasks taking too long to complete

**Solution**:
1. Check system load:
```bash
# CPU and memory
top
iostat -x 1

# Network
iftop
nethogs
```

2. Optimize browser settings:
```javascript
// Disable images and CSS
BROWSER_LOAD_IMAGES=false
BROWSER_LOAD_CSS=false
```

3. Use task prioritization:
```bash
# High priority for important tasks
npm run cli tasks:create --priority 1
```

## Database Issues

### MongoDB Connection Failed

**Problem**: `MongoNetworkError` or `Connection refused`

**Solution**:
1. Check MongoDB status:
```bash
docker-compose ps mongodb
docker-compose logs mongodb
```

2. Verify connection string:
```bash
# Test connection
mongosh "mongodb://localhost:27017/seo-automation"
```

3. Restart MongoDB:
```bash
docker-compose restart mongodb
```

### Redis Connection Issues

**Problem**: `Redis connection error`

**Solution**:
1. Check Redis status:
```bash
docker-compose ps redis
redis-cli ping
```

2. Clear Redis cache:
```bash
redis-cli FLUSHDB
```

3. Check memory usage:
```bash
redis-cli INFO memory
```

## Profile Issues

### Profiles Getting Suspended

**Problem**: Many profiles with suspended status

**Solution**:
1. Check health factors:
```bash
npm run cli profiles:health-report
```

2. Adjust health thresholds:
```bash
PROFILE_HEALTH_THRESHOLD=50  # Lower threshold
```

3. Improve warmup process:
```bash
PROFILE_WARMUP_DAYS=21  # Longer warmup
```

### Profile Creation Fails

**Problem**: `Failed to create profile`

**Solution**:
1. Check profile limits:
```bash
# Current profile count
npm run cli profiles:count

# Limit in .env
MAX_PROFILES=200
```

2. Verify fingerprint generation:
```bash
npm run cli profiles:test-fingerprint
```

## Task Execution Issues

### Tasks Stuck in Pending

**Problem**: Tasks not being processed

**Solution**:
1. Check task scheduler:
```bash
npm run cli system:status
pm2 status seo-worker
```

2. Clear stuck tasks:
```bash
npm run cli tasks:clear-stuck
```

3. Restart workers:
```bash
pm2 restart seo-worker
```

### High Task Failure Rate

**Problem**: Many tasks failing

**Solution**:
1. Check error logs:
```bash
npm run cli tasks:errors --recent
tail -f logs/tasks-*.log
```

2. Test with single task:
```bash
npm run cli tasks:test --type search --debug
```

3. Reduce task complexity:
```javascript
// Simpler search config
{
  "maxResultPages": 3,  // Instead of 10
  "actions": ["click"]  // Fewer actions
}
```

## API Issues

### Authentication Errors

**Problem**: `401 Unauthorized`

**Solution**:
1. Verify API key:
```bash
# Check .env
grep API_KEY .env

# Test API key
curl -H "X-API-Key: your-key" http://localhost:3000/api/system/status
```

2. Regenerate API key:
```bash
npm run cli system:regenerate-api-key
```

### Rate Limiting

**Problem**: `429 Too Many Requests`

**Solution**:
1. Check rate limit settings:
```bash
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
```

2. Implement retry logic:
```javascript
// With exponential backoff
const retry = require('retry');
const operation = retry.operation({
  retries: 5,
  factor: 2,
  minTimeout: 1000
});
```

## Monitoring Issues

### Grafana Not Loading

**Problem**: Cannot access Grafana dashboard

**Solution**:
1. Check Grafana status:
```bash
docker-compose ps grafana
docker-compose logs grafana
```

2. Reset admin password:
```bash
docker exec -it seo-grafana grafana-cli admin reset-admin-password newpassword
```

### Missing Metrics

**Problem**: Metrics not appearing in dashboards

**Solution**:
1. Check Prometheus targets:
```
http://localhost:9090/targets
```

2. Verify metrics endpoint:
```bash
curl http://localhost:3000/metrics
```

3. Restart metrics collector:
```bash
pm2 restart seo-metrics
```

## Debug Mode

Enable debug mode for detailed logging:

```bash
# In .env
DEBUG_MODE=true
LOG_LEVEL=debug
DEBUG_SAVE_SCREENSHOTS=true
DEBUG_SAVE_HTML=true

# Run with debug
npm run dev
```

## Getting Help

If you can't resolve an issue:

1. Check logs:
```bash
# All logs
tail -f logs/*.log

# Specific component
tail -f logs/error-*.log
```

2. Run diagnostics:
```bash
npm run cli system:diagnose
```

3. Create debug report:
```bash
npm run cli system:debug-report --output debug-report.zip
```

4. Contact support with:
   - Debug report
   - Steps to reproduce
   - Error messages
   - System information