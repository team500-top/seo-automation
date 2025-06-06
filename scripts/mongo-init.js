// MongoDB initialization script
// This script runs when MongoDB container starts

// Switch to the seo-automation database
db = db.getSiblingDB('seo-automation');

// Create collections with validation
db.createCollection('profiles', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'status', 'created', 'identity', 'fingerprint', 'behavior', 'stats', 'health'],
      properties: {
        id: {
          bsonType: 'string',
          description: 'Unique profile identifier'
        },
        status: {
          enum: ['new', 'warming', 'active', 'suspended', 'banned'],
          description: 'Profile status'
        },
        health: {
          bsonType: 'object',
          required: ['score'],
          properties: {
            score: {
              bsonType: 'number',
              minimum: 0,
              maximum: 100
            }
          }
        }
      }
    }
  }
});

db.createCollection('tasks', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'type', 'profileId', 'status', 'config', 'createdAt'],
      properties: {
        type: {
          enum: ['warmup', 'search', 'target_visit', 'organic_browse'],
          description: 'Task type'
        },
        status: {
          enum: ['pending', 'scheduled', 'running', 'completed', 'failed', 'cancelled'],
          description: 'Task status'
        }
      }
    }
  }
});

db.createCollection('activityLogs');
db.createCollection('searchPositions');
db.createCollection('alerts');
db.createCollection('metrics');
db.createCollection('proxies');
db.createCollection('captcha');

// Create indexes
print('Creating indexes...');

// Profile indexes
db.profiles.createIndex({ status: 1 });
db.profiles.createIndex({ 'health.score': -1 });
db.profiles.createIndex({ lastActive: -1 });
db.profiles.createIndex({ 'identity.location.region': 1 });
db.profiles.createIndex({ created: -1 });

// Task indexes
db.tasks.createIndex({ status: 1 });
db.tasks.createIndex({ profileId: 1 });
db.tasks.createIndex({ type: 1 });
db.tasks.createIndex({ priority: -1 });
db.tasks.createIndex({ 'schedule.scheduledFor': 1 });
db.tasks.createIndex({ createdAt: -1 });

// Activity log indexes with TTL
db.activityLogs.createIndex({ profileId: 1 });
db.activityLogs.createIndex({ timestamp: -1 });
db.activityLogs.createIndex(
  { timestamp: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 } // 30 days TTL
);

// Search position indexes
db.searchPositions.createIndex({ domain: 1, query: 1, engine: 1 });
db.searchPositions.createIndex({ timestamp: -1 });

// Alert indexes
db.alerts.createIndex({ level: 1 });
db.alerts.createIndex({ createdAt: -1 });
db.alerts.createIndex({ acknowledgedAt: 1 });

// Metrics indexes with TTL
db.metrics.createIndex({ timestamp: -1 });
db.metrics.createIndex({ type: 1 });
db.metrics.createIndex(
  { timestamp: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 } // 90 days TTL
);

// Create initial admin user (if using authentication)
db.createUser({
  user: 'seo_admin',
  pwd: 'change_this_password',
  roles: [
    {
      role: 'dbOwner',
      db: 'seo-automation'
    }
  ]
});

// Create read-only user for analytics
db.createUser({
  user: 'seo_analytics',
  pwd: 'analytics_password',
  roles: [
    {
      role: 'read',
      db: 'seo-automation'
    }
  ]
});

// Insert initial configuration documents
db.config.insertOne({
  _id: 'system',
  version: '1.0.0',
  initialized: new Date(),
  settings: {
    maxProfiles: 200,
    maxConcurrentTasks: 10,
    defaultTaskPriority: 5,
    profileWarmupDays: 14,
    healthCheckInterval: 3600000
  }
});

// Insert sample search queries (optional)
db.searchQueries.insertMany([
  {
    query: 'купить телефон',
    targetDomain: 'example.com',
    engine: 'yandex',
    region: 'Moscow',
    priority: 1,
    active: true
  },
  {
    query: 'интернет магазин телефонов',
    targetDomain: 'example.com',
    engine: 'yandex',
    region: 'Moscow',
    priority: 2,
    active: true
  }
]);

print('MongoDB initialization completed successfully!');