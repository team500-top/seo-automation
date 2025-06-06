import { Page } from 'playwright';
import axios from 'axios';
import { config } from '../config';
import { createLogger, Logger } from '../utils/logger';
import { CaptchaError, ServiceUnavailableError } from '../utils/errors';
import { retry, randomDelay } from '../utils/helpers';

interface CaptchaProvider {
  name: string;
  apiKey: string;
  priority: number;
  supportedTypes: string[];
  solve: (params: any) => Promise<string>;
  getBalance: () => Promise<number>;
}

interface CaptchaSolution {
  solution: string;
  cost: number;
  provider: string;
  duration: number;
}

export class CaptchaService {
  private logger: Logger;
  private providers: Map<string, CaptchaProvider> = new Map();
  private successRates: Map<string, Map<string, number>> = new Map();
  
  constructor() {
    this.logger = createLogger('CaptchaService');
  }
  
  async initialize(): Promise<void> {
    this.logger.info('Initializing CaptchaService...');
    
    // Initialize providers based on config
    if (config.ANTICAPTCHA_KEY) {
      this.addProvider(this.createAntiCaptchaProvider());
    }
    
    if (config.TWOCAPTCHA_KEY) {
      this.addProvider(this.create2CaptchaProvider());
    }
    
    if (config.CAPSOLVER_KEY) {
      this.addProvider(this.createCapSolverProvider());
    }
    
    // Check balances
    await this.checkAllBalances();
    
    this.logger.info(`CaptchaService initialized with ${this.providers.size} providers`);
  }
  
  async shutdown(): Promise<void> {
    // Save success rates to database
    await this.saveSuccessRates();
  }
  
  async solveRecaptcha(page: Page, siteKey?: string): Promise<CaptchaSolution> {
    const startTime = Date.now();
    
    // Get page URL and sitekey
    const pageUrl = page.url();
    const captchaSiteKey = siteKey || await this.findRecaptchaSiteKey(page);
    
    if (!captchaSiteKey) {
      throw new CaptchaError('ReCAPTCHA site key not found');
    }
    
    // Select best provider
    const provider = this.selectBestProvider('recaptcha');
    if (!provider) {
      throw new ServiceUnavailableError('No captcha providers available');
    }
    
    this.logger.info(`Solving ReCAPTCHA with ${provider.name}`, {
      pageUrl,
      siteKey: captchaSiteKey
    });
    
    try {
      // Solve captcha
      const solution = await provider.solve({
        type: 'recaptcha',
        pageUrl,
        siteKey: captchaSiteKey
      });
      
      // Inject solution
      await this.injectRecaptchaSolution(page, solution);
      
      const duration = Date.now() - startTime;
      const cost = this.estimateCost(provider.name, 'recaptcha');
      
      // Update success rate
      this.updateSuccessRate(provider.name, 'recaptcha', true);
      
      this.logger.info(`ReCAPTCHA solved in ${duration}ms`, {
        provider: provider.name,
        cost
      });
      
      return {
        solution,
        cost,
        provider: provider.name,
        duration
      };
      
    } catch (error) {
      this.updateSuccessRate(provider.name, 'recaptcha', false);
      
      // Try fallback provider
      const fallback = this.selectFallbackProvider('recaptcha', provider.name);
      if (fallback) {
        this.logger.warn(`Falling back to ${fallback.name}`);
        return this.solveRecaptcha(page, siteKey);
      }
      
      throw new CaptchaError(`Failed to solve ReCAPTCHA: ${error.message}`);
    }
  }
  
  async solveYandexCaptcha(page: Page): Promise<CaptchaSolution> {
    const startTime = Date.now();
    
    // Take screenshot of captcha
    const captchaElement = await page.$('.CheckboxCaptcha-Image');
    if (!captchaElement) {
      throw new CaptchaError('Yandex captcha image not found');
    }
    
    const screenshot = await captchaElement.screenshot();
    const imageBase64 = screenshot.toString('base64');
    
    // Select provider
    const provider = this.selectBestProvider('yandex');
    if (!provider) {
      throw new ServiceUnavailableError('No captcha providers available');
    }
    
    this.logger.info(`Solving Yandex captcha with ${provider.name}`);
    
    try {
      // Solve captcha
      const solution = await provider.solve({
        type: 'image',
        image: imageBase64
      });
      
      // Enter solution
      const input = await page.$('.CheckboxCaptcha-Input');
      if (input) {
        await input.type(solution);
        await page.keyboard.press('Enter');
      }
      
      // Wait for result
      await randomDelay(1000, 2000);
      
      const duration = Date.now() - startTime;
      const cost = this.estimateCost(provider.name, 'yandex');
      
      this.updateSuccessRate(provider.name, 'yandex', true);
      
      return {
        solution,
        cost,
        provider: provider.name,
        duration
      };
      
    } catch (error) {
      this.updateSuccessRate(provider.name, 'yandex', false);
      throw new CaptchaError(`Failed to solve Yandex captcha: ${error.message}`);
    }
  }
  
