import Joi from 'joi';
import { config } from './index';
import { CONSTANTS } from './constants';
import { createLogger } from '../utils/logger';

const logger = createLogger('ConfigValidator');

// Environment variable schemas
const envSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
  PORT: Joi.number().port().default(3000),
  HOST: Joi.string().hostname().default('0.0.0.0'),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'silly').default('info'),
  
  // Database
  MONGODB_URI: Joi.string().uri().required(),
  REDIS_URL: Joi.string().uri().required(),
  
  // Security
  JWT_SECRET: Joi.string().min(32).required(),
  API_KEY: Joi.string().min(32).required(),
  ENCRYPTION_KEY: Joi.string().length(32).required(),
  
  // Proxy
  PROXY_API_KEY: Joi.string().required(),
  PROXY_ROTATION_INTERVAL: Joi.number().min(60000).default(300000),
  PROXY_CONCURRENT_LIMIT: Joi.number().min(1).max(1000).default(200),
  
  // Anti-captcha (at least one required)
  ANTICAPTCHA_KEY: Joi.string().allow(''),
  TWOCAPTCHA_KEY: Joi.string().allow(''),
  CAPSOLVER_KEY: Joi.string().allow(''),
  
  // Browser
  BROWSER_HEADLESS: Joi.boolean().default(true),
  BROWSER_POOL_SIZE: Joi.number().min(1).max(50).default(10),
  BROWSER_TIMEOUT: Joi.number().min(10000).default(300000),
  
  // Task
  MAX_CONCURRENT_TASKS: Joi.number().min(1).max(100).default(10),
  TASK_RETRY_ATTEMPTS: Joi.number().min(0).max(10).default(3),
  
  // Profile
  MAX_PROFILES: Joi.number().min(1).max(10000).default(200),
  PROFILE_WARMUP_DAYS: Joi.number().min(1).max(30).default(14)
}).custom((value, helpers) => {
  // Validate at least one captcha service is configured
  if (!value.ANTICAPTCHA_KEY && !value.TWOCAPTCHA_KEY && !value.CAPSOLVER_KEY) {
    return helpers.error('At least one anti-captcha service must be configured');
  }
  return value;
});

// Task configuration schemas
export const taskConfigSchema = {
  search: Joi.object({
    engine: Joi.string().valid('yandex', 'google').required(),
    query: Joi.string().min(1).max(500).required(),
    targetUrl: Joi.string().uri().optional(),
    targetDomain: Joi.string().hostname().optional(),
    maxResultPages: Joi.number().min(1).max(10).default(5),
    region: Joi.string().optional(),
    language: Joi.string().optional()
  }).or('targetUrl', 'targetDomain'),
  
  target_visit: Joi.object({
    url: Joi.string().uri().required(),
    referrer: Joi.string().uri().optional(),
    duration: Joi.object({
      min: Joi.number().min(30000).required(),
      max: Joi.number().min(30000).required()
    }).custom((value, helpers) => {
      if (value.min > value.max) {
        return helpers.error('Min duration must be less than max duration');
      }
      return value;
    }),
    actions: Joi.array().items(Joi.object({
      type: Joi.string().valid('click', 'scroll', 'hover', 'input', 'wait', 'navigate').required(),
      selector: Joi.string().optional(),
      value: Joi.any().optional(),
      probability: Joi.number().min(0).max(1).default(1),
      required: Joi.boolean().default(false)
    })).default([]),
    goals: Joi.array().items(Joi.object({
      type: Joi.string().valid('pageview', 'event', 'conversion', 'duration', 'depth').required(),
      value: Joi.any().required(),
      required: Joi.boolean().default(true)
    })).default([])
  }),
  
  organic_browse: Joi.object({
    categories: Joi.array().items(
      Joi.string().valid('news', 'weather', 'maps', 'video', 'shopping', 'social')
    ).min(1).required(),
    duration: Joi.number().min(60000).default(180000),
    sites: Joi.array().items(Joi.string().uri()).optional()
  }),
  
  warmup: Joi.object({
    day: Joi.number().min(1).max(30).required(),
    activity: Joi.string().valid('news', 'weather', 'maps', 'video', 'shopping', 'social').required(),
    duration: Joi.number().min(30000).default(120000)
  })
};

// Profile creation schema
export const profileSchema = Joi.object({
  region: Joi.string().default('Moscow'),
  city: Joi.string().optional(),
  deviceType: Joi.string().valid('desktop', 'mobile', 'tablet').default('desktop'),
  persona: Joi.object({
    age: Joi.number().min(18).max(80).optional(),
    gender: Joi.string().valid('male', 'female').optional(),
    interests: Joi.array().items(Joi.string()).min(1).max(10).optional()
  }).optional()
});

