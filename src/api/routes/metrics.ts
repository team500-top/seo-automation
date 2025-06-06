import { Router, Request, Response } from 'express';
import { MetricsService } from '../../services/MetricsService';
import { asyncHandler } from '../middleware/error';
import { createLogger } from '../../utils/logger';

const logger = createLogger('MetricsRoutes');

export function metricsRoutes(metricsService: MetricsService): Router {
  const router = Router();
  
  // GET /metrics/current - Get current metrics snapshot
  router.get('/current', asyncHandler(async (req: Request, res: Response) => {
    const metrics = await metricsService.getCurrentMetrics();
    
    res.json({
      success: true,
      data: metrics
    });
  }));
  
  // GET /metrics/positions - Get search position tracking
  router.get('/positions', asyncHandler(async (req: Request, res: Response) => {
    const { domain, engine, period = '7d' } = req.query;
    
    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'Domain parameter is required'
      });
    }
    
    const positions = await metricsService.getSearchPositions(domain as string);
    
    // Filter by engine if specified
    const filtered = engine 
      ? positions.filter(p => p.engine === engine)
      : positions;
    
    res.json({
      success: true,
      data: filtered
    });
  }));
  
  // GET /metrics/performance - Get performance metrics
  router.get('/performance', asyncHandler(async (req: Request, res: Response) => {
    const { 
      period = '24h',
      interval = 'hour'
    } = req.query;
    
    const startDate = getStartDate(period as string);
    const endDate = new Date();
    
    // Get aggregated performance data
    const performance = await metricsService.db?.metrics.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
          type: 'performance'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: interval === 'hour' ? '%Y-%m-%d %H:00' : '%Y-%m-%d',
              date: '$timestamp'
            }
          },
          avgCpu: { $avg: '$data.cpu' },
          avgMemory: { $avg: '$data.memory' },
          avgResponseTime: { $avg: '$data.responseTime' },
          maxCpu: { $max: '$data.cpu' },
          maxMemory: { $max: '$data.memory' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]).toArray();
    
    res.json({
      success: true,
      data: {
        period: { start: startDate, end: endDate },
        interval,
        dataPoints: performance
      }
    });
  }));
  
  // GET /metrics/costs - Get cost analysis
  router.get('/costs', asyncHandler(async (req: Request, res: Response) => {
    const { 
      period = '30d',
      breakdown = true 
    } = req.query;
    
    const startDate = getStartDate(period as string);
    const endDate = new Date();
    
    const costs = await metricsService.getCostAnalysis({
      start: startDate,
      end: endDate
    });
    
    res.json({
      success: true,
      data: breakdown === 'false' 
        ? { total: costs.total, daily_average: costs.daily_average }
        : costs
    });
  }));
  
  // GET /metrics/profiles - Get profile metrics
  router.get('/profiles', asyncHandler(async (req: Request, res: Response) => {
    const stats = await metricsService.db?.getProfileStats();
    
    const summary = {
      total: 0,
      byStatus: {} as Record<string, any>,
      avgHealth: 0
    };
    
    stats?.forEach(stat => {
      summary.byStatus[stat._id] = {
        count: stat.count,
        avgHealth: stat.avgHealth
      };
      summary.total += stat.count;
    });
    
    // Calculate overall average health
    const totalHealthSum = stats?.reduce((sum, s) => sum + (s.avgHealth * s.count), 0) || 0;
    summary.avgHealth = summary.total > 0 ? totalHealthSum / summary.total : 0;
    
    res.json({
      success: true,
      data: summary
    });
  }));
  
  // GET /metrics/tasks - Get task metrics
  router.get('/tasks', asyncHandler(async (req: Request, res: Response) => {
    const { 
      period = '24h',
      group_by = 'type' 
    } = req.query;
    
    const startDate = getStartDate(period as string);
    
    const stats = await metricsService.db?.tasks.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: `$${group_by}`,
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          },
          avgDuration: {
            $avg: '$result.metrics.duration'
          },
          successRate: {
            $avg: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          }
        }
      }
    ]).toArray();
    
    res.json({
      success: true,
      data: {
        period: { start: startDate, end: new Date() },
        groupBy: group_by,
        stats
      }
    });
  }));
  
  // GET /metrics/searches - Get search metrics
  router.get('/searches', asyncHandler(async (req: Request, res: Response) => {
    const { period = '7d' } = req.query;
    
    const startDate = getStartDate(period as string);
    
    const searches = await metricsService.db?.tasks.aggregate([
      {
        $match: {
          type: 'search',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            engine: '$config.search.engine',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
          },
          count: { $sum: 1 },
          clicked: {
            $sum: { $cond: ['$result.searchResult.clicked', 1, 0] }
          },
          avgPosition: {
            $avg: '$result.searchResult.position'
          }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
    ]).toArray();
    
    res.json({
      success: true,
      data: searches
    });
  }));
  
  // GET /metrics/captcha - Get captcha metrics
  router.get('/captcha', asyncHandler(async (req: Request, res: Response) => {
    const { period = '7d' } = req.query;
    
    const startDate = getStartDate(period as string);
    
    const captchaStats = await metricsService.db?.captcha.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            type: '$type',
            service: '$service'
          },
          total: { $sum: 1 },
          solved: {
            $sum: { $cond: [{ $eq: ['$status', 'solved'] }, 1, 0] }
          },
          totalCost: { $sum: '$cost' },
          avgSolveTime: {
            $avg: {
              $subtract: ['$solvedAt', '$createdAt']
            }
          }
        }
      }
    ]).toArray();
    
    res.json({
      success: true,
      data: captchaStats
    });
  }));
  
  // GET /metrics/proxies - Get proxy metrics
  router.get('/proxies', asyncHandler(async (req: Request, res: Response) => {
    const proxyStats = await metricsService.db?.proxies.aggregate([
      {
        $group: {
          _id: {
            provider: '$provider',
            status: '$status'
          },
          count: { $sum: 1 },
          avgResponseTime: { $avg: '$stats.avgResponseTime' },
          totalRequests: { $sum: '$stats.requests' },
          totalFailures: { $sum: '$stats.failures' }
        }
      }
    ]).toArray();
    
    res.json({
      success: true,
      data: proxyStats
    });
  }));
  
  // GET /metrics/roi - Calculate ROI
  router.get('/roi', asyncHandler(async (req: Request, res: Response) => {
    const { period = '30d' } = req.query;
    
    const startDate = getStartDate(period as string);
    const endDate = new Date();
    
    // Get costs
    const costs = await metricsService.getCostAnalysis({
      start: startDate,
      end: endDate
    });
    
    // Get position improvements
    const improvements = await metricsService.db?.collection('searchPositions').aggregate([
      {
        $match: {
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$query',
          startPosition: { $first: '$position' },
          endPosition: { $last: '$position' },
          improvement: {
            $subtract: ['$startPosition', '$endPosition']
          }
        }
      },
      {
        $match: {
          improvement: { $gt: 0 }
        }
      }
    ]).toArray();
    
    const totalImprovement = improvements?.reduce((sum, i) => sum + i.improvement, 0) || 0;
    const estimatedValue = totalImprovement * 50; // $50 estimated value per position
    
    const roi = costs.total > 0 
      ? ((estimatedValue - costs.total) / costs.total) * 100
      : 0;
    
    res.json({
      success: true,
      data: {
        period: { start: startDate, end: endDate },
        costs: costs.total,
        estimatedValue,
        roi: Math.round(roi * 100) / 100,
        improvements: {
          total: totalImprovement,
          queries: improvements?.length || 0
        }
      }
    });
  }));
  
  // GET /metrics/alerts - Get recent alerts
  router.get('/alerts', asyncHandler(async (req: Request, res: Response) => {
    const { 
      level,
      limit = 50,
      acknowledged = null
    } = req.query;
    
    const query: any = {};
    if (level) query.level = level;
    if (acknowledged !== null) {
      query.acknowledgedAt = acknowledged === 'true' ? { $exists: true } : { $exists: false };
    }
    
    const alerts = await metricsService.db?.alerts
      .find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string))
      .toArray();
    
    res.json({
      success: true,
      data: alerts
    });
  }));
  
  // POST /metrics/alerts/:id/acknowledge - Acknowledge alert
  router.post('/alerts/:id/acknowledge', asyncHandler(async (req: Request, res: Response) => {
    await metricsService.db?.alerts.updateOne(
      { _id: req.params.id },
      { $set: { acknowledgedAt: new Date() } }
    );
    
    res.json({
      success: true,
      message: 'Alert acknowledged'
    });
  }));
  
  return router;
}

// Helper function to parse period strings
function getStartDate(period: string): Date {
  const now = new Date();
  
  const match = period.match(/^(\d+)([dhm])$/);
  if (match) {
    const [, value, unit] = match;
    const ms = {
      'd': 24 * 60 * 60 * 1000,
      'h': 60 * 60 * 1000,
      'm': 60 * 1000
    }[unit] || 0;
    
    return new Date(Date.now() - parseInt(value) * ms);
  }
  
  // Default periods
  switch (period) {
    case 'today':
      now.setHours(0, 0, 0, 0);
      return now;
    case 'week':
      return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h default
  }
}