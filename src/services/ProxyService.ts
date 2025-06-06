import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { CaptchaService } from './CaptchaService';
import { DatabaseService } from './DatabaseService';
import { createLogger, Logger } from '../utils/logger';
import { ProxyConfig } from '../types';
import { config } from '../config';
import { validateProxyConfig } from '../config/validators';
import { ProxyError, ServiceUnavailableError } from '../utils/errors';
import { retry, RateLimiter } from '../utils/helpers';

interface ProxyProvider {
  name: string;
  type: 'mobile' | 'residential' | 'datacenter';
  apiUrl: string;
  apiKey?: string;
  regions: string[];
  getProxy: (region?: string) => Promise<ProxyConfig>;
  validateProxy: (proxy: ProxyConfig) => Promise<boolean>;
  reportProxy: (proxy: ProxyConfig, success: boolean) => Promise<void>;
}

export class ProxyService {
  private logger: Logger;
  private providers: Map<string, ProxyProvider> = new Map();
  private proxyPool: Map<string, ProxyConfig[]> = new Map();
  private blacklist: Set<string> = new Set();
  private rotationInterval?: NodeJS.Timer;
  private rateLimiter: RateLimiter;
  public captchaService?: CaptchaService;
  
  constructor(private db?: DatabaseService) {
    this.logger = createLogger('ProxyService');
    this.rateLimiter = new RateLimiter(10, 1000); // 10 requests per second
  }
  
  async initialize(): Promise<void> {
    this.logger.info('Initializing ProxyService...');
    
    // Load proxy configuration
    const proxyConfig = await this.loadProxyConfig();
    validateProxyConfig(proxyConfig);
    
    // Initialize providers
    for (const providerConfig of proxyConfig.providers) {
      const provider = this.createProvider(providerConfig);
      this.providers.set(provider.name, provider);
    }
    
    // Initialize captcha service
    this.captchaService = new CaptchaService();
    await this.captchaService.initialize();
    
    // Load blacklist from database
    if (this.db) {
      await this.loadBlacklist();
    }
    
    // Initial proxy fetch
    await this.refreshProxyPool();
    
    // Start rotation
    this.startRotation(proxyConfig.rotation?.strategy || 'round-robin');
    
    this.logger.info(`ProxyService initialized with ${this.providers.size} providers`);
  }
  
  async shutdown(): Promise<void> {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
    }
    
