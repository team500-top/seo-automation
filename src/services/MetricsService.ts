import { EventEmitter } from 'events';
import { register, collectDefaultMetrics, Counter, Gauge, Histogram, Summary } from 'prom-client';
import { DatabaseService } from './DatabaseService';
import { createLogger, Logger } from '../utils/logger';
import { Task, TaskResult, Profile, Metrics } from '../types';
import { config } from '../config';

export class MetricsService extends EventEmitter {
  private logger: Logger;
  private db?: DatabaseService;
  
  // Prometheus metrics
  private metrics = {
    // Counters
    tasksTotal: new Counter({
      name: 'seo_tasks_total',
      help: 'Total number of tasks',
      labelNames: ['type', 'status']
    }),
    
    searchesTotal: new Counter({
      name: 'seo_searches_total',
      help: 'Total number of searches',
      labelNames: ['engine', 'result']
    }),
    
    captchasTotal: new Counter({
      name: 'seo_captchas_total',
      help: 'Total number of captchas',
      labelNames: ['type', 'result']
    }),
    
    // Gauges
    profilesActive: new Gauge({
      name: 'seo_profiles_active',
      help: 'Number of active profiles',
      labelNames: ['status']
    }),
    
    searchPosition: new Gauge({
      name: 'seo_search_position',
      help: 'Current search position',
      labelNames: ['query', 'engine', 'domain']
    }),
    
    systemResources: new Gauge({
      name: 'seo_system_resources',
      help: 'System resource usage',
      labelNames: ['resource']
    }),
    
    proxyHealth: new Gauge({
      name: 'seo_proxy_health',
      help: 'Proxy health status',
      labelNames: ['provider', 'region']
    }),
    
    // Histograms
    taskDuration: new Histogram({
      name: 'seo_task_duration_seconds',
      help: 'Task execution duration',
      labelNames: ['type'],
      buckets: [10, 30, 60, 120, 300, 600]
    }),
    
    searchLatency: new Histogram({
      name: 'seo_search_latency_seconds',
      help: 'Search request latency',
      labelNames: ['engine'],
      buckets: [1, 2, 5, 10, 20, 30]
    }),
    
    // Summary
    profileHealth: new Summary({
      name: 'seo_profile_health_score',
      help: 'Profile health scores',
      percentiles: [0.5, 0.9, 0.99]
    })
  };
  
  private metricsCache: Map<string, any> = new Map();
  private updateInterval?: NodeJS.Timer;
  
  constructor(db?: DatabaseService) {
    super();
    this.logger = createLogger('MetricsService');
    this.db = db;
    
    // Collect default Node.js metrics
    collectDefaultMetrics();
  }
  
  async start(): Promise<void> {
    this.logger.info('Starting MetricsService...');
    
    // Start periodic updates
    this.startPeriodicUpdates();
    
    // Initialize current metrics
    await this.updateCurrentMetrics();
    
    this.logger.info('MetricsService started');
  }
  
  async stop(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    // Clear metrics registry
    register.clear();
  }
  
  // === Task Metrics ===
  
  async recordTaskCompletion(task: Task, result: TaskResult, duration: number): Promise<void> {
    // Update counters
    this.metrics.tasksTotal.inc({
      type: task.type,
      status: result.success ? 'success' : 'failed'
    });
    
    // Record duration
    this.metrics.taskDuration.observe(
      { type: task.type },
      duration / 1000 // Convert to seconds
    );
    
    // Record search-specific metrics
    if (task.type === 'search' && result.searchResult) {
      this.metrics.searchesTotal.inc({
        engine: task.config.search!.engine,
        result: result.searchResult.clicked ? 'clicked' : 'not_clicked'
      });
      
      if (result.searchResult.position) {
        this.metrics.searchPosition.set(
          {
            query: task.config.search!.query,
            engine: task.config.search!.engine,
            domain: task.config.search!.targetDomain || ''
          },
          result.searchResult.position
        );
        
        // Save position history
        if (this.db) {
          await this.savePositionHistory(
            task.config.search!.query,
            task.config.search!.engine,
            task.config.search!.targetDomain || '',
            result.searchResult.position
          );
        }
      }
    }
    
    // Record captcha metrics
    if (result.metrics?.captchaEncountered) {
      this.metrics.captchasTotal.inc({
        type: task.type,
        result: result.metrics.captchaSolved ? 'solved' : 'failed'
      });
    }
    
    // Emit event for real-time updates
    this.emit('task:completed', {
      task,
      result,
      duration
    });
    
    // Update cache
    await this.updateTaskMetrics();
  }
  
  // === Profile Metrics ===
  
