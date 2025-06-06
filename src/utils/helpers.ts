import crypto from 'crypto';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

// === Time Utilities ===

export function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return sleep(delay);
}

export function gaussianRandom(mean: number, stdDev: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  
  const gaussian = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + gaussian * stdDev;
}

export function humanLikeDelay(baseDelay: number): Promise<void> {
  // Add 20% variance with gaussian distribution
  const variance = baseDelay * 0.2;
  const actualDelay = Math.max(0, gaussianRandom(baseDelay, variance));
  return sleep(Math.round(actualDelay));
}

// === String Utilities ===

export function generateRandomString(length: number, charset?: string): string {
  const defaultCharset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const chars = charset || defaultCharset;
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
}

export function hashString(str: string, algorithm: string = 'sha256'): string {
  return crypto.createHash(algorithm).update(str).digest('hex');
}

export function encryptData(data: string, key: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

export function decryptData(encryptedData: string, key: string): string {
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// === Array Utilities ===

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function weightedRandom<T>(items: Array<{ item: T; weight: number }>): T {
  const totalWeight = items.reduce((sum, { weight }) => sum + weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const { item, weight } of items) {
    random -= weight;
    if (random <= 0) {
      return item;
    }
  }
  
  return items[items.length - 1].item;
}

// === Object Utilities ===

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function mergeDeep(target: any, ...sources: any[]): any {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        mergeDeep(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return mergeDeep(target, ...sources);
}

function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}

// === URL Utilities ===

export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove trailing slash
    urlObj.pathname = urlObj.pathname.replace(/\/$/, '');
    // Sort query parameters
    urlObj.searchParams.sort();
    // Remove default ports
    if ((urlObj.protocol === 'http:' && urlObj.port === '80') ||
        (urlObj.protocol === 'https:' && urlObj.port === '443')) {
      urlObj.port = '';
    }
    return urlObj.toString();
  } catch {
    return url;
  }
}

export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  }
  
  return searchParams.toString();
}

// === Validation Utilities ===

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function isValidIPv4(ip: string): boolean {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ip)) return false;
  
  const parts = ip.split('.');
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}

// === Retry Utilities ===

export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    attempts?: number;
    delay?: number;
    backoff?: number;
    onError?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    attempts = 3,
    delay = 1000,
    backoff = 2,
    onError
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (onError) {
        onError(lastError, attempt);
      }
      
      if (attempt < attempts) {
        const waitTime = delay * Math.pow(backoff, attempt - 1);
        await sleep(waitTime);
      }
    }
  }

  throw lastError!;
}

// === Rate Limiting ===

export class RateLimiter {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(
    private maxConcurrent: number,
    private minTime: number = 0
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    while (this.running >= this.maxConcurrent) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }

    this.running++;
    const startTime = Date.now();

    try {
      const result = await fn();
      
      // Ensure minimum time between executions
      const elapsed = Date.now() - startTime;
      if (elapsed < this.minTime) {
        await sleep(this.minTime - elapsed);
      }
      
      return result;
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

// === Browser Helpers ===

export function generateViewport(deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop') {
  const viewports = {
    desktop: [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1536, height: 864 },
      { width: 1280, height: 720 }
    ],
    mobile: [
      { width: 375, height: 667 },  // iPhone 6/7/8
      { width: 414, height: 896 },  // iPhone XR/11
      { width: 360, height: 640 },  // Samsung Galaxy S5
      { width: 412, height: 915 }   // Pixel 5
    ],
    tablet: [
      { width: 768, height: 1024 }, // iPad
      { width: 810, height: 1080 }, // iPad Pro
      { width: 800, height: 1280 }  // Android tablet
    ]
  };

  const options = viewports[deviceType];
  return options[Math.floor(Math.random() * options.length)];
}

export function generateMousePath(start: Point, end: Point, steps: number = 10): Point[] {
  const path: Point[] = [];
  
  // Generate control points for bezier curve
  const cp1 = {
    x: start.x + (end.x - start.x) * 0.25 + (Math.random() - 0.5) * 100,
    y: start.y + (end.y - start.y) * 0.25 + (Math.random() - 0.5) * 100
  };
  
  const cp2 = {
    x: start.x + (end.x - start.x) * 0.75 + (Math.random() - 0.5) * 100,
    y: start.y + (end.y - start.y) * 0.75 + (Math.random() - 0.5) * 100
  };
  
  // Calculate bezier curve points
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const point = calculateBezierPoint(t, start, cp1, cp2, end);
    path.push(point);
  }
  
  return path;
}

interface Point {
  x: number;
  y: number;
}

function calculateBezierPoint(
  t: number,
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point
): Point {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  
  const x = uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x;
  const y = uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y;
  
  return { x: Math.round(x), y: Math.round(y) };
}

// === Performance Monitoring ===

export class PerformanceTimer {
  private startTime: number;
  private marks: Map<string, number> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  mark(name: string): void {
    this.marks.set(name, Date.now());
  }

  measure(name: string, startMark?: string): number {
    const endTime = Date.now();
    const startTime = startMark ? this.marks.get(startMark) : this.startTime;
    
    if (!startTime) {
      throw new Error(`Start mark "${startMark}" not found`);
    }
    
    return endTime - startTime;
  }

  getReport(): Record<string, number> {
    const report: Record<string, number> = {
      total: Date.now() - this.startTime
    };
    
    let previousTime = this.startTime;
    for (const [name, time] of this.marks) {
      report[name] = time - previousTime;
      previousTime = time;
    }
    
    return report;
  }
}