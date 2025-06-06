import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer, Server } from 'http';
import { config } from '../config';
import { createLogger, Logger, requestLogger, errorLogger } from '../utils/logger';
import { ProfileManager } from '../core/ProfileManager';
import { TaskScheduler } from '../core/TaskScheduler';
import { MetricsService } from '../services/MetricsService';
import { DatabaseService } from '../services/DatabaseService';

// Import route handlers
import { profileRoutes } from './routes/profiles';
import { taskRoutes } from './routes/tasks';
import { metricsRoutes } from './routes/metrics';
import { systemRoutes } from './routes/system';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/error';

export interface APIServerOptions {
  profileManager: ProfileManager;
  taskScheduler: TaskScheduler;
  metricsService: MetricsService;
  db: DatabaseService;
}

export class APIServer {
  private app: Express;
  private server: Server;
  private logger: Logger;
  private isShuttingDown = false;

  constructor(private options: APIServerOptions) {
    this.logger = createLogger('APIServer');
    this.app = express();
    this.server = createServer(this.app);
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN?.split(',') || '*',
      credentials: true,
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use(requestLogger);

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
      message: 'Too many requests, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // API key authentication
    this.app.use('/api/', authMiddleware);

    // Health check endpoint (no auth required)
    this.app.get('/health', (req: Request, res: Response) => {
      if (this.isShuttingDown) {
        res.status(503).json({ status: 'shutting_down' });
      } else {
        res.json({
          status: 'healthy',
          timestamp: new Date(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        });
      }
    });

    // Metrics endpoint for Prometheus
    this.app.get('/metrics', async (req: Request, res: Response) => {
      try {
        const metrics = await this.options.metricsService.getPrometheusMetrics();
        res.set('Content-Type', 'text/plain');
        res.end(metrics);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get metrics' });
      }
    });
  }

  private setupRoutes() {
    // API routes
    this.app.use('/api/profiles', profileRoutes(this.options.profileManager));
    this.app.use('/api/tasks', taskRoutes(this.options.taskScheduler));
    this.app.use('/api/metrics', metricsRoutes(this.options.metricsService));
    this.app.use('/api/system', systemRoutes({
      profileManager: this.options.profileManager,
      taskScheduler: this.options.taskScheduler,
      metricsService: this.options.metricsService,
      db: this.options.db,
    }));

    // Static files for dashboard (if exists)
    if (process.env.SERVE_STATIC === 'true') {
      this.app.use(express.static('public'));
      this.app.get('*', (req: Request, res: Response) => {
        res.sendFile('index.html', { root: 'public' });
      });
    }

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`,
      });
    });
  }

  private setupErrorHandling() {
    // Error logging
    this.app.use(errorLogger);

    // Global error handler
    this.app.use(errorHandler);

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      this.logger.error('Unhandled Promise Rejection', { reason, promise });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = config.PORT;
      const host = config.HOST;

      this.server.listen(port, host, () => {
        this.logger.info(`API Server listening on http://${host}:${port}`);
        
        // Send ready signal to PM2
        if (process.send) {
          process.send('ready');
        }
        
        resolve();
      });

      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          this.logger.error(`Port ${port} is already in use`);
        } else {
          this.logger.error('Server error:', error);
        }
        reject(error);
      });

      // Handle graceful shutdown
      this.server.on('close', () => {
        this.logger.info('API Server closed');
      });
    });
  }

  async stop(): Promise<void> {
    this.isShuttingDown = true;
    
    return new Promise((resolve) => {
      this.server.close(() => {
        this.logger.info('API Server stopped');
        resolve();
      });

      // Force close after 30 seconds
      setTimeout(() => {
        this.logger.warn('Forcing server closure');
        resolve();
      }, 30000);
    });
  }

  getExpressApp(): Express {
    return this.app;
  }

  getServer(): Server {
    return this.server;
  }
}

// WebSocket support (optional)
export function setupWebSocket(server: Server, options: APIServerOptions) {
  const io = require('socket.io')(server, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || '*',
      credentials: true,
    },
  });

  const logger = createLogger('WebSocket');

  // Authentication middleware
  io.use((socket: any, next: any) => {
    const token = socket.handshake.auth.token;
    if (!token || token !== config.API_KEY) {
      return next(new Error('Authentication failed'));
    }
    next();
  });

  io.on('connection', (socket: any) => {
    logger.info(`Client connected: ${socket.id}`);

    // Join rooms based on subscription
    socket.on('subscribe', (rooms: string[]) => {
      rooms.forEach(room => {
        socket.join(room);
        logger.debug(`Client ${socket.id} joined room: ${room}`);
      });
    });

    // Handle real-time metrics subscription
    socket.on('metrics:subscribe', async () => {
      socket.join('metrics');
      
      // Send initial metrics
      const metrics = await options.metricsService.getCurrentMetrics();
      socket.emit('metrics:update', metrics);
    });

    // Handle profile updates subscription
    socket.on('profiles:subscribe', () => {
      socket.join('profiles');
    });

    // Handle task updates subscription
    socket.on('tasks:subscribe', () => {
      socket.join('tasks');
    });

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });

  // Emit events from various components
  options.profileManager.on('profile:created', (profile) => {
    io.to('profiles').emit('profile:created', profile);
  });

  options.profileManager.on('profile:updated', (profile) => {
    io.to('profiles').emit('profile:updated', profile);
  });

  options.taskScheduler.on('task:created', (task) => {
    io.to('tasks').emit('task:created', task);
  });

  options.taskScheduler.on('task:completed', (task) => {
    io.to('tasks').emit('task:completed', task);
  });

  // Periodic metrics updates
  setInterval(async () => {
    const metrics = await options.metricsService.getCurrentMetrics();
    io.to('metrics').emit('metrics:update', metrics);
  }, 5000);

  return io;
}