// API request schemas
export const apiSchemas = {
  createTask: Joi.object({
    type: Joi.string().valid(...Object.values(CONSTANTS.TASK_TYPES)).required(),
    profileId: Joi.string().optional(),
    priority: Joi.number().min(1).max(9).default(5),
    config: Joi.when('type', {
      switch: Object.entries(taskConfigSchema).map(([type, schema]) => ({
        is: type,
        then: schema
      }))
    }),
    schedule: Joi.object({
      type: Joi.string().valid('immediate', 'scheduled', 'distributed', 'cron').default('immediate'),
      scheduledFor: Joi.date().when('type', {
        is: 'scheduled',
        then: Joi.required()
      }),
      cron: Joi.string().when('type', {
        is: 'cron',
        then: Joi.required()
      }),
      distributionWindow: Joi.object({
        start: Joi.date().required(),
        end: Joi.date().greater(Joi.ref('start')).required()
      }).when('type', {
        is: 'distributed',
        then: Joi.required()
      })
    }).default({ type: 'immediate' })
  }),
  
  bulkCreateTasks: Joi.object({
    tasks: Joi.array().items(Joi.object({
      type: Joi.string().valid('search').required(),
      query: Joi.string().min(1).required(),
      targetDomain: Joi.string().hostname().required()
    })).min(1).max(1000).required(),
    options: Joi.object({
      profileCount: Joi.number().min(1).max(200).default(10),
      engine: Joi.string().valid('yandex', 'google').default('yandex'),
      schedule: Joi.string().valid('immediate', 'distributed').default('distributed'),
      priority: Joi.number().min(1).max(9).default(5)
    }).default()
  }),
  
  updateProfile: Joi.object({
    status: Joi.string().valid(...Object.values(CONSTANTS.PROFILE_STATUS)).optional(),
    suspendedReason: Joi.string().when('status', {
      is: 'suspended',
      then: Joi.required()
    })
  }),
  
  pagination: Joi.object({
    page: Joi.number().min(1).default(1),
    limit: Joi.number().min(1).max(100).default(20),
    sort: Joi.string().optional(),
    order: Joi.string().valid('asc', 'desc').default('desc')
  })
};

// Validation functions
export function validateEnvironment(): void {
  const result = envSchema.validate(process.env, {
    abortEarly: false,
    allowUnknown: true
  });
  
  if (result.error) {
    const errors = result.error.details.map(detail => `- ${detail.message}`).join('\n');
    throw new Error(`Environment validation failed:\n${errors}`);
  }
  
  logger.info('Environment configuration validated successfully');
}

export function validateTaskConfig(type: string, config: any): any {
  const schema = taskConfigSchema[type];
  if (!schema) {
    throw new Error(`Unknown task type: ${type}`);
  }
  
  const result = schema.validate(config, {
    abortEarly: false,
    stripUnknown: true
  });
  
  if (result.error) {
    const errors = result.error.details.map(detail => detail.message).join(', ');
    throw new Error(`Task configuration validation failed: ${errors}`);
  }
  
  return result.value;
}

export function validateApiRequest(schema: Joi.Schema, data: any): any {
  const result = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });
  
  if (result.error) {
    const errors = result.error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    const error: any = new Error('Validation failed');
    error.statusCode = 400;
    error.errors = errors;
    throw error;
  }
  
  return result.value;
}

// Configuration file validators
export function validateProxyConfig(config: any): void {
  const schema = Joi.object({
    providers: Joi.array().items(Joi.object({
      name: Joi.string().required(),
      type: Joi.string().valid('mobile', 'residential', 'datacenter').required(),
      apiUrl: Joi.string().uri().required(),
      apiKey: Joi.string().optional(),
      regions: Joi.array().items(Joi.string()).min(1).required(),
      rotationInterval: Joi.number().min(60000).required(),
      concurrent: Joi.number().min(1).required(),
      retryOnFail: Joi.boolean().default(true),
      healthCheck: Joi.object({
        enabled: Joi.boolean().default(true),
        interval: Joi.number().min(30000).default(60000),
        timeout: Joi.number().min(1000).default(5000)
      }).optional()
    })).min(1).required(),
    
    validation: Joi.object({
      checkInterval: Joi.number().min(30000).required(),
      timeout: Joi.number().min(1000).required(),
      retries: Joi.number().min(0).required(),
      blacklistCheck: Joi.boolean().default(true),
      geoVerification: Joi.boolean().default(true)
    }).required(),
    
    rotation: Joi.object({
      strategy: Joi.string().valid('round-robin', 'random', 'least-used').required(),
      stickySession: Joi.boolean().default(true),
      sessionDuration: Joi.number().min(60000).optional()
    }).optional()
  });
  
  const result = schema.validate(config);
  if (result.error) {
    throw new Error(`Proxy configuration validation failed: ${result.error.message}`);
  }
}

export function validateCaptchaConfig(config: any): void {
  const schema = Joi.object({
    services: Joi.array().items(Joi.object({
      name: Joi.string().required(),
      apiKey: Joi.string().optional(),
      priority: Joi.number().min(1).required(),
      supportedTypes: Joi.array().items(
        Joi.string().valid('recaptcha', 'recaptcha3', 'yandex', 'image', 'funcaptcha')
      ).min(1).required(),
      timeout: Joi.number().min(30000).required(),
      maxAttempts: Joi.number().min(1).max(5).required(),
      minBalance: Joi.number().min(0).optional(),
      endpoints: Joi.object().optional(),
      settings: Joi.object().optional()
    })).min(1).required(),
    
    strategy: Joi.object({
      selection: Joi.string().valid('priority', 'round-robin', 'least-cost').required(),
      fallback: Joi.boolean().default(true),
      parallelSolving: Joi.boolean().default(false),
      costOptimization: Joi.boolean().default(true)
    }).optional(),
    
    monitoring: Joi.object({
      trackSuccess: Joi.boolean().default(true),
      trackCosts: Joi.boolean().default(true),
      alertOnLowBalance: Joi.number().min(0).optional()
    }).optional()
  });
  
  const result = schema.validate(config);
  if (result.error) {
    throw new Error(`Captcha configuration validation failed: ${result.error.message}`);
  }
}