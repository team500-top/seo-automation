import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

export interface Config {
  // Application
  NODE_ENV: string;
  APP_NAME: string;
  PORT: number;
  HOST: string;
  LOG_LEVEL: string;
  LOG_DIR: string;

  // Database
  MONGODB_URI: string;
  REDIS_URL: string;

  // Security
  JWT_SECRET: string;
  API_KEY: string;
  ENCRYPTION_KEY: string;

  // Proxy
  PROXY_PROVIDER: string;
  PROXY_API_KEY: string;
  PROXY_ROTATION_INTERVAL: number;
  PROXY_CONCURRENT_LIMIT: number;

  // Anti-Captcha
  ANTICAPTCHA_KEY: string;
  TWOCAPTCHA_KEY: string;
  CAPSOLVER_KEY: string;
  CAPTCHA_TIMEOUT: number;
  CAPTCHA_MAX_ATTEMPTS: number;

  // Browser
  BROWSER_HEADLESS: boolean;
  BROWSER_TIMEOUT: number;
  BROWSER_POOL_SIZE: number;
  BROWSER_ARGS: string[];

  // Task
  MAX_CONCURRENT_TASKS: number;
  TASK_QUEUE_CONCURRENCY: number;
  TASK_RETRY_ATTEMPTS: number;
  TASK_RETRY_DELAY: number;

  // Profile
  PROFILE_WARMUP_DAYS: number;
  PROFILE_MAX_DAILY_TASKS: number;
  PROFILE_HEALTH_CHECK_INTERVAL: number;

  // Search Engines
  YANDEX_REGION: number;
  GOOGLE_LOCATION: string;
  GOOGLE_GL: string;
  GOOGLE_HL: string;
  MAX_SEARCH_PAGES: number;

  // Monitoring
  PROMETHEUS_PORT: number;
  GRAFANA_PORT: number;
  HEALTH_CHECK_INTERVAL: number;

  // Notifications
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  EMAIL_HOST?: string;
  EMAIL_PORT?: number;
  EMAIL_USER?: string;
  EMAIL_PASSWORD?: string;

  // Limits
  MAX_PROFILES: number;
  MAX_DAILY_SEARCHES: number;
  MEMORY_LIMIT: number;
  CPU_LIMIT: number;

