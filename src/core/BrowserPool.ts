import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { chromium as playwrightExtra } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { ProxyService } from '../services/ProxyService';
import { BehaviorEngine } from './BehaviorEngine';
import { SearchEngine } from './SearchEngine';
import { createLogger, Logger } from '../utils/logger';
import { BrowserInstance, Profile, ProxyConfig } from '../types';
import { config } from '../config';
import { CONSTANTS } from '../config/constants';
import { BrowserError } from '../utils/errors';

// Add stealth plugin
playwrightExtra.use(StealthPlugin());

interface BrowserPoolOptions {
  maxBrowsers: number;
  headless: boolean;
  proxyService?: ProxyService;
}

interface BrowserWrapper {
  id: string;
  browser: Browser;
  context: BrowserContext;
  profile?: Profile;
  proxy?: ProxyConfig;
  createdAt: Date;
  lastUsed: Date;
  tasksCompleted: number;
  inUse: boolean;
}

export class BrowserPool extends EventEmitter {
  private logger: Logger;
  private browsers: Map<string, BrowserWrapper> = new Map();
  private availableBrowsers: string[] = [];
  private browserQueue: Array<(browser: BrowserWrapper) => void> = [];
  private isShuttingDown = false;
  private maintenanceInterval?: NodeJS.Timer;
  
  constructor(private options: BrowserPoolOptions) {
    super();
    this.logger = createLogger('BrowserPool');
  }
  
  async initialize(): Promise<void> {
    this.logger.info('Initializing BrowserPool...');
    
    // Create initial browsers
    const initialCount = Math.min(this.options.maxBrowsers, 5);
    for (let i = 0; i < initialCount; i++) {
      await this.createBrowser();
    }
    
    // Start maintenance
    this.startMaintenance();
    
    this.logger.info(`BrowserPool initialized with ${this.browsers.size} browsers`);
  }
  
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down BrowserPool...');
    this.isShuttingDown = true;
    
