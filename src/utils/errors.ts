export class BaseError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly timestamp: Date;
  public readonly context?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    context?: any
  ) {
    super(message);
    
    Object.setPrototypeOf(this, new.target.prototype);
    
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = new Date();
    this.context = context;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// === API Errors ===

export class ValidationError extends BaseError {
  constructor(message: string, context?: any) {
    super(message, 400, 'VALIDATION_ERROR', true, context);
  }
}

export class AuthenticationError extends BaseError {
  constructor(message: string = 'Authentication failed', context?: any) {
    super(message, 401, 'AUTHENTICATION_ERROR', true, context);
  }
}

export class AuthorizationError extends BaseError {
  constructor(message: string = 'Access denied', context?: any) {
    super(message, 403, 'AUTHORIZATION_ERROR', true, context);
  }
}

export class NotFoundError extends BaseError {
  constructor(resource: string, identifier?: string) {
    const message = identifier 
      ? `${resource} with identifier ${identifier} not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND', true, { resource, identifier });
  }
}

export class ConflictError extends BaseError {
  constructor(message: string, context?: any) {
    super(message, 409, 'CONFLICT', true, context);
  }
}

export class RateLimitError extends BaseError {
  constructor(limit: number, window: string) {
    super(
      `Rate limit exceeded. Maximum ${limit} requests per ${window}`,
      429,
      'RATE_LIMIT_EXCEEDED',
      true,
      { limit, window }
    );
  }
}

// === System Errors ===

export class DatabaseError extends BaseError {
  constructor(message: string, originalError?: any) {
    super(
      message,
      500,
      'DATABASE_ERROR',
      false,
      { originalError: originalError?.message || originalError }
    );
  }
}

export class BrowserError extends BaseError {
  constructor(message: string, profileId?: string, taskId?: string) {
    super(message, 500, 'BROWSER_ERROR', true, { profileId, taskId });
  }
}

export class ProxyError extends BaseError {
  constructor(message: string, proxyId?: string, statusCode?: number) {
    super(message, 500, 'PROXY_ERROR', true, { proxyId, statusCode });
  }
}

export class CaptchaError extends BaseError {
  constructor(
    message: string,
    captchaType?: string,
    service?: string,
    attempts?: number
  ) {
    super(message, 500, 'CAPTCHA_ERROR', true, {
      captchaType,
      service,
      attempts
    });
  }
}

export class TaskError extends BaseError {
  constructor(
    message: string,
    taskId: string,
    taskType?: string,
    profileId?: string
  ) {
    super(message, 500, 'TASK_ERROR', true, {
      taskId,
      taskType,
      profileId
    });
  }
}

// === Business Logic Errors ===

export class ProfileError extends BaseError {
  constructor(message: string, profileId?: string, reason?: string) {
    super(message, 400, 'PROFILE_ERROR', true, { profileId, reason });
  }
}

export class QuotaExceededError extends BaseError {
  constructor(
    resource: string,
    current: number,
    limit: number
  ) {
    super(
      `Quota exceeded for ${resource}. Current: ${current}, Limit: ${limit}`,
      403,
      'QUOTA_EXCEEDED',
      true,
      { resource, current, limit }
    );
  }
}

export class ServiceUnavailableError extends BaseError {
  constructor(service: string, retryAfter?: number) {
    super(
      `Service ${service} is temporarily unavailable`,
      503,
      'SERVICE_UNAVAILABLE',
      true,
      { service, retryAfter }
    );
  }
}

// === Error Handler ===

export class ErrorHandler {
  static handle(error: Error): {
    statusCode: number;
    body: {
      error: string;
      message: string;
      code?: string;
      context?: any;
      stack?: string;
    };
  } {
    if (error instanceof BaseError) {
      return {
        statusCode: error.statusCode,
        body: {
          error: error.name,
          message: error.message,
          code: error.code,
          context: error.context,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }
      };
    }

    // Handle known third-party errors
    if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      return ErrorHandler.handle(
        new DatabaseError('Database operation failed', error)
      );
    }

    if (error.name === 'TimeoutError') {
      return ErrorHandler.handle(
        new ServiceUnavailableError('Operation timed out', 30)
      );
    }

    // Default error response
    return {
      statusCode: 500,
      body: {
        error: 'InternalServerError',
        message: 'An unexpected error occurred',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    };
  }

  static isOperationalError(error: Error): boolean {
    if (error instanceof BaseError) {
      return error.isOperational;
    }
    return false;
  }

  static isTrustedError(error: Error): boolean {
    return error instanceof BaseError;
  }
}

// === Error Recovery Strategies ===

export interface ErrorRecoveryStrategy {
  shouldRetry(error: Error, attempt: number): boolean;
  getDelay(error: Error, attempt: number): number;
  transform?(error: Error): Error;
}

export class ExponentialBackoffStrategy implements ErrorRecoveryStrategy {
  constructor(
    private maxAttempts: number = 3,
    private baseDelay: number = 1000,
    private maxDelay: number = 30000
  ) {}

  shouldRetry(error: Error, attempt: number): boolean {
    if (attempt >= this.maxAttempts) return false;
    
    // Don't retry client errors
    if (error instanceof BaseError && error.statusCode >= 400 && error.statusCode < 500) {
      return false;
    }
    
    // Retry network and server errors
    return true;
  }

  getDelay(error: Error, attempt: number): number {
    const delay = Math.min(
      this.baseDelay * Math.pow(2, attempt - 1),
      this.maxDelay
    );
    
    // Add jitter
    return delay + Math.random() * 1000;
  }
}

export class CircuitBreakerStrategy implements ErrorRecoveryStrategy {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000
  ) {}

  shouldRetry(error: Error, attempt: number): boolean {
    const now = Date.now();
    
    if (this.state === 'open') {
      if (now - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        return false;
      }
    }
    
    if (error instanceof BaseError && !error.isOperational) {
      this.failures++;
      this.lastFailureTime = now;
      
      if (this.failures >= this.threshold) {
        this.state = 'open';
        return false;
      }
    }
    
    return true;
  }

  getDelay(error: Error, attempt: number): number {
    return 1000 * attempt;
  }

  reset(): void {
    this.failures = 0;
    this.state = 'closed';
  }
}

// === Async Error Wrapper ===

export function asyncErrorWrapper<T extends (...args: any[]) => Promise<any>>(
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      throw new BaseError(
        error.message || 'An unexpected error occurred',
        500,
        'WRAPPED_ERROR',
        false,
        { originalError: error }
      );
    }
  }) as T;
}