  async getBalance(providerName?: string): Promise<Record<string, number>> {
    const balances: Record<string, number> = {};
    
    if (providerName) {
      const provider = this.providers.get(providerName);
      if (provider) {
        balances[providerName] = await provider.getBalance();
      }
    } else {
      // Get all balances
      for (const [name, provider] of this.providers) {
        try {
          balances[name] = await provider.getBalance();
        } catch (error) {
          this.logger.error(`Failed to get balance for ${name}:`, error);
          balances[name] = -1;
        }
      }
    }
    
    return balances;
  }
  
  private addProvider(provider: CaptchaProvider): void {
    this.providers.set(provider.name, provider);
    this.successRates.set(provider.name, new Map());
  }
  
  private createAntiCaptchaProvider(): CaptchaProvider {
    return {
      name: 'anticaptcha',
      apiKey: config.ANTICAPTCHA_KEY,
      priority: 1,
      supportedTypes: ['recaptcha', 'recaptcha3', 'image'],
      
      async solve(params: any): Promise<string> {
        const client = axios.create({
          baseURL: 'https://api.anti-captcha.com',
          timeout: 180000
        });
        
        // Create task
        const createResponse = await client.post('/createTask', {
          clientKey: this.apiKey,
          task: params.type === 'recaptcha' ? {
            type: 'RecaptchaV2TaskProxyless',
            websiteURL: params.pageUrl,
            websiteKey: params.siteKey
          } : {
            type: 'ImageToTextTask',
            body: params.image
          }
        });
        
        const taskId = createResponse.data.taskId;
        
        // Poll for result
        let attempts = 0;
        while (attempts < 60) {
          await randomDelay(3000, 5000);
          
          const resultResponse = await client.post('/getTaskResult', {
            clientKey: this.apiKey,
            taskId
          });
          
          if (resultResponse.data.status === 'ready') {
            return params.type === 'recaptcha' 
              ? resultResponse.data.solution.gRecaptchaResponse
              : resultResponse.data.solution.text;
          }
          
          attempts++;
        }
        
        throw new Error('Timeout waiting for captcha solution');
      },
      
      async getBalance(): Promise<number> {
        const response = await axios.post('https://api.anti-captcha.com/getBalance', {
          clientKey: this.apiKey
        });
        return response.data.balance;
      }
    };
  }
  
  private create2CaptchaProvider(): CaptchaProvider {
    return {
      name: '2captcha',
      apiKey: config.TWOCAPTCHA_KEY,
      priority: 2,
      supportedTypes: ['recaptcha', 'recaptcha3', 'yandex', 'image'],
      
      async solve(params: any): Promise<string> {
        const client = axios.create({
          baseURL: 'https://2captcha.com',
          timeout: 180000
        });
        
        // Submit captcha
        const submitParams: any = {
          key: this.apiKey,
          json: 1
        };
        
        if (params.type === 'recaptcha') {
          submitParams.method = 'userrecaptcha';
          submitParams.googlekey = params.siteKey;
          submitParams.pageurl = params.pageUrl;
        } else {
          submitParams.method = 'base64';
          submitParams.body = params.image;
        }
        
        const submitResponse = await client.post('/in.php', null, { params: submitParams });
        const captchaId = submitResponse.data.request;
        
        // Poll for result
        await randomDelay(20000, 30000); // Initial wait
        
        let attempts = 0;
        while (attempts < 30) {
          const resultResponse = await client.get('/res.php', {
            params: {
              key: this.apiKey,
              action: 'get',
              id: captchaId,
              json: 1
            }
          });
          
          if (resultResponse.data.status === 1) {
            return resultResponse.data.request;
          }
          
          await randomDelay(5000, 7000);
          attempts++;
        }
        
        throw new Error('Timeout waiting for captcha solution');
      },
      
      async getBalance(): Promise<number> {
        const response = await axios.get('https://2captcha.com/res.php', {
          params: {
            key: this.apiKey,
            action: 'getbalance',
            json: 1
          }
        });
        return parseFloat(response.data.request);
      }
    };
  }
  
  private createCapSolverProvider(): CaptchaProvider {
    return {
      name: 'capsolver',
      apiKey: config.CAPSOLVER_KEY,
      priority: 3,
      supportedTypes: ['recaptcha', 'recaptcha3', 'funcaptcha'],
      
      async solve(params: any): Promise<string> {
        const client = axios.create({
          baseURL: 'https://api.capsolver.com',
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 180000
        });
        
        // Create task
        const createResponse = await client.post('/createTask', {
          clientKey: this.apiKey,
          task: params.type === 'recaptcha' ? {
            type: 'ReCaptchaV2TaskProxyLess',
            websiteURL: params.pageUrl,
            websiteKey: params.siteKey
          } : {
            type: 'ImageToTextTask',
            body: params.image
          }
        });
        
        const taskId = createResponse.data.taskId;
        
        // Wait and get result
        await randomDelay(5000, 10000);
        
        let attempts = 0;
        while (attempts < 40) {
          const resultResponse = await client.post('/getTaskResult', {
            clientKey: this.apiKey,
            taskId
          });
          
          if (resultResponse.data.status === 'ready') {
            return resultResponse.data.solution.gRecaptchaResponse;
          }
          
          await randomDelay(3000, 5000);
          attempts++;
        }
        
        throw new Error('Timeout waiting for captcha solution');
      },
      
      async getBalance(): Promise<number> {
        const response = await axios.post('https://api.capsolver.com/getBalance', {
          clientKey: this.apiKey
        });
        return response.data.balance;
      }
    };
  }
  