  async updateProfileMetrics(profiles: Profile[]): Promise<void> {
    const statusCounts = {
      active: 0,
      warming: 0,
      suspended: 0,
      banned: 0
    };
    
    let totalHealth = 0;
    
    for (const profile of profiles) {
      statusCounts[profile.status]++;
      
      this.metrics.profileHealth.observe(profile.health.score);
      totalHealth += profile.health.score;
    }
    
    // Update gauges
    Object.entries(statusCounts).forEach(([status, count]) => {
      this.metrics.profilesActive.set({ status }, count);
    });
    
    // Cache summary
    this.metricsCache.set('profiles', {
      total: profiles.length,
      ...statusCounts,
      avgHealth: profiles.length > 0 ? totalHealth / profiles.length : 0
    });
  }
  
  // === System Metrics ===
  
  async updateSystemMetrics(): Promise<void> {
    const usage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Memory metrics
    this.metrics.systemResources.set(
      { resource: 'memory_heap_used' },
      usage.heapUsed / 1024 / 1024 // MB
    );
    
    this.metrics.systemResources.set(
      { resource: 'memory_heap_total' },
      usage.heapTotal / 1024 / 1024
    );
    
    // CPU metrics (simplified)
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000 / process.uptime() * 100;
    this.metrics.systemResources.set(
      { resource: 'cpu_usage' },
      Math.min(cpuPercent, 100)
    );
    
    // Cache for API
    this.metricsCache.set('resources', {
      cpu: cpuPercent,
      memory: (usage.heapUsed / usage.heapTotal) * 100,
      uptime: process.uptime()
    });
  }
  
  // === Position Tracking ===
  
  async getSearchPositions(domain: string): Promise<any[]> {
    if (!this.db) return [];
    
    const positions = await this.db.collection('searchPositions')
      .find({ domain })
      .sort({ timestamp: -1 })
      .limit(1000)
      .toArray();
    
    // Group by query and engine
    const grouped = positions.reduce((acc, pos) => {
      const key = `${pos.query}|${pos.engine}`;
      if (!acc[key]) {
        acc[key] = {
          query: pos.query,
          engine: pos.engine,
          current: pos.position,
          history: []
        };
      }
      acc[key].history.push({
        position: pos.position,
        timestamp: pos.timestamp
      });
      return acc;
    }, {});
    
    // Calculate changes
    return Object.values(grouped).map((item: any) => {
      const previous = item.history[1]?.position || item.current;
      return {
        ...item,
        previous,
        change: previous - item.current,
        trend: this.calculateTrend(item.history)
      };
    });
  }
  
  // === Cost Tracking ===
  
  async getCostAnalysis(period: { start: Date; end: Date }): Promise<any> {
    const costs = {
      proxies: 0,
      captcha: 0,
      infrastructure: 0
    };
    
    if (this.db) {
      // Get captcha costs
      const captchaTasks = await this.db.captcha.find({
        solvedAt: { $gte: period.start, $lte: period.end }
      }).toArray();
      
      costs.captcha = captchaTasks.reduce((sum, task) => sum + (task.cost || 0), 0);
      
      // Estimate proxy costs
      const days = (period.end.getTime() - period.start.getTime()) / (1000 * 60 * 60 * 24);
      costs.proxies = days * 85; // $85/day estimate
      
      // Infrastructure costs
      costs.infrastructure = days * 15; // $15/day estimate
    }
    
    const totalCost = Object.values(costs).reduce((sum, cost) => sum + cost, 0);
    
    // Calculate cost per task
    const taskCount = await this.db?.tasks.countDocuments({
      completedAt: { $gte: period.start, $lte: period.end }
    }) || 1;
    
    return {
      total: totalCost,
      breakdown: costs,
      daily_average: totalCost / Math.max(days, 1),
      cost_per_task: totalCost / taskCount
    };
  }
  
  // === Real-time Metrics ===
  
  async getCurrentMetrics(): Promise<Metrics> {
    const [profiles, tasks, searches, resources] = await Promise.all([
      this.metricsCache.get('profiles') || {},
      this.metricsCache.get('tasks') || {},
      this.metricsCache.get('searches') || {},
      this.metricsCache.get('resources') || {}
    ]);
    
    return {
      timestamp: new Date(),
      profiles,
      tasks,
      searches,
      resources: {
        ...resources,
        browsers: await this.getBrowserMetrics(),
        proxies: await this.getProxyMetrics()
      },
      costs: await this.getDailyCosts()
    };
  }
  
  // === Prometheus Export ===
  
  async getPrometheusMetrics(): Promise<string> {
    return register.metrics();
  }
  
  // === Alerts ===
  
  async sendAlert(alert: {
    level: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    details?: any;
  }): Promise<void> {
    this.logger[alert.level](alert.message, alert.details);
    
    // Save to database
    if (this.db) {
      await this.db.alerts.insertOne({
        ...alert,
        createdAt: new Date()
      });
    }
    
    // Emit for real-time notification
    this.emit('alert:new', alert);
    
    // Send Telegram notification for critical alerts
    if (alert.level === 'critical' && config.TELEGRAM_BOT_TOKEN) {
      await this.sendTelegramAlert(alert);
    }
  }
  
  // === Private Methods ===
  
