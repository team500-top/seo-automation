import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { config } from '../config';

// Custom log levels
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6,
    profile: 7,
    task: 8,
    browser: 9
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    verbose: 'cyan',
    debug: 'blue',
    silly: 'grey',
    profile: 'orange',
    task: 'purple',
    browser: 'pink'
  }
};

// Add colors to winston
winston.addColors(customLevels.colors);

// Custom format for log messages
const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}] ${message}`;
  
  // Add metadata if exists
  if (Object.keys(metadata).length > 0) {
    // Handle different metadata types
    if (metadata.profileId) {
      msg += ` | Profile: ${metadata.profileId}`;
    }
    if (metadata.taskId) {
      msg += ` | Task: ${metadata.taskId}`;
    }
    if (metadata.error) {
      msg += ` | Error: ${metadata.error}`;
    }
    if (metadata.duration) {
      msg += ` | Duration: ${metadata.duration}ms`;
    }
    if (metadata.data) {
      msg += ` | Data: ${JSON.stringify(metadata.data)}`;
    }
  }
  
  return msg;
});

// Create transports
const transports: winston.transport[] = [
  // Console transport for development
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  })
];

// File transports for production
if (config.NODE_ENV === 'production') {
  // General log file
  transports.push(
    new DailyRotateFile({
      filename: path.join(config.LOG_DIR, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: config.LOG_MAX_SIZE,
      maxFiles: config.LOG_MAX_FILES,
      level: 'info'
    })
  );

  // Error log file
  transports.push(
    new DailyRotateFile({
      filename: path.join(config.LOG_DIR, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: config.LOG_MAX_SIZE,
      maxFiles: config.LOG_MAX_FILES,
      level: 'error'
    })
  );

  // Profile activity log
  transports.push(
    new DailyRotateFile({
      filename: path.join(config.LOG_DIR, 'profiles-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: config.LOG_MAX_SIZE,
      maxFiles: config.LOG_MAX_FILES,
      level: 'profile'
    })
  );

  // Task execution log
  transports.push(
    new DailyRotateFile({
      filename: path.join(config.LOG_DIR, 'tasks-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: config.LOG_MAX_SIZE,
      maxFiles: config.LOG_MAX_FILES,
      level: 'task'
    })
  );

  // Browser activity log
  transports.push(
    new DailyRotateFile({
      filename: path.join(config.LOG_DIR, 'browser-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: config.LOG_MAX_SIZE,
      maxFiles: config.LOG_MAX_FILES,
      level: 'browser'
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  levels: customLevels.levels,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    customFormat
  ),
  transports,
  exitOnError: false
});

// Create specialized loggers
export class Logger {
  private context: string;
  private metadata: Record<string, any>;

  constructor(context: string, metadata?: Record<string, any>) {
    this.context = context;
    this.metadata = metadata || {};
  }

  private log(level: string, message: string, meta?: Record<string, any>) {
    logger.log(level, `[${this.context}] ${message}`, {
      ...this.metadata,
      ...meta
    });
  }

  error(message: string, error?: Error | any) {
    this.log('error', message, {
      error: error?.stack || error?.message || error
    });
  }

  warn(message: string, meta?: Record<string, any>) {
    this.log('warn', message, meta);
  }

  info(message: string, meta?: Record<string, any>) {
    this.log('info', message, meta);
  }

  debug(message: string, meta?: Record<string, any>) {
    this.log('debug', message, meta);
  }

  http(message: string, meta?: Record<string, any>) {
    this.log('http', message, meta);
  }

  profile(action: string, profileId: string, meta?: Record<string, any>) {
    this.log('profile', action, {
      profileId,
      ...meta
    });
  }

  task(action: string, taskId: string, meta?: Record<string, any>) {
    this.log('task', action, {
      taskId,
      ...meta
    });
  }

  browser(action: string, meta?: Record<string, any>) {
    this.log('browser', action, meta);
  }

  // Performance logging
  startTimer(): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      return duration;
    };
  }

  logPerformance(operation: string, duration: number) {
    this.info(`${operation} completed`, { duration });
  }
}

// Activity logger for detailed tracking
export class ActivityLogger {
  private activities: any[] = [];
  private profileId: string;
  private sessionId: string;

  constructor(profileId: string, sessionId: string) {
    this.profileId = profileId;
    this.sessionId = sessionId;
  }

  logActivity(activity: {
    type: string;
    action: string;
    target?: string;
    data?: any;
    success?: boolean;
    error?: string;
  }) {
    const entry = {
      timestamp: new Date(),
      profileId: this.profileId,
      sessionId: this.sessionId,
      ...activity
    };

    this.activities.push(entry);

    // Also log to main logger
    const logger = new Logger('ActivityLogger', {
      profileId: this.profileId,
      sessionId: this.sessionId
    });

    if (activity.error) {
      logger.error(`Activity failed: ${activity.type} - ${activity.action}`, activity.error);
    } else {
      logger.profile(
        `${activity.type} - ${activity.action}`,
        this.profileId,
        activity.data
      );
    }
  }

  getActivities() {
    return this.activities;
  }

  async save() {
    // Save to database
    try {
      const db = await getDatabase();
      await db.collection('activity_logs').insertMany(this.activities);
      this.activities = []; // Clear after saving
    } catch (error) {
      const logger = new Logger('ActivityLogger');
      logger.error('Failed to save activities', error);
    }
  }
}

// Request logger middleware for Express
export const requestLogger = (req: any, res: any, next: any) => {
  const logger = new Logger('HTTP');
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http(`${req.method} ${req.url}`, {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  });

  next();
};

// Error logger middleware
export const errorLogger = (err: any, req: any, res: any, next: any) => {
  const logger = new Logger('HTTP');
  logger.error('Request failed', {
    method: req.method,
    url: req.url,
    error: err.stack || err.message,
    body: req.body,
    query: req.query
  });
  next(err);
};

// Export default logger
export default logger;

// Helper function to create context-specific loggers
export const createLogger = (context: string, metadata?: Record<string, any>) => {
  return new Logger(context, metadata);
};

// Performance monitoring decorator
export function LogPerformance(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const logger = new Logger(target.constructor.name);
    const timer = logger.startTimer();
    
    try {
      const result = await originalMethod.apply(this, args);
      const duration = timer();
      logger.logPerformance(`${propertyKey}`, duration);
      return result;
    } catch (error) {
      const duration = timer();
      logger.error(`${propertyKey} failed after ${duration}ms`, error);
      throw error;
    }
  };

  return descriptor;
}

// Activity tracking decorator
export function TrackActivity(activityType: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const activityLogger = (this as any).activityLogger;
      
      if (!activityLogger) {
        return originalMethod.apply(this, args);
      }

      try {
        const result = await originalMethod.apply(this, args);
        activityLogger.logActivity({
          type: activityType,
          action: propertyKey,
          data: { args, result },
          success: true
        });
        return result;
      } catch (error) {
        activityLogger.logActivity({
          type: activityType,
          action: propertyKey,
          data: { args },
          success: false,
          error: error.message
        });
        throw error;
      }
    };

    return descriptor;
  };
}