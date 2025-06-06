import { Router, Request, Response } from 'express';
import { ProfileManager } from '../../core/ProfileManager';
import { asyncHandler } from '../middleware/error';
import { validateApiRequest, apiSchemas } from '../../config/validators';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';

const logger = createLogger('ProfileRoutes');

export function profileRoutes(profileManager: ProfileManager): Router {
  const router = Router();
  
  // GET /profiles - List profiles
  router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const { 
      status, 
      health_min, 
      health_max,
      region,
      page = 1, 
      limit = 20,
      sort = 'created',
      order = 'desc'
    } = req.query;
    
    const profiles = await profileManager.db.profiles.find({
      ...(status && { status }),
      ...(health_min && { 'health.score': { $gte: parseInt(health_min as string) } }),
      ...(health_max && { 'health.score': { $lte: parseInt(health_max as string) } }),
      ...(region && { 'identity.location.region': region })
    })
    .sort({ [sort as string]: order === 'desc' ? -1 : 1 })
    .skip((parseInt(page as string) - 1) * parseInt(limit as string))
    .limit(parseInt(limit as string))
    .toArray();
    
    const total = await profileManager.db.profiles.countDocuments({
      ...(status && { status }),
      ...(health_min && { 'health.score': { $gte: parseInt(health_min as string) } })
    });
    
    res.json({
      success: true,
      data: profiles,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  }));
  
  // GET /profiles/:id - Get profile details
  router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const profile = await profileManager.getProfile(req.params.id);
    
    if (!profile) {
      throw new NotFoundError('Profile', req.params.id);
    }
    
    res.json({
      success: true,
      data: profile
    });
  }));
  
  // POST /profiles - Create profiles
  router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const validatedData = validateApiRequest(apiSchemas.bulkCreateProfiles, req.body);
    
    const profiles = [];
    const errors = [];
    
    for (let i = 0; i < validatedData.count; i++) {
      try {
        const profile = await profileManager.createProfile(validatedData.options || {});
        profiles.push(profile);
      } catch (error) {
        errors.push({
          index: i,
          error: error.message
        });
      }
    }
    
    res.status(201).json({
      success: true,
      data: {
        created: profiles.length,
        failed: errors.length,
        profiles: profiles.map(p => ({
          id: p.id,
          status: p.status,
          region: p.identity.location.region
        })),
        errors: errors.length > 0 ? errors : undefined
      }
    });
  }));
  
  // PUT /profiles/:id - Update profile
  router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
    const validatedData = validateApiRequest(apiSchemas.updateProfile, req.body);
    
    const profile = await profileManager.updateProfile(req.params.id, validatedData);
    
    res.json({
      success: true,
      data: profile
    });
  }));
  
  // DELETE /profiles/:id - Delete profile
  router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
    const profile = await profileManager.getProfile(req.params.id);
    
    if (!profile) {
      throw new NotFoundError('Profile', req.params.id);
    }
    
    // Soft delete - just change status
    await profileManager.updateProfile(req.params.id, {
      status: 'banned',
      bannedAt: new Date(),
      bannedReason: 'Manually deleted'
    });
    
    res.json({
      success: true,
      message: 'Profile deleted successfully'
    });
  }));
  
  // POST /profiles/:id/warmup - Start warmup
  router.post('/:id/warmup', asyncHandler(async (req: Request, res: Response) => {
    const { days = 14 } = req.body;
    
    await profileManager.warmupProfile(req.params.id);
    
    res.json({
      success: true,
      message: `Warmup started for ${days} days`
    });
  }));
  
  // POST /profiles/:id/suspend - Suspend profile
  router.post('/:id/suspend', asyncHandler(async (req: Request, res: Response) => {
    const { reason = 'Manual suspension' } = req.body;
    
    await profileManager.suspendProfile(req.params.id, reason);
    
    res.json({
      success: true,
      message: 'Profile suspended'
    });
  }));
  
  // POST /profiles/:id/resume - Resume profile
  router.post('/:id/resume', asyncHandler(async (req: Request, res: Response) => {
    await profileManager.updateProfile(req.params.id, {
      status: 'active',
      suspendedAt: null,
      suspendedReason: null
    });
    
    res.json({
      success: true,
      message: 'Profile resumed'
    });
  }));
  
  // GET /profiles/:id/history - Get activity history
  router.get('/:id/history', asyncHandler(async (req: Request, res: Response) => {
    const { 
      date_from,
      date_to,
      action_type,
      limit = 100
    } = req.query;
    
    const query: any = { profileId: req.params.id };
    
    if (date_from || date_to) {
      query.timestamp = {};
      if (date_from) query.timestamp.$gte = new Date(date_from as string);
      if (date_to) query.timestamp.$lte = new Date(date_to as string);
    }
    
    if (action_type) {
      query.type = action_type;
    }
    
    const activities = await profileManager.db.activityLogs
      .find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit as string))
      .toArray();
    
    res.json({
      success: true,
      data: activities
    });
  }));
  
  // GET /profiles/:id/stats - Get profile statistics
  router.get('/:id/stats', asyncHandler(async (req: Request, res: Response) => {
    const { period = '7d' } = req.query;
    
    const profile = await profileManager.getProfile(req.params.id);
    if (!profile) {
      throw new NotFoundError('Profile', req.params.id);
    }
    
    // Calculate period dates
    const periodMs = {
      '1d': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    
    const startDate = new Date(Date.now() - (periodMs[period as string] || periodMs['7d']));
    
    // Get task statistics
    const taskStats = await profileManager.db.tasks.aggregate([
      {
        $match: {
          profileId: req.params.id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgDuration: { $avg: '$result.metrics.duration' }
        }
      }
    ]).toArray();
    
    // Get search statistics
    const searchStats = await profileManager.db.tasks.aggregate([
      {
        $match: {
          profileId: req.params.id,
          type: 'search',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$config.search.engine',
          count: { $sum: 1 },
          clicked: {
            $sum: {
              $cond: ['$result.searchResult.clicked', 1, 0]
            }
          }
        }
      }
    ]).toArray();
    
    res.json({
      success: true,
      data: {
        profile: {
          id: profile.id,
          status: profile.status,
          health: profile.health,
          created: profile.created,
          lastActive: profile.lastActive
        },
        stats: profile.stats,
        period: {
          start: startDate,
          end: new Date(),
          tasks: taskStats,
          searches: searchStats
        }
      }
    });
  }));
  
  // POST /profiles/:id/health-check - Force health check
  router.post('/:id/health-check', asyncHandler(async (req: Request, res: Response) => {
    const updatedProfile = await profileManager.updateProfileHealth(req.params.id);
    
    res.json({
      success: true,
      data: {
        health: updatedProfile.health,
        status: updatedProfile.status
      }
    });
  }));
  
  // POST /profiles/bulk/warmup - Bulk warmup
  router.post('/bulk/warmup', asyncHandler(async (req: Request, res: Response) => {
    const { 
      profileIds,
      status,
      count = 50,
      days = 14 
    } = req.body;
    
    let profiles;
    
    if (profileIds) {
      profiles = await profileManager.db.profiles
        .find({ id: { $in: profileIds } })
        .toArray();
    } else if (status) {
      profiles = await profileManager.db.profiles
        .find({ status })
        .limit(count)
        .toArray();
    } else {
      profiles = await profileManager.db.profiles
        .find({ status: 'new' })
        .limit(count)
        .toArray();
    }
    
    const results = [];
    for (const profile of profiles) {
      try {
        await profileManager.warmupProfile(profile.id);
        results.push({ id: profile.id, success: true });
      } catch (error) {
        results.push({ id: profile.id, success: false, error: error.message });
      }
    }
    
    res.json({
      success: true,
      data: {
        total: profiles.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      }
    });
  }));
  
  // GET /profiles/health/distribution - Health score distribution
  router.get('/health/distribution', asyncHandler(async (req: Request, res: Response) => {
    const distribution = await profileManager.db.profiles.aggregate([
      {
        $bucket: {
          groupBy: '$health.score',
          boundaries: [0, 20, 40, 60, 80, 100],
          default: 'Unknown',
          output: {
            count: { $sum: 1 },
            profiles: { $push: '$id' }
          }
        }
      }
    ]).toArray();
    
    res.json({
      success: true,
      data: distribution
    });
  }));
  
  // GET /profiles/fingerprints/unique - Check fingerprint uniqueness
  router.get('/fingerprints/unique', asyncHandler(async (req: Request, res: Response) => {
    const fingerprints = await profileManager.db.profiles.aggregate([
      {
        $group: {
          _id: '$fingerprint.canvas.fingerprint',
          count: { $sum: 1 },
          profiles: { $push: '$id' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]).toArray();
    
    const duplicates = fingerprints.filter(f => f.count > 1);
    
    res.json({
      success: true,
      data: {
        total: await profileManager.db.profiles.countDocuments(),
        duplicates: duplicates.length,
        details: duplicates
      }
    });
  }));
  
  // POST /profiles/:id/reset-cookies - Reset profile cookies
  router.post('/:id/reset-cookies', asyncHandler(async (req: Request, res: Response) => {
    await profileManager.updateProfile(req.params.id, {
      cookies: []
    });
    
    res.json({
      success: true,
      message: 'Cookies reset successfully'
    });
  }));
  
  // POST /profiles/:id/clone - Clone profile
  router.post('/:id/clone', asyncHandler(async (req: Request, res: Response) => {
    const sourceProfile = await profileManager.getProfile(req.params.id);
    if (!sourceProfile) {
      throw new NotFoundError('Profile', req.params.id);
    }
    
    // Create new profile with same settings but new fingerprint
    const newProfile = await profileManager.createProfile({
      region: sourceProfile.identity.location.region,
      city: sourceProfile.identity.location.city,
      deviceType: sourceProfile.identity.device.type,
      persona: {
        age: sourceProfile.identity.persona.age,
        gender: sourceProfile.identity.persona.gender,
        interests: sourceProfile.identity.persona.interests
      }
    });
    
    res.status(201).json({
      success: true,
      data: newProfile
    });
  }));
  
  return router;
}