import { createLogger } from './logger';

const logger = createLogger('Shutdown');

interface ShutdownHandler {
  name: string;
  handler: () => Promise<void>;
  timeout?: number;
  priority?: number;
}

class GracefulShutdown {
  private handlers: ShutdownHandler[] = [];
  private isShuttingDown = false;
  private shutdownPromise?: Promise<void>;
  
  register(handler: ShutdownHandler): void {
    this.handlers.push({
      ...handler,
      timeout: handler.timeout || 30000,
      priority: handler.priority || 100
    });
    
    // Sort by priority (lower number = higher priority)
    this.handlers.sort((a, b) => (a.priority || 100) - (b.priority || 100));
  }
  
  async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return this.shutdownPromise;
    }
    
    this.isShuttingDown = true;
    logger.info(`Initiating graceful shutdown (signal: ${signal})`);
    
    this.shutdownPromise = this.executeShutdown();
    return this.shutdownPromise;
  }
  
  private async executeShutdown(): Promise<void> {
    const startTime = Date.now();
    
    for (const handler of this.handlers) {
      try {
        logger.info(`Executing shutdown handler: ${handler.name}`);
        
        await this.executeWithTimeout(
          handler.handler(),
          handler.timeout!,
          handler.name
        );
        
        logger.info(`✓ ${handler.name} shutdown completed`);
      } catch (error) {
        logger.error(`✗ ${handler.name} shutdown failed:`, error);
        // Continue with other handlers even if one fails
      }
    }
    
    const duration = Date.now() - startTime;
    logger.info(`Graceful shutdown completed in ${duration}ms`);
  }
  
  private async executeWithTimeout(
    promise: Promise<void>,
    timeout: number,
    name: string
  ): Promise<void> {
    let timeoutId: NodeJS.Timeout;
    
    const timeoutPromise = new Promise<void>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Shutdown handler '${name}' timed out after ${timeout}ms`));
      }, timeout);
    });
    
    try {
      await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }
}

// Global shutdown manager instance
const shutdownManager = new GracefulShutdown();

// Export functions
export function registerShutdownHandler(
  name: string,
  handler: () => Promise<void>,
  options?: { timeout?: number; priority?: number }
): void {
  shutdownManager.register({
    name,
    handler,
    ...options
  });
}

export async function gracefulShutdown(cleanup?: () => Promise<void>): Promise<void> {
  if (cleanup) {
    registerShutdownHandler('Custom cleanup', cleanup, { priority: 50 });
  }
  
  await shutdownManager.shutdown('manual');
}

// Process signal handlers
export function setupProcessHandlers(): void {
  const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
  
  signals.forEach(signal => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}`);
      
      try {
        await shutdownManager.shutdown(signal);
        process.exit(0);
      } catch (error) {
        logger.error('Shutdown failed:', error);
        process.exit(1);
      }
    });
  });
  
  // Handle uncaught errors
  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught Exception:', error);
    
    try {
      await shutdownManager.shutdown('uncaughtException');
    } catch (shutdownError) {
      logger.error('Emergency shutdown failed:', shutdownError);
    }
    
    process.exit(1);
  });
  
  process.on('unhandledRejection', async (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    
    try {
      await shutdownManager.shutdown('unhandledRejection');
    } catch (shutdownError) {
      logger.error('Emergency shutdown failed:', shutdownError);
    }
    
    process.exit(1);
  });
}

// Common shutdown handlers
export const commonHandlers = {
  closeHttpServer: (server: any) => ({
    name: 'HTTP Server',
    priority: 10,
    handler: async () => {
      return new Promise<void>((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        
        server.close((err?: Error) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
  }),
  
  closeDatabaseConnection: (db: any) => ({
    name: 'Database Connection',
    priority: 20,
    handler: async () => {
      if (db && db.disconnect) {
        await db.disconnect();
      }
    }
  }),
  
  stopWorkers: (workers: any[]) => ({
    name: 'Worker Processes',
    priority: 30,
    handler: async () => {
      await Promise.all(
        workers.map(worker => 
          worker.stop ? worker.stop() : Promise.resolve()
        )
      );
    }
  }),
  
  flushLogs: (logger: any) => ({
    name: 'Log Flushing',
    priority: 90,
    handler: async () => {
      if (logger && logger.flush) {
        await new Promise(resolve => {
          logger.flush(resolve);
        });
      }
    }
  }),
  
  saveCriticalData: (saveFunction: () => Promise<void>) => ({
    name: 'Critical Data Save',
    priority: 5,
    handler: saveFunction
  })
};

// Utility to create timeout promise
export function createTimeoutPromise(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message || `Operation timed out after ${ms}ms`));
    }, ms);
  });
}

// Graceful degradation helper
export async function degradeGracefully<T>(
  operation: () => Promise<T>,
  fallback: T,
  operationName: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logger.warn(`${operationName} failed, using fallback:`, error);
    return fallback;
  }
}

// State preservation for recovery
export class StatePreserver {
  private state: Map<string, any> = new Map();
  
  preserve(key: string, value: any): void {
    this.state.set(key, value);
  }
  
  async saveToFile(filename: string): Promise<void> {
    const fs = await import('fs/promises');
    const data = Object.fromEntries(this.state);
    
    await fs.writeFile(
      filename,
      JSON.stringify(data, null, 2),
      'utf-8'
    );
    
    logger.info(`State saved to ${filename}`);
  }
  
  async loadFromFile(filename: string): Promise<void> {
    const fs = await import('fs/promises');
    
    try {
      const content = await fs.readFile(filename, 'utf-8');
      const data = JSON.parse(content);
      
      Object.entries(data).forEach(([key, value]) => {
        this.state.set(key, value);
      });
      
      logger.info(`State loaded from ${filename}`);
    } catch (error) {
      logger.warn(`Failed to load state from ${filename}:`, error);
    }
  }
  
  get<T>(key: string): T | undefined {
    return this.state.get(key);
  }
  
  clear(): void {
    this.state.clear();
  }
}

// Emergency stop function
export async function emergencyStop(reason: string): Promise<void> {
  logger.error(`EMERGENCY STOP: ${reason}`);
  
  // Skip all graceful procedures and exit immediately
  process.exit(99);
}

// Health check before shutdown
export async function preShutdownHealthCheck(): Promise<boolean> {
  try {
    // Check if critical operations are in progress
    // Return false if shutdown should be delayed
    
    // Example checks:
    // - Active database transactions
    // - Running browser instances
    // - Pending critical tasks
    
    return true; // Safe to shutdown
  } catch (error) {
    logger.error('Pre-shutdown health check failed:', error);
    return false;
  }
}