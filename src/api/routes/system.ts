import { Router, Request, Response } from 'express';
import { ProfileManager } from '../../core/ProfileManager';
import { TaskScheduler } from '../../core/TaskScheduler';
import { MetricsService } from '../../services/MetricsService';
import { DatabaseService } from '../../services/DatabaseService';
import { asyncHandler } from '../middleware/error';
import { requireRole } from '../middleware/auth';
import { createLogger } from '../../utils/logger';
import { emergencyStop } from '../../utils/shutdown';
import { config } from '../../config';
import os from 'os';

const logger = createLogger('SystemRoutes');

interface SystemRoutesOptions {
  profileManager: ProfileManager;
  taskScheduler: TaskScheduler;
  metricsService: MetricsService;
  db: DatabaseService;
}

export function systemRoutes(options: SystemRoutesOptions): Router {
  const router = Router();
  const { profileManager, taskScheduler, metricsService, db } = options;
  
  // GET /system/status - Get system status
  router.get('/status', asyncHandler(async (req: Request, res: Response) => {
    const [profileStats, queueStats, dbPing] = await Promise.all([
      db.getProfileStats(),
      taskScheduler.getQueueStats(),
      db.ping()
    ]);
    
    const systemInfo = {
      status: 'healthy',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date(),
      
      resources: {
        cpu: {
          usage: process.cpuUsage(),
          loadAverage: os.loadavg(),
          cores: os.cpus().length
        },
        memory: {
          ...process.memoryUsage(),
          total: os.totalmem(),
          free: os.freemem(),
          usage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
        }
      },
      
      components: {
        database: {
          status: dbPing < 100 ? 'healthy' : 'degraded',
          responseTime: dbPing,
          connections: await db.mongoClient.db().admin().serverStatus()
            .then(s => s.connections?.current)
            .catch(() => null)
        },
        
        taskQueue: {
          status: queueStats.failed < queueStats.completed * 0.1 ? 'healthy' : 'degraded',
          ...queueStats
        },
        
        profiles: {
          total: profileStats.reduce((sum, s) => sum + s.count, 0),
          byStatus: Object.fromEntries(
            profileStats.map(s => [s._id, s.count])
          )
        },
        
        browserPool: {
          status: 'healthy', // Would be populated by BrowserPool
          active: 0,
          available: 0
        },
        
        proxyService: {
          status: 'healthy', // Would be populated by ProxyService
          active: 0,
          blacklisted: 0
        }
      }
    };
    
    // Determine overall status
    const unhealthyComponents = Object.values(systemInfo.components)
      .filter(c => c.status === 'unhealthy').length;
    
    if (unhealthyComponents > 0) {
      systemInfo.status = 'unhealthy';
    } else if (Object.values(systemInfo.components).some(c => c.status === 'degraded')) {
      systemInfo.status = 'degraded';
    }
    
    res.json({
      success: true,
      data: systemInfo
    });
  }));
  
  // POST /system/start - Start system
  router.post('/start', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
    logger.info('System start requested via API');
    
    // This would typically restart stopped services
    // For now, we'll just log and return success
    
    res.json({
      success: true,
      message: 'System start initiated'
    });
  }));
  
  // POST /system/stop - Stop system gracefully
  router.post('/stop', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
    const { force = false, reason = 'API request' } = req.body;
    
    logger.warn('System stop requested via API', { force, reason });
    
    // Send response before stopping
    res.json({
      success: true,
      message: 'System shutdown initiated'
    });
    
    // Give time for response to be sent
    setTimeout(() => {
      if (force) {
        emergencyStop(reason);
      } else {
        process.emit('SIGTERM', 'SIGTERM');
      }
    }, 1000);
  }));
  
  // POST /system/restart - Restart system
  router.post('/restart', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
    logger.info('System restart requested via API');
    
    res.json({
      success: true,
      message: 'System restart initiated'
    });
    
    // PM2 will automatically restart the process
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }));
  
  // POST /system/emergency-stop - Emergency stop
  router.post('/emergency-stop', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
    const { reason = 'Emergency stop via API' } = req.body;
    
    logger.error('Emergency stop requested', { reason });
    
    res.json({
      success: true,
      message: 'Emergency stop initiated'
    });
    
    setTimeout(() => {
      emergencyStop(reason);
    }, 500);
  }));
  
  // GET /system/config - Get non-sensitive configuration
  router.get('/config', asyncHandler(async (req: Request, res: Response) => {
    const safeConfig = {
      environment: config.NODE_ENV,
      app: {
        name: config.APP_NAME,
        port: config.PORT,
        logLevel: config.LOG_LEVEL
      },
      limits: {
        maxProfiles: config.MAX_PROFILES,
        maxConcurrentTasks: config.MAX_CONCURRENT_TASKS,
        maxDailySearches: config.MAX_DAILY_SEARCHES,
        browserPoolSize: config.BROWSER_POOL_SIZE
      },
      features: {
        autoRecovery: config.ENABLE_AUTO_RECOVERY,
        proxyValidation: config.ENABLE_PROXY_VALIDATION,
        positionTracking: config.ENABLE_POSITION_TRACKING,
        costTracking: config.ENABLE_COST_TRACKING
      },
      search: {
        yandexRegion: config.YANDEX_REGION,
        googleLocation: config.GOOGLE_LOCATION,
        maxSearchPages: config.MAX_SEARCH_PAGES
      }
    };
    
    res.json({
      success: true,
      data: safeConfig
    });
  }));
  
  // PUT /system/config - Update configuration
  router.put('/config', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
    const allowedUpdates = [
      'MAX_CONCURRENT_TASKS',
      'BROWSER_POOL_SIZE',
      'LOG_LEVEL',
      'ENABLE_AUTO_RECOVERY',
      'ENABLE_PROXY_VALIDATION'
    ];
    
    const updates: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(req.body)) {
      if (allowedUpdates.includes(key)) {
        process.env[key] = String(value);
        updates[key] = value;
      }
    }
    
    logger.info('Configuration updated', updates);
    
    res.json({
      success: true,
      message: 'Configuration updated',
      updated: updates
    });
  }));
  
  // GET /system/logs - Get recent logs
  router.get('/logs', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
    const { 
      level = 'info',
      limit = 100,
      since
    } = req.query;
    
    // This would typically read from log files
    // For now, return a placeholder
    res.json({
      success: true,
      data: {
        logs: [],
        message: 'Log retrieval not implemented in this version'
      }
    });
  }));
  
  // POST /system/maintenance - Toggle maintenance mode
  router.post('/maintenance', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
    const { enabled = true, message } = req.body;
    
    // This would set a flag that the maintenance middleware checks
    process.env.MAINTENANCE_MODE = String(enabled);
    if (message) {
      process.env.MAINTENANCE_MESSAGE = message;
    }
    
    logger.info(`Maintenance mode ${enabled ? 'enabled' : 'disabled'}`);
    
    res.json({
      success: true,
      message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`
    });
  }));
  
  // POST /system/backup - Create backup
  router.post('/backup', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
    const { collections } = req.body;
    
    logger.info('Creating system backup');
    
    const backupId = await db.createBackup(collections);
    
    res.json({
      success: true,
      data: {
        backupId,
        timestamp: new Date()
      }
    });
  }));
  
  // POST /system/restore - Restore from backup
  router.post('/restore', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
    const { backupId } = req.body;
    
    if (!backupId) {
      return res.status(400).json({
        success: false,
        error: 'Backup ID is required'
      });
    }
    
    logger.warn('Restoring system from backup', { backupId });
    
    await db.restoreBackup(backupId);
    
    res.json({
      success: true,
      message: 'Backup restored successfully'
    });
  }));
  
  // GET /system/diagnostics - Run diagnostics
  router.get('/diagnostics', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
    const diagnostics = {
      timestamp: new Date(),
      checks: [] as any[]
    };
    
    // Check database connection
    try {
      const ping = await db.ping();
      diagnostics.checks.push({
        name: 'Database Connection',
        status: 'pass',
        responseTime: ping
      });
    } catch (error) {
      diagnostics.checks.push({
        name: 'Database Connection',
        status: 'fail',
        error: error.message
      });
    }
    
    // Check Redis connection
    try {
      await db.getCached('test');
      diagnostics.checks.push({
        name: 'Redis Connection',
        status: 'pass'
      });
    } catch (error) {
      diagnostics.checks.push({
        name: 'Redis Connection',
        status: 'fail',
        error: error.message
      });
    }
    
    // Check disk space
    const diskUsage = await getDiskUsage();
    diagnostics.checks.push({
      name: 'Disk Space',
      status: diskUsage.available > 1024 * 1024 * 1024 ? 'pass' : 'warn', // 1GB
      details: diskUsage
    });
    
    // Check memory usage
    const memUsage = process.memoryUsage();
    diagnostics.checks.push({
      name: 'Memory Usage',
      status: memUsage.heapUsed < config.MEMORY_LIMIT * 1024 * 1024 * 0.9 ? 'pass' : 'warn',
      details: memUsage
    });
    
    res.json({
      success: true,
      data: diagnostics
    });
  }));
  
  // POST /system/cleanup - Clean up old data
  router.post('/cleanup', requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
    const { days = 30 } = req.body;
    
    logger.info(`Cleaning up data older than ${days} days`);
    
    await db.cleanupOldData(days);
    
    res.json({
      success: true,
      message: `Cleaned up data older than ${days} days`
    });
  }));
  
  return router;
}

// Helper function to get disk usage
async function getDiskUsage(): Promise<any> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  try {
    const { stdout } = await execAsync('df -B1 /');
    const lines = stdout.trim().split('\n');
    const data = lines[1].split(/\s+/);
    
    return {
      total: parseInt(data[1]),
      used: parseInt(data[2]),
      available: parseInt(data[3]),
      usagePercent: parseInt(data[4])
    };
  } catch (error) {
    return {
      error: 'Failed to get disk usage'
    };
  }
}