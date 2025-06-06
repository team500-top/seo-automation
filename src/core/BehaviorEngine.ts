import { Page } from 'playwright';
import { Profile, BehaviorPattern, TargetAction } from '../types';
import { createLogger, Logger } from '../utils/logger';
import { 
  randomDelay, 
  humanLikeDelay, 
  gaussianRandom,
  generateMousePath 
} from '../utils/helpers';
import { CONSTANTS } from '../config/constants';

export class BehaviorEngine {
  private logger: Logger;
  private pattern: BehaviorPattern;
  private lastActionTime: number = Date.now();
  
  constructor(private profile: Profile) {
    this.logger = createLogger(`BehaviorEngine:${profile.id}`);
    this.pattern = profile.behavior;
  }
  
  // === Mouse Movement ===
  
  async humanMouseMove(page: Page, x: number, y: number): Promise<void> {
    const currentPosition = await page.evaluate(() => ({
      x: window.mouseX || 0,
      y: window.mouseY || 0
    }));
    
    // Generate natural mouse path
    const path = generateMousePath(currentPosition, { x, y });
    
    // Move along path with variable speed
    for (let i = 0; i < path.length; i++) {
      const point = path[i];
      const speed = gaussianRandom(
        this.pattern.interaction.mouseSpeed.min,
        this.pattern.interaction.mouseSpeed.max
      );
      
      await page.mouse.move(point.x, point.y);
      
      // Small delay between movements
      if (i < path.length - 1) {
        await randomDelay(5 / speed, 15 / speed);
      }
    }
    
    // Update tracked position
    await page.evaluate((pos) => {
      window.mouseX = pos.x;
      window.mouseY = pos.y;
    }, { x, y });
  }
  
  async moveToElement(page: Page, selector: string): Promise<void> {
    const element = await page.$(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    
    const box = await element.boundingBox();
    if (!box) {
      throw new Error(`Cannot get bounding box for: ${selector}`);
    }
    
    // Add some randomness to click position
    const x = box.x + box.width * (0.3 + Math.random() * 0.4);
    const y = box.y + box.height * (0.3 + Math.random() * 0.4);
    
    await this.humanMouseMove(page, x, y);
  }
  
  async humanClick(page: Page, selector: string): Promise<void> {
    await this.moveToElement(page, selector);
    
    // Hover briefly before clicking
    const hoverTime = this.randomBetween(
      this.pattern.interaction.hoverTime.min,
      this.pattern.interaction.hoverTime.max
    );
    await randomDelay(hoverTime, hoverTime * 1.2);
    
    // Click with accuracy variance
    if (Math.random() > this.pattern.interaction.clickAccuracy) {
      // Miss-click and correct
      const offset = this.randomBetween(-20, 20);
      await page.mouse.move(
        (await page.mouse.position()).x + offset,
        (await page.mouse.position()).y + offset
      );
      await randomDelay(200, 400);
      await this.moveToElement(page, selector);
    }
    
    await page.click(selector);
    this.updateLastActionTime();
  }
  
  // === Typing ===
  
  async humanType(page: Page, selector: string, text: string): Promise<void> {
    await this.humanClick(page, selector);
    await randomDelay(200, 500);
    
    // Clear existing text naturally
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await randomDelay(100, 200);
    
    // Type with human-like speed and errors
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // Occasional typos
      if (Math.random() < this.pattern.interaction.typingSpeed.errors) {
        const wrongChar = this.getRandomChar();
        await page.keyboard.type(wrongChar);
        await randomDelay(100, 300);
        await page.keyboard.press('Backspace');
        await randomDelay(50, 150);
      }
      
      // Type the correct character
      await page.keyboard.type(char);
      
      // Variable typing speed
      const baseDelay = 60000 / this.pattern.interaction.typingSpeed.max;
      const delay = gaussianRandom(baseDelay * 0.8, baseDelay * 1.5);
      await randomDelay(delay, delay * 1.2);
      
      // Occasional pauses (thinking)
      if (Math.random() < 0.05) {
        await randomDelay(500, 2000);
      }
    }
    
    this.updateLastActionTime();
  }
  
  // === Scrolling ===
  
  async humanScroll(page: Page, direction: 'down' | 'up', distance?: number): Promise<void> {
    const actualDistance = distance || this.randomBetween(100, 500);
    const steps = Math.ceil(actualDistance / 100);
    
    for (let i = 0; i < steps; i++) {
      const stepDistance = Math.min(100, actualDistance - (i * 100));
      const speed = this.randomBetween(
        this.pattern.interaction.scrollSpeed.min,
        this.pattern.interaction.scrollSpeed.max
      );
      
      await page.evaluate((dir, dist) => {
        window.scrollBy({
          top: dir === 'down' ? dist : -dist,
          behavior: 'smooth'
        });
      }, direction, stepDistance);
      
      // Wait based on scroll speed
      const waitTime = (stepDistance / speed) * 1000;
      await randomDelay(waitTime, waitTime * 1.5);
      
      // Reading pauses
      if (Math.random() < 0.3) {
        const readTime = this.calculateReadingTime(stepDistance);
        await randomDelay(readTime * 0.8, readTime * 1.2);
      }
    }
    
    this.updateLastActionTime();
  }
  
  async scrollToElement(page: Page, selector: string): Promise<void> {
    const element = await page.$(selector);
    if (!element) return;
    
    await element.scrollIntoViewIfNeeded();
    await randomDelay(300, 800);
  }
  
  // === Page Navigation ===
  