  // Features
  ENABLE_AUTO_RECOVERY: boolean;
  ENABLE_PROXY_VALIDATION: boolean;
  ENABLE_POSITION_TRACKING: boolean;
  ENABLE_COST_TRACKING: boolean;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseArray(value: string | undefined, defaultValue: string[]): string[] {
  if (value === undefined) return defaultValue;
  return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
}

// Build configuration object
export const config: Config = {
  // Application
  NODE_ENV: process.env.NODE_ENV || 'development',
  APP_NAME: process.env.APP_NAME || 'SEO_Automation',
  PORT: parseNumber(process.env.PORT, 3000),
  HOST: process.env.HOST || '0.0.0.0',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_DIR: process.env.LOG_DIR || path.join(process.cwd(), 'logs'),

  // Database
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/seo-automation',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // Security
  JWT_SECRET: process.env.JWT_SECRET || 'change-this-secret-in-production',
  API_KEY: process.env.API_KEY || 'change-this-api-key',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'change-this-32-character-key!!!',

  // Proxy
  PROXY_PROVIDER: process.env.PROXY_PROVIDER || 'mobile-proxies.ru',
  PROXY_API_KEY: process.env.PROXY_API_KEY || '',
  PROXY_ROTATION_INTERVAL: parseNumber(process.env.PROXY_ROTATION_INTERVAL, 300000),
  PROXY_CONCURRENT_LIMIT: parseNumber(process.env.PROXY_CONCURRENT_LIMIT, 200),

  // Anti-Captcha
  ANTICAPTCHA_KEY: process.env.ANTICAPTCHA_KEY || '',
  TWOCAPTCHA_KEY: process.env.TWOCAPTCHA_KEY || '',
  CAPSOLVER_KEY: process.env.CAPSOLVER_KEY || '',
  CAPTCHA_TIMEOUT: parseNumber(process.env.CAPTCHA_TIMEOUT, 180000),
  CAPTCHA_MAX_ATTEMPTS: parseNumber(process.env.CAPTCHA_MAX_ATTEMPTS, 3),

  // Browser
  BROWSER_HEADLESS: parseBoolean(process.env.BROWSER_HEADLESS, true),
  BROWSER_TIMEOUT: parseNumber(process.env.BROWSER_TIMEOUT, 300000),
  BROWSER_POOL_SIZE: parseNumber(process.env.BROWSER_POOL_SIZE, 10),
  BROWSER_ARGS: parseArray(
    process.env.BROWSER_ARGS,
    ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  ),

  // Task
  MAX_CONCURRENT_TASKS: parseNumber(process.env.MAX_CONCURRENT_TASKS, 10),
  TASK_QUEUE_CONCURRENCY: parseNumber(process.env.TASK_QUEUE_CONCURRENCY, 5),
  TASK_RETRY_ATTEMPTS: parseNumber(process.env.TASK_RETRY_ATTEMPTS, 3),
  TASK_RETRY_DELAY: parseNumber(process.env.TASK_RETRY_DELAY, 60000),

  // Profile
  PROFILE_WARMUP_DAYS: parseNumber(process.env.PROFILE_WARMUP_DAYS, 14),
  PROFILE_MAX_DAILY_TASKS: parseNumber(process.env.PROFILE_MAX_DAILY_TASKS, 10),
  PROFILE_HEALTH_CHECK_INTERVAL: parseNumber(process.env.PROFILE_HEALTH_CHECK_INTERVAL, 3600000),

  // Search Engines
  YANDEX_REGION: parseNumber(process.env.YANDEX_REGION, 213), // Moscow
  GOOGLE_LOCATION: process.env.GOOGLE_LOCATION || 'Moscow,Russia',
  GOOGLE_GL: process.env.GOOGLE_GL || 'ru',
  GOOGLE_HL: process.env.GOOGLE_HL || 'ru',
  MAX_SEARCH_PAGES: parseNumber(process.env.MAX_SEARCH_PAGES, 10),

  // Monitoring
  PROMETHEUS_PORT: parseNumber(process.env.PROMETHEUS_PORT, 9090),
  GRAFANA_PORT: parseNumber(process.env.GRAFANA_PORT, 3001),
  HEALTH_CHECK_INTERVAL: parseNumber(process.env.HEALTH_CHECK_INTERVAL, 30000),

  // Notifications
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  EMAIL_HOST: process.env.EMAIL_HOST,
  EMAIL_PORT: parseNumber(process.env.EMAIL_PORT, 587),
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD,

  // Limits
  MAX_PROFILES: parseNumber(process.env.MAX_PROFILES, 200),
  MAX_DAILY_SEARCHES: parseNumber(process.env.MAX_DAILY_SEARCHES, 2000),
  MEMORY_LIMIT: parseNumber(process.env.MEMORY_LIMIT, 8192),
  CPU_LIMIT: parseNumber(process.env.CPU_LIMIT, 80),

  // Features
  ENABLE_AUTO_RECOVERY: parseBoolean(process.env.ENABLE_AUTO_RECOVERY, true),
  ENABLE_PROXY_VALIDATION: parseBoolean(process.env.ENABLE_PROXY_VALIDATION, true),
  ENABLE_POSITION_TRACKING: parseBoolean(process.env.ENABLE_POSITION_TRACKING, true),
  ENABLE_COST_TRACKING: parseBoolean(process.env.ENABLE_COST_TRACKING, true),
};

// Validate critical configuration
export function validateConfig(): void {
  const errors: string[] = [];

  // Check required fields
  if (!config.PROXY_API_KEY) {
    errors.push('PROXY_API_KEY is required');
  }

  if (!config.ANTICAPTCHA_KEY && !config.TWOCAPTCHA_KEY && !config.CAPSOLVER_KEY) {
    errors.push('At least one anti-captcha service key is required');
  }

  if (config.JWT_SECRET === 'change-this-secret-in-production' && config.NODE_ENV === 'production') {
    errors.push('JWT_SECRET must be changed in production');
  }

  if (config.ENCRYPTION_KEY.length !== 32) {
    errors.push('ENCRYPTION_KEY must be exactly 32 characters');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Export default
export default config;