    if (this.captchaService) {
      await this.captchaService.shutdown();
    }
  }
  
  async getProxy(region?: string): Promise<ProxyConfig> {
    const poolKey = region || 'global';
    let proxies = this.proxyPool.get(poolKey) || [];
    
    // Remove blacklisted proxies
    proxies = proxies.filter(p => !this.blacklist.has(p.ip || p.server));
    
    if (proxies.length === 0) {
      // Try to refresh pool
      await this.refreshProxyPool(region);
      proxies = this.proxyPool.get(poolKey) || [];
      
      if (proxies.length === 0) {
        throw new ServiceUnavailableError('No available proxies');
      }
    }
    
    // Select proxy based on rotation strategy
    const proxy = this.selectProxy(proxies);
    
    // Validate proxy
    const isValid = await this.validateProxy(proxy);
    if (!isValid) {
      // Remove invalid proxy and try again
      this.removeProxy(proxy);
      return this.getProxy(region);
    }
    
    // Update last used
    proxy.lastUsed = new Date();
    
    return proxy;
  }
  
  async validateProxy(proxy: ProxyConfig): Promise<boolean> {
    try {
      const testUrl = 'https://api.ipify.org?format=json';
      const agent = new HttpsProxyAgent(
        `${proxy.protocol}://${proxy.username}:${proxy.password}@${proxy.server}:${proxy.port}`
      );
      
      const response = await axios.get(testUrl, {
        httpsAgent: agent,
        timeout: 10000
      });
      
      const ip = response.data.ip;
      
      // Update proxy IP if not set
      if (!proxy.ip) {
        proxy.ip = ip;
      }
      
      // Check if IP is blacklisted
      if (this.blacklist.has(ip)) {
        this.logger.warn(`Proxy ${ip} is blacklisted`);
        return false;
      }
      
      // Additional validation (geo, etc.)
      if (config.ENABLE_PROXY_VALIDATION) {
        return await this.performAdvancedValidation(proxy, ip);
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Proxy validation failed for ${proxy.server}:`, error);
      return false;
    }
  }
  
  async rotateProxy(currentProxy: ProxyConfig, region?: string): Promise<ProxyConfig> {
    // Mark current proxy as recently used
    currentProxy.lastUsed = new Date();
    
    // Get new proxy
    const newProxy = await this.getProxy(region);
    
    this.logger.debug(`Rotated proxy from ${currentProxy.ip} to ${newProxy.ip}`);
    
    return newProxy;
  }
  
  reportProxyFailure(proxy: ProxyConfig, error: Error): void {
    proxy.stats.failures++;
    
    // Update average response time (penalty for failure)
    const currentAvg = proxy.stats.avgResponseTime;
    proxy.stats.avgResponseTime = currentAvg * 1.1; // 10% penalty
    
    // Check if proxy should be blacklisted
    const failureRate = proxy.stats.failures / proxy.stats.requests;
    if (failureRate > 0.5 && proxy.stats.requests > 10) {
      this.blacklistProxy(proxy);
    }
    
    // Report to provider
    const provider = this.getProviderForProxy(proxy);
    if (provider) {
      provider.reportProxy(proxy, false).catch(err => 
        this.logger.error('Failed to report proxy failure:', err)
      );
    }
  }
  
  reportProxySuccess(proxy: ProxyConfig, responseTime: number): void {
    proxy.stats.requests++;
    
    // Update average response time
    const currentAvg = proxy.stats.avgResponseTime;
    const newAvg = (currentAvg * (proxy.stats.requests - 1) + responseTime) / proxy.stats.requests;
    proxy.stats.avgResponseTime = newAvg;
    
    // Report to provider
    const provider = this.getProviderForProxy(proxy);
    if (provider) {
      provider.reportProxy(proxy, true).catch(err => 
        this.logger.error('Failed to report proxy success:', err)
      );
    }
  }
  
  async getStats(): Promise<any> {
    const stats = {
      totalProxies: 0,
      workingProxies: 0,
      blacklistedProxies: this.blacklist.size,
      byRegion: {} as Record<string, number>,
      byProvider: {} as Record<string, number>,
      avgResponseTime: 0
    };
    
    let totalResponseTime = 0;
    let totalRequests = 0;
    
    for (const [region, proxies] of this.proxyPool) {
      stats.byRegion[region] = proxies.length;
      stats.totalProxies += proxies.length;
      
      for (const proxy of proxies) {
        if (proxy.status === 'active') {
          stats.workingProxies++;
        }
        
        totalResponseTime += proxy.stats.avgResponseTime * proxy.stats.requests;
        totalRequests += proxy.stats.requests;
        
        const providerName = proxy.provider;
        stats.byProvider[providerName] = (stats.byProvider[providerName] || 0) + 1;
      }
    }
    
    stats.avgResponseTime = totalRequests > 0 ? totalResponseTime / totalRequests : 0;
    
    return stats;
  }
  
  private createProvider(config: any): ProxyProvider {
    switch (config.name) {
      case 'mobile-proxies.ru':
        return this.createMobileProxiesRuProvider(config);
      default:
        return this.createGenericProvider(config);
    }
  }
  
  private createMobileProxiesRuProvider(config: any): ProxyProvider {
    return {
      name: config.name,
      type: config.type,
      apiUrl: config.apiUrl,
      apiKey: config.apiKey || process.env.PROXY_API_KEY,
      regions: config.regions,
      
      async getProxy(region?: string): Promise<ProxyConfig> {
        const response = await axios.post(`${this.apiUrl}/getProxy`, {
          apiKey: this.apiKey,
          region: region || 'RU',
          type: 'mobile'
        });
        
        const data = response.data;
        
        return {
          id: data.id,
          provider: this.name,
          type: this.type,
          server: data.host,
          port: data.port,
          username: data.username,
          password: data.password,
          protocol: 'http',
          region: data.region,
          city: data.city,
          ip: data.ip,
          status: 'active',
          lastCheck: new Date(),
          stats: {
            requests: 0,
            failures: 0,
            avgResponseTime: 0,
            captchaRate: 0
          }
        };
      },
      
      async validateProxy(proxy: ProxyConfig): Promise<boolean> {
        try {
          const response = await axios.post(`${this.apiUrl}/checkProxy`, {
            apiKey: this.apiKey,
            proxyId: proxy.id
          });
          
          return response.data.status === 'active';
        } catch {
          return false;
        }
      },
      
      async reportProxy(proxy: ProxyConfig, success: boolean): Promise<void> {
        await axios.post(`${this.apiUrl}/reportProxy`, {
          apiKey: this.apiKey,
          proxyId: proxy.id,
          success,
          timestamp: new Date()
        });
      }
    };
  }
  
  private createGenericProvider(config: any): ProxyProvider {
    // Generic provider implementation
    return {
      name: config.name,
      type: config.type,
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      regions: config.regions,
      
      async getProxy(region?: string): Promise<ProxyConfig> {
        // Generic API call
        const response = await axios.get(`${this.apiUrl}/proxy`, {
          params: { region, apiKey: this.apiKey }
        });
        
        return this.parseProxyResponse(response.data);
      },
      
      async validateProxy(proxy: ProxyConfig): Promise<boolean> {
        return true; // Basic validation only
      },
      
      async reportProxy(proxy: ProxyConfig, success: boolean): Promise<void> {
        // Optional reporting
      }
    };
  }
  
  private async loadProxyConfig(): Promise<any> {
    try {
      // Try to load from file
      const fs = await import('fs/promises');
      const configPath = './config/proxies.json';
      const configData = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(configData);
    } catch (error) {
      // Fallback to default config
      return {
        providers: [{
          name: 'mobile-proxies.ru',
          type: 'mobile',
          apiUrl: 'https://api.mobile-proxies.ru/v1',
          regions: ['RU'],
          rotationInterval: 300000,
          concurrent: 200
        }],
        validation: {
          checkInterval: 60000,
          timeout: 5000,
          retries: 3
        }
      };
    }
  }
  
  private async refreshProxyPool(region?: string): Promise<void> {
    const providers = region
      ? Array.from(this.providers.values()).filter(p => p.regions.includes(region))
      : Array.from(this.providers.values());
    
    for (const provider of providers) {
      try {
        const proxies = await this.fetchProxiesFromProvider(provider, region);
        const poolKey = region || 'global';
        
        // Add to pool
        const existingProxies = this.proxyPool.get(poolKey) || [];
        this.proxyPool.set(poolKey, [...existingProxies, ...proxies]);
        
        this.logger.info(`Fetched ${proxies.length} proxies from ${provider.name}`);
      } catch (error) {
        this.logger.error(`Failed to fetch proxies from ${provider.name}:`, error);
      }
    }
  }
  
  private async fetchProxiesFromProvider(
    provider: ProxyProvider, 
    region?: string
  ): Promise<ProxyConfig[]> {
    const proxies: ProxyConfig[] = [];
    const count = Math.min(20, config.PROXY_CONCURRENT_LIMIT); // Fetch in batches
    
    for (let i = 0; i < count; i++) {
      try {
        const proxy = await this.rateLimiter.execute(() => 
          provider.getProxy(region)
        );
        proxies.push(proxy);
      } catch (error) {
        this.logger.error(`Failed to fetch proxy ${i + 1}:`, error);
      }
    }
    
    return proxies;
  }
  
  private selectProxy(proxies: ProxyConfig[]): ProxyConfig {
    // Sort by least recently used and best performance
    proxies.sort((a, b) => {
      // Prioritize unused proxies
      if (!a.lastUsed) return -1;
      if (!b.lastUsed) return 1;
      
      // Then by performance score
      const scoreA = this.calculateProxyScore(a);
      const scoreB = this.calculateProxyScore(b);
      
      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Higher score is better
      }
      
      // Finally by last used time
      return a.lastUsed.getTime() - b.lastUsed.getTime();
    });
    
    return proxies[0];
  }
  
  private calculateProxyScore(proxy: ProxyConfig): number {
    let score = 100;
    
    // Penalize by failure rate
    const failureRate = proxy.stats.requests > 0 
      ? proxy.stats.failures / proxy.stats.requests 
      : 0;
    score -= failureRate * 50;
    
    // Penalize by response time
    const avgResponseTime = proxy.stats.avgResponseTime;
    if (avgResponseTime > 5000) score -= 20;
    else if (avgResponseTime > 3000) score -= 10;
    
    // Penalize by captcha rate
    score -= proxy.stats.captchaRate * 30;
    
    return Math.max(0, score);
  }
  
  private removeProxy(proxy: ProxyConfig): void {
    for (const [region, proxies] of this.proxyPool) {
      const index = proxies.findIndex(p => p.id === proxy.id);
      if (index !== -1) {
        proxies.splice(index, 1);
        break;
      }
    }
  }
  
  private blacklistProxy(proxy: ProxyConfig): void {
    const identifier = proxy.ip || proxy.server;
    this.blacklist.add(identifier);
    proxy.status = 'blacklisted';
    
    this.logger.warn(`Proxy blacklisted: ${identifier}`);
    
    // Save to database
    if (this.db) {
      this.db.proxies.updateOne(
        { id: proxy.id },
        { $set: { status: 'blacklisted', blacklistedAt: new Date() } }
      ).catch(err => this.logger.error('Failed to update blacklisted proxy:', err));
    }
  }
  
  private async loadBlacklist(): Promise<void> {
    if (!this.db) return;
    
    try {
      const blacklistedProxies = await this.db.proxies.find({
        status: 'blacklisted'
      }).toArray();
      
      for (const proxy of blacklistedProxies) {
        const identifier = proxy.ip || proxy.server;
        this.blacklist.add(identifier);
      }
      
      this.logger.info(`Loaded ${this.blacklist.size} blacklisted proxies`);
    } catch (error) {
      this.logger.error('Failed to load blacklist:', error);
    }
  }
  
  private async performAdvancedValidation(proxy: ProxyConfig, ip: string): Promise<boolean> {
    try {
      // Check geolocation
      const geoResponse = await axios.get(`https://ipapi.co/${ip}/json/`);
      const geoData = geoResponse.data;
      
      if (proxy.region && geoData.country_code !== proxy.region) {
        this.logger.warn(`Proxy ${ip} geolocation mismatch: expected ${proxy.region}, got ${geoData.country_code}`);
        return false;
      }
      
      // Check if residential/mobile
      if (proxy.type === 'mobile' || proxy.type === 'residential') {
        if (geoData.org && geoData.org.toLowerCase().includes('datacenter')) {
          this.logger.warn(`Proxy ${ip} appears to be datacenter, not ${proxy.type}`);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      this.logger.error('Advanced validation failed:', error);
      return true; // Don't reject proxy on validation service failure
    }
  }
  
  private getProviderForProxy(proxy: ProxyConfig): ProxyProvider | undefined {
    return this.providers.get(proxy.provider);
  }
  
  private startRotation(strategy: string): void {
    const rotationInterval = config.PROXY_ROTATION_INTERVAL;
    
    this.rotationInterval = setInterval(async () => {
      try {
        // Refresh proxy pool
        await this.refreshProxyPool();
        
        // Clean up old proxies
        this.cleanupOldProxies();
        
        // Save proxy stats to database
        if (this.db) {
          await this.saveProxyStats();
        }
      } catch (error) {
        this.logger.error('Proxy rotation error:', error);
      }
    }, rotationInterval);
  }
  
  private cleanupOldProxies(): void {
    const maxAge = 3600000; // 1 hour
    const now = Date.now();
    
    for (const [region, proxies] of this.proxyPool) {
      const validProxies = proxies.filter(proxy => {
        const age = now - proxy.lastCheck.getTime();
        return age < maxAge && proxy.status === 'active';
      });
      
      this.proxyPool.set(region, validProxies);
    }
  }
  
  private async saveProxyStats(): Promise<void> {
    if (!this.db) return;
    
    const allProxies: ProxyConfig[] = [];
    for (const proxies of this.proxyPool.values()) {
      allProxies.push(...proxies);
    }
    
    for (const proxy of allProxies) {
      if (proxy.stats.requests > 0) {
        try {
          await this.db.proxies.updateOne(
            { id: proxy.id },
            {
              $set: {
                stats: proxy.stats,
                lastUsed: proxy.lastUsed,
                status: proxy.status
              }
            },
            { upsert: true }
          );
        } catch (error) {
          this.logger.error('Failed to save proxy stats:', error);
        }
      }
    }
  }
}