import 'dotenv/config';
import { createLogger } from './utils/logger';
import { validateEnvironment } from './config/validators';
import { DatabaseService } from './services/DatabaseService';
import { ProfileManager } from './core/ProfileManager';
import { TaskScheduler } from './core/TaskScheduler';
import { BrowserPool } from './core/BrowserPool';
import { ProxyService } from './services/ProxyService';
import { MetricsService } from './services/MetricsService';
import { APIServer } from './api/server';
import { gracefulShutdown } from './utils/shutdown';

const logger = createLogger('Main');

class SEOAutomationSystem {
  private db: DatabaseService;
  private profileManager: ProfileManager;
  private taskScheduler: TaskScheduler;
  private browserPool: BrowserPool;
  private proxyService: ProxyService;
  private metricsService: MetricsService;
  private apiServer: APIServer;
  private isShuttingDown = false;

  async start() {
    try {
      logger.info('🚀 Starting SEO Automation System...');

      // Validate environment
      logger.info('Validating environment configuration...');
      validateEnvironment();

      // Initialize database
      logger.info('Connecting to database...');
      this.db = new DatabaseService();
      await this.db.connect();

      // Initialize services
      logger.info('Initializing services...');
      this.proxyService = new ProxyService();
      await this.proxyService.initialize();

      this.metricsService = new MetricsService();
      await this.metricsService.start();

      this.browserPool = new BrowserPool({
        maxBrowsers: parseInt(process.env.BROWSER_POOL_SIZE || '10'),
        headless: process.env.BROWSER_HEADLESS === 'true',
        proxyService: this.proxyService
      });
      await this.browserPool.initialize();

      // Initialize core components
      logger.info('Initializing core components...');
      this.profileManager = new ProfileManager(this.db, this.browserPool);
      await this.profileManager.initialize();

      this.taskScheduler = new TaskScheduler({
        db: this.db,
        profileManager: this.profileManager,
        browserPool: this.browserPool,
        metricsService: this.metricsService
      });
      await this.taskScheduler.start();

      // Start API server
      logger.info('Starting API server...');
      this.apiServer = new APIServer({
        profileManager: this.profileManager,
        taskScheduler: this.taskScheduler,
        metricsService: this.metricsService,
        db: this.db
      });
      await this.apiServer.start();

      // Setup graceful shutdown
      this.setupShutdownHandlers();

      logger.info('✅ SEO Automation System started successfully!');
      logger.info(`📊 API Server: http://localhost:${process.env.PORT || 3000}`);
      logger.info(`📈 Metrics: http://localhost:${process.env.PROMETHEUS_PORT || 9090}`);

      // Start health check
      this.startHealthCheck();

    } catch (error) {
      logger.error('Failed to start system', error);
      process.exit(1);
    }
  }

  private setupShutdownHandlers() {
    const shutdownHandler = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      logger.info(`Received ${signal}, starting graceful shutdown...`);

      await gracefulShutdown(async () => {
        // Stop accepting new tasks
        if (this.taskScheduler) {
          logger.info('Stopping task scheduler...');
          await this.taskScheduler.stop();
        }

        // Close browser pool
        if (this.browserPool) {
          logger.info('Closing browser pool...');
          await this.browserPool.shutdown();
        }

        // Stop API server
        if (this.apiServer) {
          logger.info('Stopping API server...');
          await this.apiServer.stop();
        }

        // Close database connections
        if (this.db) {
          logger.info('Closing database connections...');
          await this.db.disconnect();
        }

        // Stop metrics service
        if (this.metricsService) {
          logger.info('Stopping metrics service...');
          await this.metricsService.stop();
        }

        logger.info('✅ Graceful shutdown completed');
      });

      process.exit(0);
    };

    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    process.on('SIGUSR2', () => shutdownHandler('SIGUSR2'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdownHandler('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      shutdownHandler('unhandledRejection');
    });
  }

  private startHealthCheck() {
    setInterval(async () => {
      try {
        const health = await this.checkSystemHealth();
        
        if (health.status === 'unhealthy') {
          logger.error('System health check failed', health);
          // Trigger alerts
          await this.metricsService.sendAlert({
            level: 'critical',
            message: 'System health check failed',
            details: health
          });
        } else if (health.status === 'degraded') {
          logger.warn('System health degraded', health);
        }
      } catch (error) {
        logger.error('Health check error', error);
      }
    }, parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'));
  }

  private async checkSystemHealth() {
    const health = {
      status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
      timestamp: new Date(),
      components: {} as Record<string, any>
    };

    // Check database
    try {
      const dbPing = await this.db.ping();
      health.components.database = { status: 'healthy', responseTime: dbPing };
    } catch (error) {
      health.components.database = { status: 'unhealthy', error: error.message };
      health.status = 'unhealthy';
    }

    // Check browser pool
    const browserStats = this.browserPool.getStats();
    health.components.browserPool = {
      status: browserStats.available > 0 ? 'healthy' : 'degraded',
      ...browserStats
    };

    // Check proxy service
    const proxyStats = await this.proxyService.getStats();
    health.components.proxyService = {
      status: proxyStats.workingProxies > 10 ? 'healthy' : 'degraded',
      ...proxyStats
    };

    // Check task queue
    const queueStats = await this.taskScheduler.getQueueStats();
    health.components.taskQueue = {
      status: queueStats.failed < queueStats.completed * 0.1 ? 'healthy' : 'degraded',
      ...queueStats
    };

    // Overall status
    const unhealthyComponents = Object.values(health.components)
      .filter(c => c.status === 'unhealthy').length;
    const degradedComponents = Object.values(health.components)
      .filter(c => c.status === 'degraded').length;

    if (unhealthyComponents > 0) {
      health.status = 'unhealthy';
    } else if (degradedComponents > 1) {
      health.status = 'degraded';
    }

    return health;
  }
}

// Start the system
if (require.main === module) {
  const system = new SEOAutomationSystem();
  system.start().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}