  private startPeriodicUpdates(): void {
    this.updateInterval = setInterval(async () => {
      try {
        await this.updateCurrentMetrics();
        await this.updateSystemMetrics();
        
        // Check for anomalies
        await this.checkSystemHealth();
        
      } catch (error) {
        this.logger.error('Failed to update metrics:', error);
      }
    }, 30000); // Every 30 seconds
  }
  
  private async updateCurrentMetrics(): Promise<void> {
    if (!this.db) return;
    
    // Update task metrics
    await this.updateTaskMetrics();
    
    // Update search metrics
    await this.updateSearchMetrics();
    
    // Emit updates
    const metrics = await this.getCurrentMetrics();
    this.emit('metrics:updated', metrics);
  }
  
  private async updateTaskMetrics(): Promise<void> {
    if (!this.db) return;
    
    const stats = await this.db.getTaskStats();
    
    const summary = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      total: 0,
      successRate: 0,
      avgDuration: 0
    };
    
    stats.forEach(stat => {
      summary[stat._id] = stat.count;
      summary.total += stat.count;
      
      if (stat._id === 'completed') {
        summary.avgDuration = stat.avgDuration || 0;
      }
    });
    
    if (summary.completed + summary.failed > 0) {
      summary.successRate = (summary.completed / (summary.completed + summary.failed)) * 100;
    }
    
    this.metricsCache.set('tasks', summary);
  }
  
  private async updateSearchMetrics(): Promise<void> {
    if (!this.db) return;
    
    const recentSearches = await this.db.tasks.find({
      type: 'search',
      completedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }).toArray();
    
    const byEngine = {
      yandex: 0,
      google: 0
    };
    
    recentSearches.forEach(task => {
      const engine = task.config.search?.engine;
      if (engine) {
        byEngine[engine]++;
      }
    });
    
    this.metricsCache.set('searches', {
      total: recentSearches.length,
      byEngine
    });
  }
  
  private async getBrowserMetrics(): Promise<any> {
    // This would be provided by BrowserPool
    return {
      active: 8,
      available: 2,
      crashed: 0
    };
  }
  
  private async getProxyMetrics(): Promise<any> {
    // This would be provided by ProxyService
    return {
      active: 150,
      working: 145,
      blacklisted: 12
    };
  }
  
  private async getDailyCosts(): Promise<any> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return this.getCostAnalysis({ start: today, end: tomorrow });
  }
  
  private calculateTrend(history: Array<{ position: number; timestamp: Date }>): string {
    if (history.length < 2) return 'stable';
    
    const recent = history.slice(0, 5);
    const older = history.slice(5, 10);
    
    if (older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((sum, h) => sum + h.position, 0) / recent.length;
    const olderAvg = older.reduce((sum, h) => sum + h.position, 0) / older.length;
    
    const change = olderAvg - recentAvg;
    
    if (change > 2) return 'improving';
    if (change < -2) return 'declining';
    return 'stable';
  }
  
  private async savePositionHistory(
    query: string,
    engine: string,
    domain: string,
    position: number
  ): Promise<void> {
    if (!this.db) return;
    
    await this.db.collection('searchPositions').insertOne({
      query,
      engine,
      domain,
      position,
      timestamp: new Date()
    });
  }
  
  private async checkSystemHealth(): Promise<void> {
    const metrics = await this.getCurrentMetrics();
    
    // Check CPU usage
    if (metrics.resources.cpu > 90) {
      await this.sendAlert({
        level: 'warning',
        message: 'High CPU usage detected',
        details: { cpu: metrics.resources.cpu }
      });
    }
    
    // Check memory usage
    if (metrics.resources.memory > 85) {
      await this.sendAlert({
        level: 'warning',
        message: 'High memory usage detected',
        details: { memory: metrics.resources.memory }
      });
    }
    
    // Check task success rate
    if (metrics.tasks.successRate < 80 && metrics.tasks.total > 100) {
      await this.sendAlert({
        level: 'error',
        message: 'Low task success rate',
        details: { 
          successRate: metrics.tasks.successRate,
          failed: metrics.tasks.failed 
        }
      });
    }
    
    // Check proxy health
    const proxyHealthRate = metrics.resources.proxies.working / metrics.resources.proxies.active * 100;
    if (proxyHealthRate < 70) {
      await this.sendAlert({
        level: 'critical',
        message: 'Critical proxy failure rate',
        details: { 
          working: metrics.resources.proxies.working,
          total: metrics.resources.proxies.active
        }
      });
    }
  }
  
  private async sendTelegramAlert(alert: any): Promise<void> {
    if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) return;
    
    const axios = (await import('axios')).default;
    
    const icons = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      critical: '🚨'
    };
    
    const message = `${icons[alert.level]} *${alert.level.toUpperCase()}*\n\n${alert.message}\n\n${
      alert.details ? '```\n' + JSON.stringify(alert.details, null, 2) + '\n```' : ''
    }`;
    
    try {
      await axios.post(
        `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: config.TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'Markdown'
        }
      );
    } catch (error) {
      this.logger.error('Failed to send Telegram alert:', error);
    }
  }
}