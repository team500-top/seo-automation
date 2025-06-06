import { EventEmitter } from 'events';
import Bull from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../services/DatabaseService';
import { ProfileManager } from './ProfileManager';
import { BrowserPool } from './BrowserPool';
import { MetricsService } from '../services/MetricsService';
import { createLogger, Logger } from '../utils/logger';
import { Task, TaskStatus, TaskType, TaskResult } from '../types';
import { config } from '../config';
import { CONSTANTS } from '../config/constants';
import { validateTaskConfig } from '../config/validators';
import { TaskError } from '../utils/errors';

interface TaskSchedulerOptions {
  db: DatabaseService;
  profileManager: ProfileManager;
  browserPool: BrowserPool;
  metricsService: MetricsService;
}

export class TaskScheduler extends EventEmitter {
  private logger: Logger;
  private queue: Bull.Queue;
  private workers: Map<string, Bull.Job> = new Map();
  private isRunning = false;
  
  constructor(private options: TaskSchedulerOptions) {
    super();
    this.logger = createLogger('TaskScheduler');
    
    // Initialize Bull queue
    this.queue = new Bull('task-queue', {
      redis: {
        port: 6379,
        host: 'localhost'
      },
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: config.TASK_RETRY_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: config.TASK_RETRY_DELAY
        }
      }
    });
    
    this.setupQueueHandlers();
  }
  
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('TaskScheduler is already running');
      return;
    }
    
    this.logger.info('Starting TaskScheduler...');
    
    // Process queue
    this.queue.process(config.TASK_QUEUE_CONCURRENCY, async (job) => {
      return await this.processTask(job);
    });
    
    // Load pending tasks from database
    await this.loadPendingTasks();
    
    // Start scheduled task processor
    this.startScheduledTaskProcessor();
    
    this.isRunning = true;
    this.logger.info('TaskScheduler started');
  }
  
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    this.logger.info('Stopping TaskScheduler...');
    
    // Pause queue
    await this.queue.pause();
    
    // Wait for active jobs to complete
    await this.queue.whenCurrentJobsFinished();
    
    // Close queue
    await this.queue.close();
    
    this.isRunning = false;
    this.logger.info('TaskScheduler stopped');
  }
  
  async createTask(taskData: Partial<Task>): Promise<Task> {
    // Validate task configuration
    const validatedConfig = validateTaskConfig(taskData.type!, taskData.config);
    
    // Create task object
    const task: Task = {
      id: `task-${uuidv4()}`,
      type: taskData.type as TaskType,
      profileId: taskData.profileId || '',
      priority: taskData.priority || CONSTANTS.QUEUE_PRIORITY.NORMAL,
      status: TaskStatus.PENDING,
      config: validatedConfig,
      schedule: taskData.schedule || { type: 'immediate' },
      attempts: 0,
      createdAt: new Date()
    };
    
    // Auto-assign profile if not specified
    if (!task.profileId && task.type !== TaskType.WARMUP) {
      const profile = await this.selectBestProfile(task);
      if (!profile) {
        throw new Error('No healthy profiles available');
      }
      task.profileId = profile.id;
    }
    
    // Save to database
    await this.options.db.tasks.insertOne(task);
    
    // Add to queue based on schedule
    await this.scheduleTask(task);
    
    // Emit event
    this.emit('task:created', task);
    
    this.logger.info(`Task created: ${task.id}`, {
      type: task.type,
      profileId: task.profileId,
      priority: task.priority
    });
    
    return task;
  }
  
  async bulkCreateTasks(tasks: Array<Partial<Task>>): Promise<Task[]> {
    const createdTasks: Task[] = [];
    
    for (const taskData of tasks) {
      try {
        const task = await this.createTask(taskData);
        createdTasks.push(task);
      } catch (error) {
        this.logger.error(`Failed to create task: ${error.message}`, { taskData });
      }
    }
    
    this.logger.info(`Bulk created ${createdTasks.length} tasks`);
    return createdTasks;
  }
  
  async cancelTask(taskId: string): Promise<void> {
    // Update database
    await this.options.db.tasks.updateOne(
      { id: taskId },
      { $set: { status: TaskStatus.CANCELLED } }
    );
    
    // Remove from queue if pending
    const job = await this.queue.getJob(taskId);
    if (job) {
      await job.remove();
    }
    
    this.emit('task:cancelled', { taskId });
    this.logger.info(`Task cancelled: ${taskId}`);
  }
  
  async retryTask(taskId: string): Promise<void> {
    const task = await this.options.db.tasks.findOne({ id: taskId });
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    if (task.status !== TaskStatus.FAILED) {
      throw new Error('Only failed tasks can be retried');
    }
    
    // Reset task status
    task.status = TaskStatus.PENDING;
    task.attempts = 0;
    
    await this.options.db.tasks.updateOne(
      { id: taskId },
      { $set: { status: TaskStatus.PENDING, attempts: 0 } }
    );
    
    // Re-schedule task
    await this.scheduleTask(task);
    
    this.logger.info(`Task retry scheduled: ${taskId}`);
  }
  
  async getQueueStats(): Promise<any> {
    const [
      waiting,
      active,
      completed,
      failed,
      delayed
    ] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount()
    ]);
    
    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed
    };
  }
  
  private async scheduleTask(task: Task): Promise<void> {
    const jobOptions: Bull.JobOptions = {
      priority: task.priority,
      attempts: config.TASK_RETRY_ATTEMPTS
    };
    
    switch (task.schedule.type) {
      case 'immediate':
        await this.queue.add(task, jobOptions);
        break;
        
      case 'scheduled':
        const delay = task.schedule.scheduledFor!.getTime() - Date.now();
        await this.queue.add(task, { ...jobOptions, delay });
        break;
        
      case 'distributed':
        // Distribute across time window
        const window = task.schedule.distributionWindow!;
        const windowSize = window.end.getTime() - window.start.getTime();
        const randomDelay = Math.random() * windowSize;
        const scheduledTime = window.start.getTime() + randomDelay;
        const delayMs = Math.max(0, scheduledTime - Date.now());
        await this.queue.add(task, { ...jobOptions, delay: delayMs });
        break;
        
      case 'cron':
        // Use Bull's repeat feature for cron jobs
        await this.queue.add(task, {
          ...jobOptions,
          repeat: { cron: task.schedule.cron! }
        });
        break;
    }
  }
  
  private async processTask(job: Bull.Job<Task>): Promise<TaskResult> {
    const task = job.data;
    const startTime = Date.now();
    
    this.logger.info(`Processing task: ${task.id}`, {
      type: task.type,
      profileId: task.profileId,
      attempt: job.attemptsMade + 1
    });
    
    try {
      // Update task status
      await this.updateTaskStatus(task.id, TaskStatus.RUNNING);
      
      // Get profile
      const profile = await this.options.profileManager.getProfile(task.profileId);
      if (!profile) {
        throw new Error(`Profile not found: ${task.profileId}`);
      }
      
      // Check profile health
      if (profile.health.score < CONSTANTS.MIN_PROFILE_HEALTH) {
        throw new Error(`Profile health too low: ${profile.health.score}`);
      }
      
      // Execute task based on type
      let result: TaskResult;
      
      switch (task.type) {
        case TaskType.SEARCH:
          result = await this.executeSearchTask(task, profile);
          break;
          
        case TaskType.TARGET_VISIT:
          result = await this.executeTargetVisitTask(task, profile);
          break;
          
        case TaskType.ORGANIC_BROWSE:
          result = await this.executeOrganicBrowseTask(task, profile);
          break;
          
        case TaskType.WARMUP:
          result = await this.executeWarmupTask(task, profile);
          break;
          
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }
      
      // Calculate duration
      const duration = Date.now() - startTime;
      result.metrics = { ...result.metrics, duration };
      
      // Update task in database
      await this.updateTaskResult(task.id, result);
      
      // Update profile stats
      await this.updateProfileStats(profile.id, task, result);
      
      // Track metrics
      await this.options.metricsService.recordTaskCompletion(task, result, duration);
      
      // Emit success event
      this.emit('task:completed', { task, result });
      
      this.logger.info(`Task completed: ${task.id}`, {
        success: result.success,
        duration
      });
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: TaskResult = {
        success: false,
        error: error.message,
        metrics: { duration }
      };
      
      // Update task status
      if (job.attemptsMade >= config.TASK_RETRY_ATTEMPTS - 1) {
        await this.updateTaskStatus(task.id, TaskStatus.FAILED, error.message);
      }
      
      // Track metrics
      await this.options.metricsService.recordTaskCompletion(task, result, duration);
      
      // Emit failure event
      this.emit('task:failed', { task, error: error.message });
      
      this.logger.error(`Task failed: ${task.id}`, error);
      
      throw error;
    }
  }
  
  private async executeSearchTask(task: Task, profile: any): Promise<TaskResult> {
    const searchEngine = await this.options.browserPool.getSearchEngine(profile);
    
    try {
      const result = await searchEngine.performSearch({
        engine: task.config.search.engine,
        query: task.config.search.query,
        targetDomain: task.config.search.targetDomain,
        maxPages: task.config.search.maxResultPages,
        region: task.config.search.region
      });
      
      return {
        success: result.found,
        data: result,
        searchResult: {
          position: result.position,
          engine: task.config.search.engine,
          query: task.config.search.query,
          clicked: result.clicked
        },
        metrics: {
          pagesVisited: result.pagesScanned,
          actionsPerformed: result.actions?.length || 0,
          captchaEncountered: result.captchaEncountered,
          captchaSolved: result.captchaSolved
        }
      };
    } finally {
      await searchEngine.close();
    }
  }
  
  private async executeTargetVisitTask(task: Task, profile: any): Promise<TaskResult> {
    const browser = await this.options.browserPool.acquireBrowser(profile);
    
    try {
      const page = await browser.newPage();
      const behavior = await this.options.browserPool.getBehaviorEngine(profile);
      
      // Navigate to target
      await page.goto(task.config.target.url, {
        referer: task.config.target.referrer
      });
      
      // Perform actions
      let actionsPerformed = 0;
      for (const action of task.config.target.actions) {
        if (Math.random() <= action.probability) {
          await behavior.performAction(page, action);
          actionsPerformed++;
        }
      }
      
      // Stay on site for specified duration
      const duration = behavior.randomBetween(
        task.config.target.duration.min,
        task.config.target.duration.max
      );
      
      await behavior.browseNaturally(page, duration);
      
      // Check goals
      const goalsAchieved = await this.checkGoals(page, task.config.target.goals);
      
      return {
        success: true,
        data: {
          url: task.config.target.url,
          actionsPerformed,
          goalsAchieved,
          duration
        },
        metrics: {
          pagesVisited: 1,
          actionsPerformed,
          duration
        }
      };
    } finally {
      await this.options.browserPool.releaseBrowser(browser);
    }
  }
  
  private async executeOrganicBrowseTask(task: Task, profile: any): Promise<TaskResult> {
    const browser = await this.options.browserPool.acquireBrowser(profile);
    
    try {
      const page = await browser.newPage();
      const behavior = await this.options.browserPool.getBehaviorEngine(profile);
      
      const sitesVisited = [];
      const startTime = Date.now();
      
      // Visit random sites from categories
      for (const category of task.config.organic.categories) {
        const sites = CONSTANTS.WARMUP_ACTIVITIES[category.toUpperCase()] || [];
        if (sites.length > 0) {
          const site = sites[Math.floor(Math.random() * sites.length)];
          
          await page.goto(site);
          await behavior.browseNaturally(page, 60000 + Math.random() * 120000);
          
          sitesVisited.push({ site, category });
          
          if (Date.now() - startTime >= task.config.organic.duration) {
            break;
          }
        }
      }
      
      return {
        success: true,
        data: { sitesVisited },
        metrics: {
          pagesVisited: sitesVisited.length,
          duration: Date.now() - startTime
        }
      };
    } finally {
      await this.options.browserPool.releaseBrowser(browser);
    }
  }
  
  private async executeWarmupTask(task: Task, profile: any): Promise<TaskResult> {
    const browser = await this.options.browserPool.acquireBrowser(profile);
    
    try {
      const page = await browser.newPage();
      const behavior = await this.options.browserPool.getBehaviorEngine(profile);
      
      // Get activity sites
      const sites = CONSTANTS.WARMUP_ACTIVITIES[task.config.warmup.activity.toUpperCase()] || [];
      const site = sites[Math.floor(Math.random() * sites.length)];
      
      await page.goto(site);
      await behavior.browseNaturally(page, task.config.warmup.duration);
      
      return {
        success: true,
        data: {
          activity: task.config.warmup.activity,
          site,
          day: task.config.warmup.day
        },
        metrics: {
          pagesVisited: 1,
          duration: task.config.warmup.duration
        }
      };
    } finally {
      await this.options.browserPool.releaseBrowser(browser);
    }
  }
  
  private async selectBestProfile(task: Task): Promise<any> {
    // Get healthy profiles
    const profiles = await this.options.profileManager.getHealthyProfiles(70);
    
    if (profiles.length === 0) {
      return null;
    }
    
    // Filter by task requirements
    let suitable = profiles;
    
    if (task.config.search?.region) {
      suitable = suitable.filter(p => 
        p.identity.location.region === task.config.search.region
      );
    }
    
    // Sort by least recently used
    suitable.sort((a, b) => 
      a.lastActive.getTime() - b.lastActive.getTime()
    );
    
    return suitable[0];
  }
  
  private async updateTaskStatus(
    taskId: string, 
    status: TaskStatus, 
    error?: string
  ): Promise<void> {
    const update: any = {
      status,
      ...(status === TaskStatus.RUNNING && { startedAt: new Date() }),
      ...(status === TaskStatus.COMPLETED && { completedAt: new Date() }),
      ...(status === TaskStatus.FAILED && { completedAt: new Date(), error })
    };
    
    await this.options.db.tasks.updateOne(
      { id: taskId },
      { $set: update }
    );
  }
  
  private async updateTaskResult(taskId: string, result: TaskResult): Promise<void> {
    await this.options.db.tasks.updateOne(
      { id: taskId },
      {
        $set: {
          status: result.success ? TaskStatus.COMPLETED : TaskStatus.FAILED,
          result,
          completedAt: new Date()
        }
      }
    );
  }
  
  private async updateProfileStats(
    profileId: string, 
    task: Task, 
    result: TaskResult
  ): Promise<void> {
    const updates: any = {
      $inc: {
        'stats.totalTasks': 1,
        ...(result.success && { 'stats.successfulTasks': 1 }),
        ...(!result.success && { 'stats.failedTasks': 1 }),
        ...(task.type === TaskType.SEARCH && { 'stats.totalSearches': 1 }),
        ...(result.searchResult?.clicked && { 'stats.totalClicks': 1 }),
        'stats.totalTimeSpent': result.metrics?.duration || 0,
        ...(result.metrics?.captchaEncountered && { 'stats.captchasSolved': 1 })
      },
      $set: {
        lastActive: new Date(),
        'stats.lastTaskDate': new Date()
      }
    };
    
    await this.options.db.profiles.updateOne(
      { id: profileId },
      updates
    );
    
    // Update profile health
    await this.options.profileManager.updateProfileHealth(profileId);
  }
  
  private async checkGoals(page: any, goals: any[]): Promise<any[]> {
    const achieved = [];
    
    for (const goal of goals) {
      let success = false;
      
      switch (goal.type) {
        case 'pageview':
          success = page.url().includes(goal.value);
          break;
          
        case 'duration':
          // Checked elsewhere
          success = true;
          break;
          
        case 'depth':
          // Would need to track page navigation
          success = true;
          break;
      }
      
      if (success || !goal.required) {
        achieved.push(goal);
      }
    }
    
    return achieved;
  }
  
  private setupQueueHandlers(): void {
    this.queue.on('completed', (job, result) => {
      this.logger.debug(`Job completed: ${job.id}`);
    });
    
    this.queue.on('failed', (job, err) => {
      this.logger.error(`Job failed: ${job.id}`, err);
    });
    
    this.queue.on('stalled', (job) => {
      this.logger.warn(`Job stalled: ${job.id}`);
    });
    
    this.queue.on('error', (error) => {
      this.logger.error('Queue error:', error);
    });
  }
  
  private async loadPendingTasks(): Promise<void> {
    const pendingTasks = await this.options.db.tasks.find({
      status: { $in: [TaskStatus.PENDING, TaskStatus.SCHEDULED] }
    }).toArray();
    
    for (const task of pendingTasks) {
      await this.scheduleTask(task);
    }
    
    this.logger.info(`Loaded ${pendingTasks.length} pending tasks`);
  }
  
  private startScheduledTaskProcessor(): void {
    // Check for scheduled tasks every minute
    setInterval(async () => {
      const now = new Date();
      const scheduledTasks = await this.options.db.tasks.find({
        status: TaskStatus.SCHEDULED,
        'schedule.scheduledFor': { $lte: now }
      }).toArray();
      
      for (const task of scheduledTasks) {
        await this.scheduleTask(task);
      }
    }, 60000);
  }
}