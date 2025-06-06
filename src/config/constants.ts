// System constants that don't change between environments

export const CONSTANTS = {
  // System limits
  MAX_BROWSER_INSTANCES: 50,
  MAX_CONCURRENT_TASKS: 100,
  MAX_PROFILE_AGE_DAYS: 90,
  MIN_PROFILE_HEALTH: 30,
  
  // Timing constants (in milliseconds)
  DEFAULT_TIMEOUT: 30000,
  DEFAULT_NAVIGATION_TIMEOUT: 60000,
  MIN_HUMAN_DELAY: 100,
  MAX_HUMAN_DELAY: 3000,
  TYPING_DELAY_MIN: 50,
  TYPING_DELAY_MAX: 150,
  
  // Browser constants
  DEFAULT_VIEWPORT: {
    width: 1920,
    height: 1080
  },
  MOBILE_VIEWPORT: {
    width: 375,
    height: 667
  },
  TABLET_VIEWPORT: {
    width: 768,
    height: 1024
  },
  
  // Search engines
  SEARCH_ENGINES: {
    YANDEX: {
      name: 'yandex',
      baseUrl: 'https://yandex.ru',
      searchPath: '/search/',
      searchParam: 'text',
      resultsSelector: '.organic__url',
      nextPageSelector: '.pager__item_kind_next',
      captchaSelector: '.CheckboxCaptcha',
      maxPages: 10
    },
    GOOGLE: {
      name: 'google',
      baseUrl: 'https://google.com',
      searchPath: '/search',
      searchParam: 'q',
      resultsSelector: 'h3',
      nextPageSelector: '#pnnext',
      captchaSelector: '.g-recaptcha',
      maxPages: 10
    }
  },
  
  // Profile statuses
  PROFILE_STATUS: {
    NEW: 'new',
    WARMING: 'warming',
    ACTIVE: 'active',
    SUSPENDED: 'suspended',
    BANNED: 'banned'
  },
  
  // Task statuses
  TASK_STATUS: {
    PENDING: 'pending',
    SCHEDULED: 'scheduled',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
  },
  
  // Task types
  TASK_TYPES: {
    WARMUP: 'warmup',
    SEARCH: 'search',
    TARGET_VISIT: 'target_visit',
    ORGANIC_BROWSE: 'organic_browse',
    VIDEO_WATCH: 'video_watch',
    NEWS_READING: 'news_reading',
    SHOPPING: 'shopping',
    SOCIAL_ACTIVITY: 'social_activity'
  },
  
  // Activity types for warmup
  WARMUP_ACTIVITIES: {
    NEWS: ['https://yandex.ru/news', 'https://news.google.com'],
    WEATHER: ['https://yandex.ru/pogoda', 'https://weather.com'],
    MAPS: ['https://yandex.ru/maps', 'https://maps.google.com'],
    VIDEO: ['https://youtube.com', 'https://rutube.ru'],
    SHOPPING: ['https://market.yandex.ru', 'https://www.ozon.ru'],
    SOCIAL: ['https://vk.com', 'https://ok.ru']
  },
  
  // User agents by device type
  USER_AGENTS: {
    DESKTOP: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ],
    MOBILE: [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    ],
    TABLET: [
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 13; SM-X900) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ]
  },
  
  // Common screen resolutions
  SCREEN_RESOLUTIONS: {
    DESKTOP: [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1536, height: 864 },
      { width: 1280, height: 720 },
      { width: 2560, height: 1440 }
    ],
    MOBILE: [
      { width: 375, height: 667 },   // iPhone 6/7/8
      { width: 414, height: 896 },   // iPhone XR/11
      { width: 360, height: 640 },   // Samsung Galaxy S5
      { width: 412, height: 915 },   // Pixel 5
      { width: 390, height: 844 }    // iPhone 12/13
    ],
    TABLET: [
      { width: 768, height: 1024 },  // iPad
      { width: 810, height: 1080 },  // iPad Pro
      { width: 800, height: 1280 },  // Android tablet
      { width: 1024, height: 1366 }  // iPad Pro 12.9
    ]
  },
  
  // Health score weights
  HEALTH_WEIGHTS: {
    SUCCESS_RATE: 0.4,
    CAPTCHA_RATE: 0.2,
    SESSION_DURATION: 0.2,
    ACTIVITY_RECENCY: 0.1,
    TASK_COMPLETION: 0.1
  },
  
  // Rate limits
  RATE_LIMITS: {
    SEARCHES_PER_PROFILE_PER_DAY: 10,
    CLICKS_PER_SEARCH: 3,
    PAGES_PER_SESSION: 10,
    CAPTCHA_ATTEMPTS: 3
  },
  
  // Retry configuration
  RETRY_CONFIG: {
    MAX_ATTEMPTS: 3,
    BASE_DELAY: 1000,
    MAX_DELAY: 30000,
    BACKOFF_FACTOR: 2
  },
  
  // Cache TTL (seconds)
  CACHE_TTL: {
    PROFILE: 3600,          // 1 hour
    PROXY_STATUS: 300,      // 5 minutes
    SEARCH_POSITION: 1800,  // 30 minutes
    METRICS: 60,            // 1 minute
    SYSTEM_STATUS: 30       // 30 seconds
  },
  
  // Queue priorities
  QUEUE_PRIORITY: {
    CRITICAL: 1,
    HIGH: 3,
    NORMAL: 5,
    LOW: 7,
    BACKGROUND: 9
  },
  
  // Error codes
  ERROR_CODES: {
    // System errors (1xxx)
    SYSTEM_ERROR: 1000,
    DATABASE_ERROR: 1001,
    REDIS_ERROR: 1002,
    QUEUE_ERROR: 1003,
    
    // Browser errors (2xxx)
    BROWSER_CRASH: 2000,
    BROWSER_TIMEOUT: 2001,
    PAGE_LOAD_ERROR: 2002,
    ELEMENT_NOT_FOUND: 2003,
    
    // Proxy errors (3xxx)
    PROXY_CONNECTION_FAILED: 3000,
    PROXY_AUTHENTICATION_FAILED: 3001,
    PROXY_BLOCKED: 3002,
    
    // Captcha errors (4xxx)
    CAPTCHA_SOLVE_FAILED: 4000,
    CAPTCHA_SERVICE_ERROR: 4001,
    CAPTCHA_BALANCE_LOW: 4002,
    
    // Profile errors (5xxx)
    PROFILE_SUSPENDED: 5000,
    PROFILE_BANNED: 5001,
    PROFILE_HEALTH_LOW: 5002,
    
    // Task errors (6xxx)
    TASK_TIMEOUT: 6000,
    TASK_CANCELLED: 6001,
    TASK_INVALID_CONFIG: 6002
  }
};

// Freeze the constants object to prevent modifications
export default Object.freeze(CONSTANTS);