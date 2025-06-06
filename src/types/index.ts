// ===== PROFILE TYPES =====

export enum ProfileStatus {
  NEW = 'new',
  WARMING = 'warming',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  BANNED = 'banned'
}

export interface Profile {
  id: string;
  status: ProfileStatus;
  created: Date;
  lastActive: Date;
  
  identity: ProfileIdentity;
  fingerprint: BrowserFingerprint;
  behavior: BehaviorPattern;
  stats: ProfileStatistics;
  health: ProfileHealth;
  
  cookies: Cookie[];
  history: BrowsingHistory[];
  credentials: SiteCredential[];
  
  suspendedAt?: Date;
  suspendedReason?: string;
}

export interface ProfileIdentity {
  persona: {
    age: number;
    gender: 'male' | 'female';
    interests: string[];
    occupation: string;
    income: 'low' | 'medium' | 'high';
  };
  
  location: {
    country: string;
    region: string;
    city: string;
    district: string;
    coordinates: {
      latitude: number;
      longitude: number;
      accuracy: number;
    };
    timezone: string;
    languages: string[];
  };
  
  device: {
    type: 'desktop' | 'laptop' | 'tablet' | 'mobile';
    manufacturer: string;
    model: string;
    os: string;
    osVersion: string;
  };
}

export interface BrowserFingerprint {
  userAgent: string;
  platform: string;
  vendor: string;
  
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
    pixelDepth: number;
    devicePixelRatio: number;
    orientation?: {
      angle: number;
      type: string;
    };
  };
  
  window: {
    innerWidth: number;
    innerHeight: number;
    outerWidth: number;
    outerHeight: number;
    screenX: number;
    screenY: number;
  };
  
  hardware: {
    cpuClass?: string;
    hardwareConcurrency: number;
    deviceMemory?: number;
    maxTouchPoints: number;
  };
  
  webGL: {
    vendor: string;
    renderer: string;
    version: string;
    shadingLanguageVersion: string;
    extensions: string[];
    parameters: Record<string, any>;
  };
  
  canvas: {
    fingerprint: string;
    dataURL?: string;
  };
  
  audio: {
    sampleRate: number;
    channelCount: number;
    fingerprint: string;
  };
  
  fonts: string[];
  plugins: PluginData[];
  
  network?: {
    effectiveType: string;
    downlink: number;
    rtt: number;
    saveData: boolean;
  };
  
  battery?: {
    charging: boolean;
    level: number;
    chargingTime: number;
    dischargingTime: number;
  };
  
  mediaDevices: MediaDeviceInfo[];
  permissions: Record<string, string>;
  
  features: {
    cookieEnabled: boolean;
    doNotTrack: string | null;
    languages: string[];
    onLine: boolean;
    pdfViewerEnabled: boolean;
    webdriver: boolean;
    bluetooth?: boolean;
  };
}

export interface BehaviorPattern {
  timing: {
    activeHours: Array<{ start: number; end: number }>;
    activeDays: number[];
    sessionDuration: { min: number; max: number; avg: number };
    betweenSessions: { min: number; max: number };
  };
  
  interaction: {
    mouseSpeed: { min: number; max: number; curve: string };
    scrollSpeed: { min: number; max: number };
    typingSpeed: { min: number; max: number; errors: number };
    clickAccuracy: number;
    hoverTime: { min: number; max: number };
  };
  
  search: {
    engines: Array<{ name: string; weight: number }>;
    queryTypes: Array<{ type: string; weight: number }>;
    refinements: number;
    resultsViewed: { min: number; max: number };
    pagesVisited: { min: number; max: number };
  };
  
  browsing: {
    readingSpeed: number;
    attentionSpan: { min: number; max: number };
    multitabUsage: boolean;
    bookmarkUsage: boolean;
    historyUsage: boolean;
  };
}

export interface ProfileStatistics {
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  totalSearches: number;
  totalClicks: number;
  totalTimeSpent: number;
  captchasSolved: number;
  captchasFailed: number;
  lastTaskDate: Date | null;
}

export interface ProfileHealth {
  score: number;
  factors: {
    successRate: number;
    captchaRate: number;
    averageSessionDuration: number;
    daysSinceLastActivity: number;
    taskCompletionRate: number;
  };
  lastCheck: Date;
}

// ===== TASK TYPES =====

export enum TaskType {
  WARMUP = 'warmup',
  SEARCH = 'search',
  TARGET_VISIT = 'target_visit',
  ORGANIC_BROWSE = 'organic_browse',
  VIDEO_WATCH = 'video_watch',
  NEWS_READING = 'news_reading',
  SHOPPING = 'shopping',
  SOCIAL_ACTIVITY = 'social_activity'
}

