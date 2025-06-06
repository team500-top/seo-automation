import { Browser, Page } from 'playwright';
import { BehaviorEngine } from './BehaviorEngine';
import { CaptchaService } from '../services/CaptchaService';
import { Logger } from '../utils/logger';
import { CONSTANTS } from '../config/constants';
import { SearchResult } from '../types';
import { randomDelay } from '../utils/helpers';

interface SearchOptions {
  engine: 'yandex' | 'google';
  query: string;
  targetDomain?: string;
  targetUrl?: string;
  maxPages: number;
  region?: string;
  language?: string;
}

interface SearchEngineOptions {
  captchaService?: CaptchaService;
  logger: Logger;
}

export class SearchEngine {
  private page?: Page;
  
  constructor(
    private browser: Browser,
    private behaviorEngine: BehaviorEngine,
    private options: SearchEngineOptions
  ) {}
  
  async performSearch(searchOptions: SearchOptions): Promise<any> {
    this.options.logger.info('Starting search', { 
      engine: searchOptions.engine,
      query: searchOptions.query 
    });
    
    try {
      // Create new page
      this.page = await this.browser.newPage();
      
      // Navigate to search engine
      const engineConfig = CONSTANTS.SEARCH_ENGINES[searchOptions.engine.toUpperCase()];
      await this.page.goto(engineConfig.baseUrl);
      await this.behaviorEngine.waitForPageLoad(this.page);
      
      // Handle initial captcha if present
      await this.checkAndSolveCaptcha();
      
      // Perform search
      await this.enterSearchQuery(searchOptions.query, engineConfig);
      
      // Find target in results
      const result = await this.findTargetInResults(
        searchOptions.targetDomain || searchOptions.targetUrl!,
        searchOptions.maxPages,
        engineConfig
      );
      
      // Perform actions on target site if found
      if (result.found && result.targetElement) {
        await this.clickAndExploreTarget(result.targetElement);
        result.clicked = true;
      }
      
      return result;
      
    } finally {
      if (this.page) {
        await this.page.close();
      }
    }
  }
  
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
    }
  }
  
  private async enterSearchQuery(query: string, engineConfig: any): Promise<void> {
    // Find search input
    const searchSelector = `input[name="${engineConfig.searchParam}"]`;
    await this.page!.waitForSelector(searchSelector, {
      timeout: CONSTANTS.DEFAULT_TIMEOUT
    });
    
    // Type query naturally
    await this.behaviorEngine.humanType(this.page!, searchSelector, query);
    
    // Wait before submitting
    await randomDelay(500, 1500);
    
    // Submit search
    await this.page!.keyboard.press('Enter');
    await this.behaviorEngine.waitForPageLoad(this.page!);
    
    // Wait for results
    await this.page!.waitForSelector(engineConfig.resultsSelector, {
      timeout: CONSTANTS.DEFAULT_TIMEOUT
    });
  }
  
  private async findTargetInResults(
    target: string,
    maxPages: number,
    engineConfig: any
  ): Promise<any> {
    let currentPage = 1;
    let found = false;
    let position = 0;
    let targetElement = null;
    let captchaEncountered = false;
    let captchaSolved = false;
    
    while (currentPage <= maxPages && !found) {
      this.options.logger.debug(`Scanning page ${currentPage}`);
      
      // Check for captcha
      const captchaResult = await this.checkAndSolveCaptcha();
      if (captchaResult.encountered) {
        captchaEncountered = true;
        captchaSolved = captchaResult.solved;
      }
      
      // Scan search results
      await this.behaviorEngine.scanSearchResults(this.page!);
      
      // Get all result links
      const results = await this.getSearchResults(engineConfig);
      
      // Check each result
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        position = (currentPage - 1) * 10 + i + 1;
        
        if (this.isTargetMatch(result.url, target)) {
          found = true;
          targetElement = result.element;
          this.options.logger.info(`Target found at position ${position}`);
          break;
        }
        
        // Read snippet for some results
        if (Math.random() < 0.3) {
          await this.behaviorEngine.readSearchSnippet(this.page!, result.element);
        }
      }
      
      // Go to next page if target not found
      if (!found && currentPage < maxPages) {
        const hasNextPage = await this.goToNextPage(engineConfig);
        if (!hasNextPage) {
          break;
        }
        currentPage++;
        
        // Wait between pages
        await randomDelay(2000, 4000);
      } else {
        break;
      }
    }
    
    return {
      found,
      position: found ? position : null,
      pagesScanned: currentPage,
      targetElement,
      captchaEncountered,
      captchaSolved,
      actions: []
    };
  }
  
  private async getSearchResults(engineConfig: any): Promise<Array<{
    url: string;
    title: string;
    element: any;
  }>> {
    const results = await this.page!.$$eval(
      engineConfig.resultsSelector,
      (elements, selector) => {
        return elements.map(el => {
          // Find the link within the result
          const link = el.querySelector('a') || el;
          return {
            url: link.getAttribute('href') || '',
            title: el.textContent || '',
            elementIndex: Array.from(document.querySelectorAll(selector)).indexOf(el)
          };
        });
      },
      engineConfig.resultsSelector
    );
    
    // Re-attach elements
    const resultsWithElements = [];
    for (const result of results) {
      const elements = await this.page!.$$(engineConfig.resultsSelector);
      if (elements[result.elementIndex]) {
        resultsWithElements.push({
          ...result,
          element: elements[result.elementIndex]
        });
      }
    }
    
    return resultsWithElements;
  }
  
  private isTargetMatch(url: string, target: string): boolean {
    if (!url) return false;
    
    // Normalize URLs
    const normalizedUrl = url.toLowerCase();
    const normalizedTarget = target.toLowerCase();
    
    // Check if target is a domain
    if (!normalizedTarget.includes('/')) {
      // Domain match
      return normalizedUrl.includes(normalizedTarget);
    } else {
      // Full URL match
      return normalizedUrl.includes(normalizedTarget);
    }
  }
  
  private async goToNextPage(engineConfig: any): Promise<boolean> {
    try {
      const nextButton = await this.page!.$(engineConfig.nextPageSelector);
      if (!nextButton) {
        return false;
      }
      
      // Check if next button is disabled
      const isDisabled = await nextButton.evaluate(el => 
        el.hasAttribute('disabled') || el.classList.contains('disabled')
      );
      
      if (isDisabled) {
        return false;
      }
      
      // Click next page
      await this.behaviorEngine.humanClick(this.page!, engineConfig.nextPageSelector);
      await this.behaviorEngine.waitForPageLoad(this.page!);
      
      // Wait for new results
      await this.page!.waitForSelector(engineConfig.resultsSelector, {
        timeout: CONSTANTS.DEFAULT_TIMEOUT
      });
      
      return true;
    } catch (error) {
      this.options.logger.debug('No next page available');
      return false;
    }
  }
  
  private async clickAndExploreTarget(targetElement: any): Promise<void> {
    // Scroll to target
    await targetElement.scrollIntoViewIfNeeded();
    await randomDelay(500, 1000);
    
    // Get link URL before clicking
    const targetUrl = await targetElement.evaluate((el: any) => {
      const link = el.querySelector('a') || el;
      return link.href;
    });
    
    // Click on target
    await this.behaviorEngine.humanClick(this.page!, targetElement);
    
    // Wait for navigation
    try {
      await this.page!.waitForNavigation({
        timeout: CONSTANTS.DEFAULT_NAVIGATION_TIMEOUT
      });
    } catch (error) {
      // Sometimes navigation doesn't trigger a proper event
      this.options.logger.debug('Navigation timeout, continuing anyway');
    }
    
    // Verify we're on the target site
    const currentUrl = this.page!.url();
    if (!currentUrl.includes(new URL(targetUrl).hostname)) {
      this.options.logger.warn('Navigation to target failed');
      return;
    }
    
    // Explore the target site
    const exploreTime = this.behaviorEngine.randomBetween(60000, 180000); // 1-3 minutes
    await this.behaviorEngine.browseNaturally(this.page!, exploreTime);
  }
  
  private async checkAndSolveCaptcha(): Promise<{
    encountered: boolean;
    solved: boolean;
  }> {
    if (!this.options.captchaService) {
      return { encountered: false, solved: false };
    }
    
    // Check for Yandex captcha
    const yandexCaptcha = await this.page!.$('.CheckboxCaptcha');
    if (yandexCaptcha) {
      this.options.logger.info('Yandex captcha detected');
      try {
        const solved = await this.options.captchaService.solveYandexCaptcha(this.page!);
        return { encountered: true, solved };
      } catch (error) {
        this.options.logger.error('Failed to solve Yandex captcha', error);
        return { encountered: true, solved: false };
      }
    }
    
    // Check for Google reCAPTCHA
    const recaptcha = await this.page!.$('.g-recaptcha, iframe[src*="recaptcha"]');
    if (recaptcha) {
      this.options.logger.info('Google reCAPTCHA detected');
      try {
        const solved = await this.options.captchaService.solveRecaptcha(this.page!);
        return { encountered: true, solved };
      } catch (error) {
        this.options.logger.error('Failed to solve reCAPTCHA', error);
        return { encountered: true, solved: false };
      }
    }
    
    return { encountered: false, solved: false };
  }
}