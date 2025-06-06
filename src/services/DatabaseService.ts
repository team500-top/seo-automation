import { MongoClient, Db, Collection } from 'mongodb';
import Redis from 'redis';
import { config } from '../config';
import { createLogger, Logger } from '../utils/logger';
import { Profile, Task, ActivityLog, Alert, Report } from '../types';

export class DatabaseService {
  private mongoClient: MongoClient;
  private db: Db;
  private redisClient: Redis.RedisClientType;
  private logger: Logger;
  private isConnected = false;

  // MongoDB collections
  public profiles: Collection<Profile>;
  public tasks: Collection<Task>;
  public activityLogs: Collection<ActivityLog>;
  public alerts: Collection<Alert>;
  public reports: Collection<Report>;
  public metrics: Collection<any>;
  public proxies: Collection<any>;
  public captcha: Collection<any>;

  constructor() {
    this.logger = createLogger('DatabaseService');
    this.mongoClient = new MongoClient(config.MONGODB_URI);
    this.redisClient = Redis.createClient({
      url: config.REDIS_URL
    });

    // Setup Redis error handling
    this.redisClient.on('error', (err) => {
      this.logger.error('Redis Client Error', err);
    });

    this.redisClient.on('connect', () => {
      this.logger.info('Redis Client Connected');
    });
  }

  async connect(): Promise<void> {
    try {
      // Connect to MongoDB
      await this.mongoClient.connect();
      this.db = this.mongoClient.db();
      
      // Initialize collections
      this.profiles = this.db.collection<Profile>('profiles');
      this.tasks = this.db.collection<Task>('tasks');
      this.activityLogs = this.db.collection<ActivityLog>('activityLogs');
      this.alerts = this.db.collection<Alert>('alerts');
      this.reports = this.db.collection<Report>('reports');
      this.metrics = this.db.collection('metrics');
      this.proxies = this.db.collection('proxies');
      this.captcha = this.db.collection('captcha');

      // Create indexes
      await this.createIndexes();

      // Connect to Redis
      await this.redisClient.connect();

      this.isConnected = true;
      this.logger.info('Database connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.mongoClient) {
        await this.mongoClient.close();
      }
      if (this.redisClient) {
        await this.redisClient.quit();
      }
      this.isConnected = false;
      this.logger.info('Database disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting from database', error);
      throw error;
    }
  }

  async ping(): Promise<number> {
    const start = Date.now();
    await this.db.admin().ping();
    return Date.now() - start;
  }

  private async createIndexes(): Promise<void> {
    try {
      // Profile indexes
      await this.profiles.createIndexes([
        { key: { status: 1 } },
        { key: { 'health.score': -1 } },
        { key: { lastActive: -1 } },
        { key: { 'identity.location.region': 1 } },
        { key: { created: -1 } }
      ]);

      // Task indexes
      await this.tasks.createIndexes([
        { key: { status: 1 } },
        { key: { profileId: 1 } },
        { key: { type: 1 } },
        { key: { priority: -1 } },
        { key: { 'schedule.scheduledFor': 1 } },
        { key: { createdAt: -1 } }
      ]);

      // Activity log indexes
      await this.activityLogs.createIndexes([
        { key: { profileId: 1 } },
        { key: { sessionId: 1 } },
        { key: { timestamp: -1 } },
        { key: { type: 1 } },
        { 
          key: { timestamp: 1 },
          expireAfterSeconds: 30 * 24 * 60 * 60 // 30 days TTL
        }
      ]);

      // Alert indexes
      await this.alerts.createIndexes([
        { key: { level: 1 } },
        { key: { type: 1 } },
        { key: { createdAt: -1 } },
        { key: { acknowledgedAt: 1 } },
        { key: { resolvedAt: 1 } }
      ]);

      // Metrics indexes
      await this.metrics.createIndexes([
        { key: { timestamp: -1 } },
        { key: { type: 1 } },
        {
          key: { timestamp: 1 },
          expireAfterSeconds: 90 * 24 * 60 * 60 // 90 days TTL
        }
      ]);

      this.logger.info('Database indexes created');
    } catch (error) {
      this.logger.error('Failed to create indexes', error);
      throw error;
    }
  }

  // === Redis Cache Methods ===

