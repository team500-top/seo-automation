import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { AuthenticationError, AuthorizationError, ValidationError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';

const logger = createLogger('AuthMiddleware');

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        permissions: string[];
      };
      apiKey?: string;
    }
  }
}

// API Key authentication
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    // Check for API key in different locations
    const apiKey = 
      req.headers['x-api-key'] as string ||
      req.query.api_key as string ||
      req.body?.api_key;
    
    if (!apiKey) {
      throw new AuthenticationError('API key is required');
    }
    
    // Validate API key
    if (apiKey !== config.API_KEY) {
      logger.warn('Invalid API key attempt', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        path: req.path
      });
      throw new AuthenticationError('Invalid API key');
    }
    
    // Store API key in request
    req.apiKey = apiKey;
    
    next();
  } catch (error) {
    next(error);
  }
}

// JWT authentication
export function jwtAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = extractToken(req);
    
    if (!token) {
      throw new AuthenticationError('Access token is required');
    }
    
    // Verify JWT
    const decoded = jwt.verify(token, config.JWT_SECRET) as any;
    
    // Check token expiration
    if (decoded.exp && decoded.exp < Date.now() / 1000) {
      throw new AuthenticationError('Token has expired');
    }
    
    // Attach user to request
    req.user = {
      id: decoded.sub,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };
    
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AuthenticationError('Invalid token'));
    } else {
      next(error);
    }
  }
}

// Combined authentication (API key or JWT)
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Try API key first
  const apiKey = req.headers['x-api-key'] as string || req.query.api_key as string;
  
  if (apiKey) {
    return apiKeyAuth(req, res, next);
  }
  
  // Fall back to JWT
  return jwtAuth(req, res, next);
}

// Role-based access control
export function requireRole(roles: string | string[]) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Unauthorized role access attempt', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path
      });
      
      return next(new AuthorizationError('Insufficient role privileges'));
    }
    
    next();
  };
}

// Permission-based access control
export function requirePermission(permissions: string | string[]) {
  const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
  
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }
    
    const hasPermission = requiredPermissions.every(perm => 
      req.user!.permissions.includes(perm)
    );
    
    if (!hasPermission) {
      logger.warn('Unauthorized permission access attempt', {
        userId: req.user.id,
        userPermissions: req.user.permissions,
        requiredPermissions,
        path: req.path
      });
      
      return next(new AuthorizationError('Insufficient permissions'));
    }
    
    next();
  };
}

// Rate limiting per API key
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function rateLimitByApiKey(
  maxRequests: number = 100,
  windowMs: number = 15 * 60 * 1000 // 15 minutes
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.apiKey || req.user?.id || req.ip;
    const now = Date.now();
    
    let limit = rateLimitMap.get(key);
    
    if (!limit || now > limit.resetTime) {
      limit = {
        count: 0,
        resetTime: now + windowMs
      };
    }
    
    limit.count++;
    rateLimitMap.set(key, limit);
    
    // Set headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - limit.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(limit.resetTime).toISOString());
    
    if (limit.count > maxRequests) {
      logger.warn('Rate limit exceeded', {
        key,
        count: limit.count,
        limit: maxRequests
      });
      
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        retryAfter: Math.ceil((limit.resetTime - now) / 1000)
      });
      return;
    }
    
    next();
  };
}

// IP whitelist/blacklist
const ipWhitelist = new Set(process.env.IP_WHITELIST?.split(',') || []);
const ipBlacklist = new Set(process.env.IP_BLACKLIST?.split(',') || []);

export function ipFilter(req: Request, res: Response, next: NextFunction): void {
  const clientIp = req.ip || req.socket.remoteAddress || '';
  
  // Check blacklist first
  if (ipBlacklist.has(clientIp)) {
    logger.warn('Blacklisted IP access attempt', { ip: clientIp });
    res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied'
    });
    return;
  }
  
  // Check whitelist if configured
  if (ipWhitelist.size > 0 && !ipWhitelist.has(clientIp)) {
    logger.warn('Non-whitelisted IP access attempt', { ip: clientIp });
    res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied'
    });
    return;
  }
  
  next();
}

// Request signature validation (for webhooks)
export function validateSignature(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signature = req.headers['x-signature'] as string;
    
    if (!signature) {
      return next(new ValidationError('Request signature required'));
    }
    
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    if (signature !== expectedSignature) {
      logger.warn('Invalid request signature', {
        path: req.path,
        ip: req.ip
      });
      return next(new ValidationError('Invalid request signature'));
    }
    
    next();
  };
}

// Utility functions
function extractToken(req: Request): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Check query parameter
  if (req.query.token) {
    return req.query.token as string;
  }
  
  // Check cookie
  if (req.cookies?.token) {
    return req.cookies.token;
  }
  
  return null;
}

// Token generation utilities
export function generateApiKey(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

export function generateToken(payload: any, expiresIn: string = '24h'): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn,
    issuer: 'seo-automation',
    audience: 'api'
  });
}

// Clean up rate limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, limit] of rateLimitMap.entries()) {
    if (now > limit.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 60000); // Every minute