    // Stop maintenance
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
    }
    
    // Close all browsers
    const closePromises = Array.from(this.browsers.values()).map(wrapper => 
      this.closeBrowser(wrapper.id)
    );
    
    await Promise.all(closePromises);
    
    this.logger.info('BrowserPool shut down');
  }
  
  async acquireBrowser(profile: Profile): Promise<Browser> {
    if (this.isShuttingDown) {
      throw new BrowserError('BrowserPool is shutting down');
    }
    
    // Try to get an available browser
    let wrapper = await this.getAvailableBrowser();
    
    if (!wrapper) {
      // Create new browser if under limit
      if (this.browsers.size < this.options.maxBrowsers) {
        wrapper = await this.createBrowser(profile);
      } else {
        // Wait for a browser to become available
        wrapper = await this.waitForBrowser();
      }
    }
    
    // Configure browser for profile
    await this.configureBrowserForProfile(wrapper, profile);
    
    wrapper.inUse = true;
    wrapper.lastUsed = new Date();
    wrapper.profile = profile;
    
    this.logger.debug(`Browser acquired: ${wrapper.id} for profile: ${profile.id}`);
    
    return wrapper.browser;
  }
  
  async releaseBrowser(browser: Browser): Promise<void> {
    const wrapper = this.findWrapperByBrowser(browser);
    if (!wrapper) {
      this.logger.warn('Attempted to release unknown browser');
      return;
    }
    
    wrapper.inUse = false;
    wrapper.tasksCompleted++;
    wrapper.profile = undefined;
    
    // Clear cookies and state
    await this.clearBrowserState(wrapper);
    
    // Check if browser should be recycled
    if (wrapper.tasksCompleted >= 50 || this.shouldRecycleBrowser(wrapper)) {
      await this.recycleBrowser(wrapper.id);
    } else {
      this.availableBrowsers.push(wrapper.id);
      
      // Notify waiting requests
      if (this.browserQueue.length > 0) {
        const callback = this.browserQueue.shift()!;
        callback(wrapper);
      }
    }
    
    this.logger.debug(`Browser released: ${wrapper.id}`);
  }
  
  async getSearchEngine(profile: Profile): Promise<SearchEngine> {
    const browser = await this.acquireBrowser(profile);
    const behaviorEngine = new BehaviorEngine(profile);
    
    return new SearchEngine(browser, behaviorEngine, {
      captchaService: this.options.proxyService?.captchaService,
      logger: createLogger(`SearchEngine:${profile.id}`)
    });
  }
  
  async getBehaviorEngine(profile: Profile): Promise<BehaviorEngine> {
    return new BehaviorEngine(profile);
  }
  
  getStats(): any {
    const wrappers = Array.from(this.browsers.values());
    
    return {
      total: this.browsers.size,
      available: this.availableBrowsers.length,
      inUse: wrappers.filter(w => w.inUse).length,
      tasksCompleted: wrappers.reduce((sum, w) => sum + w.tasksCompleted, 0),
      avgTasksPerBrowser: wrappers.length > 0 
        ? wrappers.reduce((sum, w) => sum + w.tasksCompleted, 0) / wrappers.length
        : 0,
      oldestBrowser: wrappers.length > 0
        ? Math.max(...wrappers.map(w => Date.now() - w.createdAt.getTime()))
        : 0
    };
  }
  
  private async createBrowser(profile?: Profile): Promise<BrowserWrapper> {
    const id = uuidv4();
    this.logger.debug(`Creating browser: ${id}`);
    
    try {
      // Get proxy if available
      const proxy = profile && this.options.proxyService
        ? await this.options.proxyService.getProxy(profile.identity.location.region)
        : undefined;
      
      // Browser launch options
      const launchOptions: any = {
        headless: this.options.headless,
        args: [
          ...config.BROWSER_ARGS,
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          `--window-size=${CONSTANTS.DEFAULT_VIEWPORT.width},${CONSTANTS.DEFAULT_VIEWPORT.height}`
        ]
      };
      
      if (proxy) {
        launchOptions.proxy = {
          server: `${proxy.protocol}://${proxy.server}:${proxy.port}`,
          username: proxy.username,
          password: proxy.password
        };
      }
      
      // Launch browser with stealth
      const browser = await playwrightExtra.launch(launchOptions);
      
      // Create context with fingerprint
      const context = await this.createContext(browser, profile);
      
      const wrapper: BrowserWrapper = {
        id,
        browser,
        context,
        proxy,
        createdAt: new Date(),
        lastUsed: new Date(),
        tasksCompleted: 0,
        inUse: false
      };
      
      this.browsers.set(id, wrapper);
      this.availableBrowsers.push(id);
      
      this.logger.debug(`Browser created: ${id}`);
      this.emit('browser:created', { id });
      
      return wrapper;
      
    } catch (error) {
      this.logger.error(`Failed to create browser: ${error.message}`);
      throw new BrowserError(`Failed to create browser: ${error.message}`);
    }
  }
  
  private async createContext(browser: Browser, profile?: Profile): Promise<BrowserContext> {
    const contextOptions: any = {
      viewport: profile?.fingerprint.window || CONSTANTS.DEFAULT_VIEWPORT,
      userAgent: profile?.fingerprint.userAgent,
      locale: profile?.identity.location.languages?.[0] || 'en-US',
      timezoneId: profile?.identity.location.timezone || 'UTC',
      permissions: ['geolocation', 'notifications'],
      colorScheme: 'light',
      deviceScaleFactor: profile?.fingerprint.screen.devicePixelRatio || 1
    };
    
    if (profile?.identity.location.coordinates) {
      contextOptions.geolocation = {
        latitude: profile.identity.location.coordinates.latitude,
        longitude: profile.identity.location.coordinates.longitude
      };
    }
    
    const context = await browser.newContext(contextOptions);
    
    // Apply stealth scripts
    await this.applyStealthScripts(context, profile);
    
    return context;
  }
  
  private async applyStealthScripts(context: BrowserContext, profile?: Profile): Promise<void> {
    // Hide webdriver
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false
      });
    });
    
    // Apply fingerprint overrides
    if (profile?.fingerprint) {
      await context.addInitScript((fingerprint) => {
        // Override screen properties
        Object.defineProperty(screen, 'width', { get: () => fingerprint.screen.width });
        Object.defineProperty(screen, 'height', { get: () => fingerprint.screen.height });
        Object.defineProperty(screen, 'availWidth', { get: () => fingerprint.screen.availWidth });
        Object.defineProperty(screen, 'availHeight', { get: () => fingerprint.screen.availHeight });
        
        // Override hardware concurrency
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: () => fingerprint.hardware.hardwareConcurrency
        });
        
        // Override languages
        Object.defineProperty(navigator, 'languages', {
          get: () => fingerprint.features.languages
        });
        
        // WebGL vendor and renderer
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) return fingerprint.webGL.vendor;
          if (parameter === 37446) return fingerprint.webGL.renderer;
          return getParameter.call(this, parameter);
        };
        
        // Canvas noise
        const toDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function() {
          const context = this.getContext('2d');
          if (context) {
            const imageData = context.getImageData(0, 0, this.width, this.height);
            for (let i = 0; i < imageData.data.length; i += 4) {
              imageData.data[i] += Math.random() * 0.1;
            }
            context.putImageData(imageData, 0, 0);
          }
          return toDataURL.apply(this, arguments);
        };
      }, profile.fingerprint);
    }
    
    // Chrome runtime
    await context.addInitScript(() => {
      window.chrome = {
        runtime: {
          connect: () => {},
          sendMessage: () => {},
          onMessage: { addListener: () => {} }
        }
      };
    });
    
    // Remove Playwright signatures
    await context.addInitScript(() => {
      delete window.__playwright;
      delete window.__pw_manual;
      delete window.playwright;
    });
  }
  
  private async configureBrowserForProfile(wrapper: BrowserWrapper, profile: Profile): Promise<void> {
    // Load cookies if available
    if (profile.cookies && profile.cookies.length > 0) {
      await wrapper.context.addCookies(profile.cookies);
    }
    
    // Set viewport
    const pages = wrapper.context.pages();
    for (const page of pages) {
      await page.setViewportSize(profile.fingerprint.window);
    }
  }
  
  private async clearBrowserState(wrapper: BrowserWrapper): Promise<void> {
    try {
      // Clear cookies
      await wrapper.context.clearCookies();
      
      // Clear permissions
      await wrapper.context.clearPermissions();
      
      // Close all pages except one
      const pages = wrapper.context.pages();
      for (let i = 1; i < pages.length; i++) {
        await pages[i].close();
      }
      
      // Navigate remaining page to blank
      if (pages.length > 0) {
        await pages[0].goto('about:blank');
      }
    } catch (error) {
      this.logger.error(`Failed to clear browser state: ${error.message}`);
    }
  }
  
  private async closeBrowser(id: string): Promise<void> {
    const wrapper = this.browsers.get(id);
    if (!wrapper) return;
    
    try {
      await wrapper.context.close();
      await wrapper.browser.close();
    } catch (error) {
      this.logger.error(`Error closing browser ${id}: ${error.message}`);
    }
    
    this.browsers.delete(id);
    this.availableBrowsers = this.availableBrowsers.filter(bid => bid !== id);
    
    this.logger.debug(`Browser closed: ${id}`);
    this.emit('browser:closed', { id });
  }
  
  private async recycleBrowser(id: string): Promise<void> {
    this.logger.debug(`Recycling browser: ${id}`);
    
    await this.closeBrowser(id);
    
    // Create replacement if not shutting down
    if (!this.isShuttingDown && this.browsers.size < this.options.maxBrowsers) {
      await this.createBrowser();
    }
  }
  
  private async getAvailableBrowser(): Promise<BrowserWrapper | null> {
    if (this.availableBrowsers.length === 0) {
      return null;
    }
    
    const id = this.availableBrowsers.shift()!;
    return this.browsers.get(id) || null;
  }
  
  private async waitForBrowser(): Promise<BrowserWrapper> {
    return new Promise((resolve) => {
      this.browserQueue.push(resolve);
    });
  }
  
  private findWrapperByBrowser(browser: Browser): BrowserWrapper | undefined {
    return Array.from(this.browsers.values()).find(w => w.browser === browser);
  }
  
  private shouldRecycleBrowser(wrapper: BrowserWrapper): boolean {
    // Recycle if browser is too old
    const age = Date.now() - wrapper.createdAt.getTime();
    if (age > 3600000) return true; // 1 hour
    
    // Recycle if too many tasks completed
    if (wrapper.tasksCompleted >= 50) return true;
    
    // Recycle if memory usage is high (would need to implement memory tracking)
    
    return false;
  }
  
  private startMaintenance(): void {
    this.maintenanceInterval = setInterval(async () => {
      try {
        // Check browser health
        for (const [id, wrapper] of this.browsers) {
          if (!wrapper.inUse) {
            try {
              // Simple health check - try to create a new page
              const page = await wrapper.context.newPage();
              await page.goto('about:blank');
              await page.close();
            } catch (error) {
              this.logger.warn(`Browser ${id} health check failed, recycling`);
              await this.recycleBrowser(id);
            }
          }
        }
        
        // Ensure minimum browsers available
        const availableCount = this.availableBrowsers.length;
        const minAvailable = Math.min(3, this.options.maxBrowsers);
        
        if (availableCount < minAvailable && this.browsers.size < this.options.maxBrowsers) {
          const toCreate = minAvailable - availableCount;
          for (let i = 0; i < toCreate; i++) {
            await this.createBrowser();
          }
        }
        
        // Log pool statistics
        const stats = this.getStats();
        this.logger.debug('Browser pool stats:', stats);
        
        // Emit metrics
        this.emit('stats:updated', stats);
        
      } catch (error) {
        this.logger.error('Maintenance error:', error);
      }
    }, 30000); // Every 30 seconds
  }
}