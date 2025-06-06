import { Router, Request, Response } from 'express';
import { TaskScheduler } from '../../core/TaskScheduler';
import { asyncHandler } from '../middleware/error';
import { validateApiRequest, apiSchemas } from '../../config/validators';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';
import { Task, TaskStatus } from '../../types';

const logger = createLogger('TaskRoutes');

export function taskRoutes(taskScheduler: TaskScheduler): Router {
  const router = Router();
  
  // GET /tasks - List tasks
  router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const {
      status,
      type,
      profile_id,
      priority,
      date_from,
      date_to,
      page = 1,
      limit = 20,
      sort = 'createdAt',
      order = 'desc'
    } = req.query;
    
    const query: any = {};
    
    if (status) query.status = status;
    if (type) query.type = type;
    if (profile_id) query.profileId = profile_id;
    if (priority) query.priority = parseInt(priority as string);
    
    if (date_from || date_to) {
      query.createdAt = {};
      if (date_from) query.createdAt.$gte = new Date(date_from as string);
      if (date_to) query.createdAt.$lte = new Date(date_to as string);
    }
    
    const tasks = await taskScheduler.options.db.tasks
      .find(query)
      .sort({ [sort as string]: order === 'desc' ? -1 : 1 })
      .skip((parseInt(page as string) - 1) * parseInt(limit as string))
      .limit(parseInt(limit as string))
      .toArray();
    
    const total = await taskScheduler.options.db.tasks.countDocuments(query);
    
    res.json({
      success: true,
      data: tasks,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  }));
  
  // GET /tasks/:id - Get task details
  router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const task = await taskScheduler.options.db.tasks.findOne({ id: req.params.id });
    
    if (!task) {
      throw new NotFoundError('Task', req.params.id);
    }
    
    res.json({
      success: true,
      data: task
    });
  }));
  
  // POST /tasks - Create task
  router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const validatedData = validateApiRequest(apiSchemas.createTask, req.body);
    
    const task = await taskScheduler.createTask(validatedData);
    
    res.status(201).json({
      success: true,
      data: task
    });
  }));
  
  // POST /tasks/bulk - Bulk create tasks
  router.post('/bulk', asyncHandler(async (req: Request, res: Response) => {
    const validatedData = validateApiRequest(apiSchemas.bulkCreateTasks, req.body);
    
    const tasks: Task[] = [];
    const profiles = await taskScheduler.options.profileManager.getHealthyProfiles(
      70,
      validatedData.options.profileCount
    );
    
    if (profiles.length === 0) {
      throw new ValidationError('No healthy profiles available');
    }
    
    // Create tasks for each query
    for (const taskData of validatedData.tasks) {
      // Distribute across profiles
      for (let i = 0; i < Math.min(validatedData.options.profileCount, profiles.length); i++) {
        const profile = profiles[i % profiles.length];
        
        const task = {
          type: taskData.type,
          profileId: profile.id,
          priority: validatedData.options.priority,
          config: {
            search: {
              engine: validatedData.options.engine,
              query: taskData.query,
              targetDomain: taskData.targetDomain,
              maxResultPages: 5
            }
          },
          schedule: validatedData.options.schedule === 'distributed' 
            ? {
                type: 'distributed' as const,
                distributionWindow: {
                  start: new Date(),
                  end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
                }
              }
            : { type: 'immediate' as const }
        };
        
        tasks.push(task as any);
      }
    }
    
    const createdTasks = await taskScheduler.bulkCreateTasks(tasks);
    
    res.status(201).json({
      success: true,
      data: {
        created: createdTasks.length,
        tasks: createdTasks.map(t => ({
          id: t.id,
          type: t.type,
          status: t.status,
          profileId: t.profileId
        }))
      }
    });
  }));
  
  // DELETE /tasks/:id - Cancel task
  router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
    await taskScheduler.cancelTask(req.params.id);
    
    res.json({
      success: true,
      message: 'Task cancelled successfully'
    });
  }));
  
  // POST /tasks/:id/cancel - Cancel task (alternative)
  router.post('/:id/cancel', asyncHandler(async (req: Request, res: Response) => {
    await taskScheduler.cancelTask(req.params.id);
    
    res.json({
      success: true,
      message: 'Task cancelled successfully'
    });
  }));
  
  // POST /tasks/:id/retry - Retry failed task
  router.post('/:id/retry', asyncHandler(async (req: Request, res: Response) => {
    await taskScheduler.retryTask(req.params.id);
    
    res.json({
      success: true,
      message: 'Task retry scheduled'
    });
  }));
  
  // GET /tasks/stats - Get task statistics
  router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
    const { period = 'today', group_by = 'status' } = req.query;
    
    const startDate = getStartDate(period as string);
    
    const stats = await taskScheduler.options.db.tasks.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: `$${group_by}`,
          count: { $sum: 1 },
          successRate: {
            $avg: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
            }
          },
          avgDuration: { $avg: '$result.metrics.duration' }
        }
      }
    ]).toArray();
    
    const queueStats = await taskScheduler.getQueueStats();
    
    res.json({
      success: true,
      data: {
        period: {
          start: startDate,
          end: new Date()
        },
        byGroup: stats,
        queue: queueStats,
        totals: {
          created: stats.reduce((sum, s) => sum + s.count, 0),
          successRate: stats.reduce((sum, s) => sum + s.successRate * s.count, 0) / 
                      stats.reduce((sum, s) => sum + s.count, 0) || 0
        }
      }
    });
  }));
  
  // POST /tasks/cancel-all - Cancel all pending tasks
  router.post('/cancel-all', asyncHandler(async (req: Request, res: Response) => {
    const { status = 'pending' } = req.body;
    
    const result = await taskScheduler.options.db.tasks.updateMany(
      { status: { $in: Array.isArray(status) ? status : [status] } },
      { $set: { status: TaskStatus.CANCELLED } }
    );
    
    res.json({
      success: true,
      data: {
        cancelled: result.modifiedCount
      }
    });
  }));
  
  // GET /tasks/timeline - Get task timeline
  router.get('/timeline', asyncHandler(async (req: Request, res: Response) => {
    const { hours = 24 } = req.query;
    
    const startDate = new Date(Date.now() - parseInt(hours as string) * 60 * 60 * 1000);
    
    const timeline = await taskScheduler.options.db.tasks.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            hour: { $hour: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          }
        }
      },
      {
        $sort: { '_id.day': 1, '_id.hour': 1 }
      }
    ]).toArray();
    
    res.json({
      success: true,
      data: timeline
    });
  }));
  
  // POST /tasks/search-batch - Create search tasks from file
  router.post('/search-batch', asyncHandler(async (req: Request, res: Response) => {
    const { queries, options = {} } = req.body;
    
    if (!Array.isArray(queries)) {
      throw new ValidationError('Queries must be an array');
    }
    
    const defaultOptions = {
      engine: 'yandex',
      profilesPerQuery: 10,
      schedule: 'distributed',
      priority: 5,
      maxResultPages: 5
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    
    const tasks = [];
    const profiles = await taskScheduler.options.profileManager.getHealthyProfiles(
      70,
      mergedOptions.profilesPerQuery * queries.length
    );
    
    for (const query of queries) {
      const { text, targetDomain, targetUrl } = 
        typeof query === 'string' 
          ? { text: query, targetDomain: null, targetUrl: null }
          : query;
      
      for (let i = 0; i < mergedOptions.profilesPerQuery; i++) {
        const profile = profiles[Math.floor(Math.random() * profiles.length)];
        
        tasks.push({
          type: 'search',
          profileId: profile.id,
          priority: mergedOptions.priority,
          config: {
            search: {
              engine: mergedOptions.engine,
              query: text,
              targetDomain,
              targetUrl,
              maxResultPages: mergedOptions.maxResultPages
            }
          },
          schedule: mergedOptions.schedule === 'distributed'
            ? {
                type: 'distributed',
                distributionWindow: {
                  start: new Date(),
                  end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                }
              }
            : { type: 'immediate' }
        });
      }
    }
    
    const createdTasks = await taskScheduler.bulkCreateTasks(tasks);
    
    res.status(201).json({
      success: true,
      data: {
        queriesProcessed: queries.length,
        tasksCreated: createdTasks.length,
        profilesUsed: new Set(createdTasks.map(t => t.profileId)).size
      }
    });
  }));
  
  return router;
}

// Helper function to get start date based on period
function getStartDate(period: string): Date {
  const now = new Date();
  
  switch (period) {
    case 'today':
      now.setHours(0, 0, 0, 0);
      return now;
    
    case 'week':
      now.setDate(now.getDate() - 7);
      return now;
    
    case 'month':
      now.setMonth(now.getMonth() - 1);
      return now;
    
    default:
      // Try to parse custom format like '7d', '24h'
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
      
      // Default to today
      now.setHours(0, 0, 0, 0);
      return now;
  }
}