  private selectBestProvider(captchaType: string): CaptchaProvider | null {
    const availableProviders = Array.from(this.providers.values())
      .filter(p => p.supportedTypes.includes(captchaType))
      .sort((a, b) => {
        // Sort by success rate and priority
        const rateA = this.getSuccessRate(a.name, captchaType);
        const rateB = this.getSuccessRate(b.name, captchaType);
        
        if (Math.abs(rateA - rateB) > 0.1) {
          return rateB - rateA;
        }
        
        return a.priority - b.priority;
      });
    
    return availableProviders[0] || null;
  }
  
  private selectFallbackProvider(captchaType: string, excludeName: string): CaptchaProvider | null {
    const providers = Array.from(this.providers.values())
      .filter(p => p.name !== excludeName && p.supportedTypes.includes(captchaType));
    
    return providers[0] || null;
  }
  
  private async findRecaptchaSiteKey(page: Page): Promise<string | null> {
    // Try multiple methods to find sitekey
    
    // Method 1: Check iframe src
    const iframe = await page.$('iframe[src*="recaptcha"]');
    if (iframe) {
      const src = await iframe.getAttribute('src');
      const match = src?.match(/k=([^&]+)/);
      if (match) return match[1];
    }
    
    // Method 2: Check div attributes
    const div = await page.$('.g-recaptcha');
    if (div) {
      const sitekey = await div.getAttribute('data-sitekey');
      if (sitekey) return sitekey;
    }
    
    // Method 3: Search in page content
    const content = await page.content();
    const match = content.match(/grecaptcha\.render.*?sitekey["':]\s*["']([^"']+)/);
    if (match) return match[1];
    
    return null;
  }
  
  private async injectRecaptchaSolution(page: Page, token: string): Promise<void> {
    await page.evaluate((token) => {
      // Method 1: Direct callback
      if (window.___grecaptcha_cfg?.clients) {
        Object.values(window.___grecaptcha_cfg.clients).forEach((client: any) => {
          if (client.callback) {
            client.callback(token);
          }
        });
      }
      
      // Method 2: Find and fill textarea
      const textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
      if (textarea) {
        textarea.value = token;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      // Method 3: Submit form
      const form = document.querySelector('form');
      if (form) {
        form.submit();
      }
    }, token);
  }
  
  private getSuccessRate(providerName: string, captchaType: string): number {
    const providerRates = this.successRates.get(providerName);
    if (!providerRates) return 0.5; // Default 50%
    
    const stats = providerRates.get(captchaType);
    if (!stats) return 0.5;
    
    return stats;
  }
  
  private updateSuccessRate(providerName: string, captchaType: string, success: boolean): void {
    const providerRates = this.successRates.get(providerName)!;
    const currentRate = providerRates.get(captchaType) || 0.5;
    
    // Exponential moving average
    const alpha = 0.1;
    const newRate = currentRate * (1 - alpha) + (success ? 1 : 0) * alpha;
    
    providerRates.set(captchaType, newRate);
  }
  
  private estimateCost(providerName: string, captchaType: string): number {
    // Cost per 1000 captchas in USD
    const costs = {
      anticaptcha: {
        recaptcha: 2.0,
        image: 0.7,
        yandex: 0.7
      },
      '2captcha': {
        recaptcha: 2.99,
        image: 1.0,
        yandex: 1.0
      },
      capsolver: {
        recaptcha: 1.5,
        image: 0.8
      }
    };
    
    return (costs[providerName]?.[captchaType] || 1.0) / 1000;
  }
  
  private async checkAllBalances(): Promise<void> {
    const balances = await this.getBalance();
    
    for (const [provider, balance] of Object.entries(balances)) {
      if (balance < 5) {
        this.logger.warn(`Low balance warning for ${provider}: $${balance}`);
        
        // Send alert
        if (balance < 2) {
          this.logger.error(`Critical balance for ${provider}: $${balance}`);
        }
      }
    }
  }
  
  private async saveSuccessRates(): Promise<void> {
    // Save to database/cache for persistence
    const rates: any = {};
    
    for (const [provider, providerRates] of this.successRates) {
      rates[provider] = Object.fromEntries(providerRates);
    }
    
    this.logger.debug('Saving captcha success rates', rates);
  }
}