export enum TaskStatus {
  PENDING = 'pending',
  SCHEDULED = 'scheduled',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface Task {
  id: string;
  type: TaskType;
  profileId: string;
  priority: number;
  status: TaskStatus;
  
  config: TaskConfig;
  schedule: TaskSchedule;
  result?: TaskResult;
  
  attempts: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface TaskConfig {
  search?: {
    engine: 'yandex' | 'google';
    query: string;
    targetUrl?: string;
    targetDomain?: string;
    maxResultPages: number;
    region?: string;
    language?: string;
  };
  
  target?: {
    url: string;
    referrer?: string;
    actions: TargetAction[];
    goals: TargetGoal[];
    duration: { min: number; max: number };
  };
  
  organic?: {
    categories: string[];
    sites: string[];
    duration: number;
  };
  
  warmup?: {
    day: number;
    activity: string;
    duration: number;
  };
}

export interface TaskSchedule {
  type: 'immediate' | 'scheduled' | 'distributed' | 'cron';
  scheduledFor?: Date;
  cron?: string;
  distributionWindow?: {
    start: Date;
    end: Date;
  };
}

export interface TaskResult {
  success: boolean;
  data?: any;
  error?: string;
  metrics?: {
    duration: number;
    pagesVisited: number;
    actionsPerformed: number;
    captchaEncountered: boolean;
    captchaSolved?: boolean;
  };
  searchResult?: {
    position: number;
    engine: string;
    query: string;
    clicked: boolean;
  };
}

export interface TargetAction {
  type: 'click' | 'scroll' | 'hover' | 'input' | 'wait' | 'navigate';
  selector?: string;
  value?: any;
  probability: number;
  required?: boolean;
}

export interface TargetGoal {
  type: 'pageview' | 'event' | 'conversion' | 'duration' | 'depth';
  value: any;
  required: boolean;
}

// ===== PROXY TYPES =====

export interface ProxyConfig {
  id: string;
  provider: string;
  type: 'mobile' | 'residential' | 'datacenter';
  server: string;
  port: number;
  username?: string;
  password?: string;
  protocol: 'http' | 'https' | 'socks5';
  
  region: string;
  city?: string;
  ip?: string;
  
  status: 'active' | 'inactive' | 'blacklisted';
  lastCheck: Date;
  lastUsed?: Date;
  
  stats: {
    requests: number;
    failures: number;
    avgResponseTime: number;
    captchaRate: number;
  };
}

// ===== CAPTCHA TYPES =====

export interface CaptchaTask {
  id: string;
  type: 'recaptcha' | 'recaptcha3' | 'yandex' | 'image' | 'funcaptcha';
  service: string;
  
  pageUrl: string;
  siteKey?: string;
  imageUrl?: string;
  
  status: 'pending' | 'solving' | 'solved' | 'failed';
  solution?: string;
  
  attempts: number;
  cost?: number;
  
  createdAt: Date;
  solvedAt?: Date;
}

// ===== METRICS TYPES =====

export interface Metrics {
  timestamp: Date;
  
  profiles: {
    total: number;
    active: number;
    warming: number;
    suspended: number;
    avgHealth: number;
  };
  
  tasks: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    successRate: number;
    avgDuration: number;
  };
  
  searches: {
    total: number;
    byEngine: Record<string, number>;
    positions: Array<{
      query: string;
      engine: string;
      position: number;
      change: number;
    }>;
  };
  
  resources: {
    cpu: number;
    memory: number;
    browsers: {
      active: number;
      available: number;
      crashed: number;
    };
    proxies: {
      active: number;
      working: number;
      blacklisted: number;
    };
  };
  
  costs: {
    proxies: number;
    captcha: number;
    total: number;
  };
}

// ===== BROWSER TYPES =====

export interface BrowserInstance {
  id: string;
  profileId?: string;
  status: 'idle' | 'busy' | 'crashed';
  
  createdAt: Date;
  lastUsed?: Date;
  
  stats: {
    tasksCompleted: number;
    crashes: number;
    memoryUsage: number;
  };
}

// ===== ACTIVITY LOG TYPES =====

export interface ActivityLog {
  id: string;
  profileId: string;
  sessionId: string;
  timestamp: Date;
  
  type: string;
  action: string;
  target?: string;
  
  data?: any;
  success: boolean;
  error?: string;
  
  browser?: {
    userAgent: string;
    viewport: { width: number; height: number };
    proxyIp?: string;
  };
  
  performance?: {
    duration: number;
    captchaEncountered?: boolean;
  };
}

// ===== HELPER TYPES =====

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface BrowsingHistory {
  url: string;
  title: string;
  visitedAt: Date;
  duration: number;
}

export interface SiteCredential {
  site: string;
  username: string;
  password: string;
  createdAt: Date;
}

export interface PluginData {
  name: string;
  filename: string;
  description?: string;
  version?: string;
}

export interface MediaDeviceInfo {
  deviceId: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
  label: string;
  groupId: string;
}

// ===== API TYPES =====

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface APIError {
  code: string;
  message: string;
  details?: any;
  stack?: string;
}

// ===== SEARCH ENGINE TYPES =====

export interface SearchResult {
  position: number;
  url: string;
  title: string;
  snippet: string;
  isAd?: boolean;
  features?: string[]; // sitelinks, rating, etc.
}

export interface SearchQuery {
  text: string;
  engine: 'yandex' | 'google';
  region?: string;
  language?: string;
  device?: 'desktop' | 'mobile';
  page?: number;
}

// ===== ALERT TYPES =====

export interface Alert {
  id: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  type: string;
  message: string;
  details?: any;
  
  createdAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  
  actions?: string[];
}

// ===== SYSTEM TYPES =====

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  components: Record<string, ComponentHealth>;
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  metrics?: Record<string, number>;
  lastCheck: Date;
}

// ===== REPORT TYPES =====

export interface Report {
  id: string;
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  period: {
    start: Date;
    end: Date;
  };
  
  summary: {
    tasksCompleted: number;
    searchesPerformed: number;
    positionsImproved: number;
    averagePositionChange: number;
    totalCost: number;
    roi: number;
  };
  
  details: {
    topQueries: Array<{
      query: string;
      searches: number;
      currentPosition: number;
      change: number;
    }>;
    profilePerformance: Array<{
      profileId: string;
      tasks: number;
      successRate: number;
      health: number;
    }>;
    costBreakdown: {
      proxies: number;
      captcha: number;
      infrastructure: number;
    };
  };
  
  generatedAt: Date;
}