  async browseNaturally(page: Page, duration: number): Promise<void> {
    const startTime = Date.now();
    const actions = ['scroll', 'hover', 'read', 'click'];
    
    while (Date.now() - startTime < duration) {
      const action = this.weightedChoice(actions, [0.4, 0.2, 0.3, 0.1]);
      
      switch (action) {
        case 'scroll':
          await this.performRandomScroll(page);
          break;
          
        case 'hover':
          await this.performRandomHover(page);
          break;
          
        case 'read':
          await this.simulateReading(page);
          break;
          
        case 'click':
          await this.performRandomClick(page);
          break;
      }
      
      // Natural pause between actions
      const pauseTime = this.randomBetween(1000, 5000);
      await randomDelay(pauseTime, pauseTime * 1.2);
    }
  }
  
  async performAction(page: Page, action: TargetAction): Promise<void> {
    switch (action.type) {
      case 'click':
        if (action.selector) {
          await this.humanClick(page, action.selector);
        }
        break;
        
      case 'scroll':
        const direction = action.value?.direction || 'down';
        const distance = action.value?.distance || undefined;
        await this.humanScroll(page, direction, distance);
        break;
        
      case 'hover':
        if (action.selector) {
          await this.moveToElement(page, action.selector);
          await randomDelay(500, 2000);
        }
        break;
        
      case 'input':
        if (action.selector && action.value?.text) {
          await this.humanType(page, action.selector, action.value.text);
        }
        break;
        
      case 'wait':
        const waitTime = action.value?.duration || 1000;
        await randomDelay(waitTime, waitTime * 1.2);
        break;
        
      case 'navigate':
        if (action.value?.url) {
          await page.goto(action.value.url);
          await this.waitForPageLoad(page);
        }
        break;
    }
  }
  
  // === Search-specific behaviors ===
  
  async scanSearchResults(page: Page): Promise<void> {
    const scanTime = this.randomBetween(2000, 5000);
    const startTime = Date.now();
    
    while (Date.now() - startTime < scanTime) {
      // Simulate eye movement over results
      const x = this.randomBetween(100, 800);
      const y = this.randomBetween(200, 600);
      
      await page.mouse.move(x, y);
      await randomDelay(100, 300);
      
      // Occasionally hover over links
      if (Math.random() < 0.3) {
        const links = await page.$$('a');
        if (links.length > 0) {
          const randomLink = links[Math.floor(Math.random() * Math.min(10, links.length))];
          const box = await randomLink.boundingBox();
          if (box) {
            await this.humanMouseMove(page, box.x + box.width / 2, box.y + box.height / 2);
            await randomDelay(200, 500);
          }
        }
      }
    }
  }
  
  async readSearchSnippet(page: Page, element: any): Promise<void> {
    const text = await element.textContent();
    const readTime = this.calculateReadingTime(text?.length || 100);
    
    const box = await element.boundingBox();
    if (box) {
      // Move mouse over snippet while reading
      await this.humanMouseMove(page, box.x + 50, box.y + box.height / 2);
    }
    
    await randomDelay(readTime * 0.8, readTime * 1.2);
  }
  
  // === Utility methods ===
  
  async waitForPageLoad(page: Page): Promise<void> {
    await page.waitForLoadState('networkidle', {
      timeout: CONSTANTS.DEFAULT_NAVIGATION_TIMEOUT
    });
    
    // Additional human-like wait
    await randomDelay(500, 1500);
  }
  
  async simulateReading(page: Page): Promise<void> {
    // Get visible text length
    const textLength = await page.evaluate(() => {
      const element = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return element?.textContent?.length || 0;
    });
    
    const readTime = this.calculateReadingTime(textLength);
    await randomDelay(readTime * 0.8, readTime * 1.2);
  }
  
  private async performRandomScroll(page: Page): Promise<void> {
    const direction = Math.random() > 0.7 ? 'up' : 'down';
    const distance = this.randomBetween(100, 400);
    await this.humanScroll(page, direction, distance);
  }
  
  private async performRandomHover(page: Page): Promise<void> {
    const elements = await page.$$('a, button, img');
    if (elements.length > 0) {
      const element = elements[Math.floor(Math.random() * elements.length)];
      const box = await element.boundingBox();
      if (box) {
        await this.humanMouseMove(page, box.x + box.width / 2, box.y + box.height / 2);
        await randomDelay(200, 1000);
      }
    }
  }
  
  private async performRandomClick(page: Page): Promise<void> {
    // Only click on safe elements
    const safeSelectors = ['a[href^="#"]', 'button.expand', '.tab', '.accordion'];
    const elements = await page.$$(safeSelectors.join(', '));
    
    if (elements.length > 0 && Math.random() < 0.3) {
      const element = elements[Math.floor(Math.random() * elements.length)];
      try {
        await element.click();
      } catch (error) {
        // Element might not be clickable
      }
    }
  }
  
  private calculateReadingTime(textLength: number): number {
    const wordsPerMinute = this.pattern.browsing.readingSpeed;
    const words = textLength / 5; // Average word length
    const minutes = words / wordsPerMinute;
    return minutes * 60 * 1000; // Convert to milliseconds
  }
  
  private updateLastActionTime(): void {
    this.lastActionTime = Date.now();
  }
  
  private randomBetween(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }
  
  private weightedChoice<T>(choices: T[], weights: number[]): T {
    const total = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * total;
    
    for (let i = 0; i < choices.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return choices[i];
      }
    }
    
    return choices[choices.length - 1];
  }
  
  private getRandomChar(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    return chars[Math.floor(Math.random() * chars.length)];
  }
  
  // === Public utility methods ===
  
  randomBetween(min: number, max: number): number {
    return this.randomBetween(min, max);
  }
  
  async wait(min: number, max?: number): Promise<void> {
    await randomDelay(min, max || min);
  }
}