  async getCached<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.error(`Failed to get cached data for key: ${key}`, error);
      return null;
    }
  }

  async setCached<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const data = JSON.stringify(value);
      if (ttl) {
        await this.redisClient.setEx(key, ttl, data);
      } else {
        await this.redisClient.set(key, data);
      }
    } catch (error) {
      this.logger.error(`Failed to set cached data for key: ${key}`, error);
    }
  }

  async deleteCached(key: string | string[]): Promise<void> {
    try {
      if (Array.isArray(key)) {
        await this.redisClient.del(key);
      } else {
        await this.redisClient.del(key);
      }
    } catch (error) {
      this.logger.error(`Failed to delete cached data for key: ${key}`, error);
    }
  }

  async clearCache(pattern?: string): Promise<void> {
    try {
      if (pattern) {
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
        }
      } else {
        await this.redisClient.flushDb();
      }
    } catch (error) {
      this.logger.error('Failed to clear cache', error);
    }
  }

  // === Queue Methods (using Redis) ===

  async pushToQueue(queueName: string, data: any): Promise<void> {
    try {
      await this.redisClient.rPush(queueName, JSON.stringify(data));
    } catch (error) {
      this.logger.error(`Failed to push to queue: ${queueName}`, error);
      throw error;
    }
  }

  async popFromQueue<T>(queueName: string): Promise<T | null> {
    try {
      const data = await this.redisClient.lPop(queueName);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.error(`Failed to pop from queue: ${queueName}`, error);
      return null;
    }
  }

  async getQueueLength(queueName: string): Promise<number> {
    try {
      return await this.redisClient.lLen(queueName);
    } catch (error) {
      this.logger.error(`Failed to get queue length: ${queueName}`, error);
      return 0;
    }
  }

  // === Distributed Lock Methods ===

  async acquireLock(key: string, ttl: number = 30): Promise<boolean> {
    try {
      const lockKey = `lock:${key}`;
      const result = await this.redisClient.set(
        lockKey,
        '1',
        {
          NX: true,
          EX: ttl
        }
      );
      return result === 'OK';
    } catch (error) {
      this.logger.error(`Failed to acquire lock: ${key}`, error);
      return false;
    }
  }

  async releaseLock(key: string): Promise<void> {
    try {
      const lockKey = `lock:${key}`;
      await this.redisClient.del(lockKey);
    } catch (error) {
      this.logger.error(`Failed to release lock: ${key}`, error);
    }
  }

  // === Statistics Methods ===

  async incrementCounter(key: string, amount: number = 1): Promise<number> {
    try {
      return await this.redisClient.incrBy(key, amount);
    } catch (error) {
      this.logger.error(`Failed to increment counter: ${key}`, error);
      return 0;
    }
  }

  async getCounter(key: string): Promise<number> {
    try {
      const value = await this.redisClient.get(key);
      return value ? parseInt(value, 10) : 0;
    } catch (error) {
      this.logger.error(`Failed to get counter: ${key}`, error);
      return 0;
    }
  }

  async setExpiry(key: string, seconds: number): Promise<void> {
    try {
      await this.redisClient.expire(key, seconds);
    } catch (error) {
      this.logger.error(`Failed to set expiry for key: ${key}`, error);
    }
  }

  // === Aggregation Methods ===

  async getProfileStats(): Promise<any> {
    return await this.profiles.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgHealth: { $avg: '$health.score' }
        }
      }
    ]).toArray();
  }

  async getTaskStats(profileId?: string): Promise<any> {
    const match = profileId ? { profileId } : {};
    
    return await this.tasks.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgDuration: { $avg: '$result.metrics.duration' }
        }
      }
    ]).toArray();
  }

  async getSearchPositions(domain: string): Promise<any> {
    return await this.db.collection('searchPositions').aggregate([
      { $match: { domain } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: { query: '$query', engine: '$engine' },
          currentPosition: { $first: '$position' },
          previousPosition: { $last: '$position' },
          change: { $subtract: ['$previousPosition', '$currentPosition'] }
        }
      }
    ]).toArray();
  }

  // === Backup Methods ===

  async createBackup(collections?: string[]): Promise<string> {
    const backupId = `backup-${Date.now()}`;
    const collectionsToBackup = collections || [
      'profiles', 'tasks', 'activityLogs', 'metrics'
    ];

    try {
      for (const collectionName of collectionsToBackup) {
        const collection = this.db.collection(collectionName);
        const data = await collection.find({}).toArray();
        
        await this.db.collection('backups').insertOne({
          backupId,
          collection: collectionName,
          data,
          createdAt: new Date()
        });
      }

      this.logger.info(`Backup created: ${backupId}`);
      return backupId;
    } catch (error) {
      this.logger.error('Failed to create backup', error);
      throw error;
    }
  }

  async restoreBackup(backupId: string): Promise<void> {
    try {
      const backupData = await this.db.collection('backups')
        .find({ backupId })
        .toArray();

      for (const backup of backupData) {
        const collection = this.db.collection(backup.collection);
        await collection.deleteMany({});
        if (backup.data.length > 0) {
          await collection.insertMany(backup.data);
        }
      }

      this.logger.info(`Backup restored: ${backupId}`);
    } catch (error) {
      this.logger.error('Failed to restore backup', error);
      throw error;
    }
  }

  // === Cleanup Methods ===

  async cleanupOldData(days: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    try {
      // Clean old activity logs
      const activityResult = await this.activityLogs.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      // Clean old metrics
      const metricsResult = await this.metrics.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      // Clean old completed tasks
      const tasksResult = await this.tasks.deleteMany({
        status: { $in: ['completed', 'failed', 'cancelled'] },
        completedAt: { $lt: cutoffDate }
      });

      this.logger.info('Cleanup completed', {
        activityLogs: activityResult.deletedCount,
        metrics: metricsResult.deletedCount,
        tasks: tasksResult.deletedCount
      });
    } catch (error) {
      this.logger.error('Failed to cleanup old data', error);
      throw error;
    }
  }
}