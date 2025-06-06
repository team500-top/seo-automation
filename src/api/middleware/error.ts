import { Request, Response, NextFunction } from 'express';
import { BaseError, ErrorHandler } from '../../utils/errors';
import { createLogger } from '../../utils/logger';

const logger = createLogger('ErrorMiddleware');

// Error middleware must have 4 parameters
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log error details
  logger.error('Request error', {
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    body: req.body,
    query: req.query,
    params: req.params
  });
  
  // Get standardized error response
  const errorResponse = ErrorHandler.handle(error);
  
  // Set response status and send error
  res.status(errorResponse.statusCode).json({
    success: false,
    ...errorResponse.body
  });
  
  // Track error metrics
  trackError(error, req);
}

// Not found handler
export function notFoundHandler(req: Request, res: Response): void {
  logger.warn('Route not found', {
    method: req.method,
    url: req.url,
    ip: req.ip
  });
  
  res.status(404).json({
    success: false,
    error: 'NotFound',
    message: `Route ${req.method} ${req.path} not found`,
    code: 'ROUTE_NOT_FOUND'
  });
}

// Async error wrapper
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction): Promise<void> => {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Validation error formatter
export function validationErrorHandler(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Check if it's a validation error from Joi or similar
  if (error.isJoi || error.name === 'ValidationError') {
    const errors = error.details?.map((detail: any) => ({
      field: detail.path.join('.'),
      message: detail.message,
      type: detail.type
    })) || [];
    
    res.status(400).json({
      success: false,
      error: 'ValidationError',
      message: 'Request validation failed',
      code: 'VALIDATION_ERROR',
      errors
    });
  } else {
    next(error);
  }
}

// Error tracking
function trackError(error: Error, req: Request): void {
  // Track operational vs programming errors
  const isOperational = ErrorHandler.isOperationalError(error);
  
  // You can integrate with error tracking services here
  // Examples: Sentry, Rollbar, Bugsnag
  
  if (!isOperational) {
    // Critical error - might need immediate attention
    logger.error('Non-operational error detected', {
      error: error.message,
      stack: error.stack,
      request: {
        method: req.method,
        url: req.url,
        headers: req.headers
      }
    });
  }
}

// Development error handler with more details
export function developmentErrorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error('Development error', error);
  
  const statusCode = error instanceof BaseError ? error.statusCode : 500;
  
  res.status(statusCode).json({
    success: false,
    error: error.name,
    message: error.message,
    stack: error.stack?.split('\n'),
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      query: req.query,
      params: req.params
    }
  });
}

// Timeout handler
export function timeoutHandler(timeout: number = 30000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeoutId = setTimeout(() => {
      const error = new Error(`Request timeout after ${timeout}ms`);
      error.name = 'RequestTimeout';
      (error as any).statusCode = 408;
      next(error);
    }, timeout);
    
    // Clear timeout when response is sent
    res.on('finish', () => {
      clearTimeout(timeoutId);
    });
    
    next();
  };
}

// Request size limit handler
export function requestSizeHandler(error: any, req: Request, res: Response, next: NextFunction): void {
  if (error.type === 'entity.too.large') {
    res.status(413).json({
      success: false,
      error: 'PayloadTooLarge',
      message: 'Request entity too large',
      code: 'PAYLOAD_TOO_LARGE',
      limit: error.limit,
      received: error.length
    });
  } else {
    next(error);
  }
}

// CORS error handler
export function corsErrorHandler(error: any, req: Request, res: Response, next: NextFunction): void {
  if (error.message?.includes('CORS')) {
    res.status(403).json({
      success: false,
      error: 'CORSError',
      message: 'Cross-Origin Request Blocked',
      code: 'CORS_ERROR',
      origin: req.get('origin')
    });
  } else {
    next(error);
  }
}

// MongoDB error handler
export function mongoErrorHandler(error: any, req: Request, res: Response, next: NextFunction): void {
  if (error.name === 'MongoError' || error.name === 'MongoServerError') {
    let message = 'Database operation failed';
    let code = 'DATABASE_ERROR';
    
    // Handle specific MongoDB errors
    if (error.code === 11000) {
      message = 'Duplicate key error';
      code = 'DUPLICATE_KEY';
    } else if (error.code === 121) {
      message = 'Document validation failed';
      code = 'VALIDATION_FAILED';
    }
    
    res.status(400).json({
      success: false,
      error: 'DatabaseError',
      message,
      code
    });
  } else {
    next(error);
  }
}

// Maintenance mode handler
let maintenanceMode = false;

export function setMaintenanceMode(enabled: boolean): void {
  maintenanceMode = enabled;
  logger.info(`Maintenance mode ${enabled ? 'enabled' : 'disabled'}`);
}

export function maintenanceHandler(req: Request, res: Response, next: NextFunction): void {
  if (maintenanceMode) {
    // Allow health checks during maintenance
    if (req.path === '/health') {
      return next();
    }
    
    res.status(503).json({
      success: false,
      error: 'ServiceUnavailable',
      message: 'System is under maintenance',
      code: 'MAINTENANCE_MODE',
      retryAfter: 3600 // 1 hour
    });
  } else {
    next();
  }
}

// Security error handler
export function securityErrorHandler(error: any, req: Request, res: Response, next: NextFunction): void {
  // Hide sensitive error details in production
  if (process.env.NODE_ENV === 'production') {
    // Log full error internally
    logger.error('Security error', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      path: req.path
    });
    
    // Send generic error to client
    res.status(500).json({
      success: false,
      error: 'InternalServerError',
      message: 'An error occurred processing your request',
      code: 'INTERNAL_ERROR'
    });
  } else {
    next(error);
  }
}