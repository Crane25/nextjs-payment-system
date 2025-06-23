// JWT utility functions for authentication
import { config } from '../config/env';
import { SecurityMonitor } from './securityHeaders';

export interface JWTPayload {
  sub: string; // subject (user ID)
  iat: number; // issued at
  exp: number; // expiration time
  aud: string; // audience
  iss: string; // issuer
  role?: string;
  teamId?: string;
  permissions?: string[];
}

export interface JWTValidationResult {
  isValid: boolean;
  payload?: JWTPayload;
  error?: string;
}

/**
 * JWT utility class for token creation and validation
 */
export class JWTUtils {
  private static readonly ALGORITHM = 'HS256';
  private static readonly ISSUER = 'nextjs-payment-system';
  private static readonly AUDIENCE = 'payment-app-users';
  
  /**
   * Create a JWT token
   */
  static async createToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'aud' | 'iss'>): Promise<string> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const fullPayload: JWTPayload = {
        ...payload,
        iat: now,
        exp: now + (config.security.sessionTimeout / 1000), // Convert ms to seconds
        aud: this.AUDIENCE,
        iss: this.ISSUER
      };
      
      const header = {
        alg: this.ALGORITHM,
        typ: 'JWT'
      };
      
      const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
      const encodedPayload = this.base64UrlEncode(JSON.stringify(fullPayload));
      const signature = await this.sign(`${encodedHeader}.${encodedPayload}`);
      
      const token = `${encodedHeader}.${encodedPayload}.${signature}`;
      
      SecurityMonitor.logEvent('jwt_created', { 
        sub: payload.sub, 
        role: payload.role,
        expiresIn: config.security.sessionTimeout 
      }, 'low');
      
      return token;
    } catch (error) {
      SecurityMonitor.logEvent('jwt_creation_failed', { 
        sub: payload.sub,
        error: error instanceof Error ? error.message : 'Unknown'
      }, 'high');
      throw new Error('Failed to create JWT token');
    }
  }
  
  /**
   * Validate and decode a JWT token
   */
  static async validateToken(token: string): Promise<JWTValidationResult> {
    try {
      if (!token) {
        return { isValid: false, error: 'Token is required' };
      }
      
      // Remove Bearer prefix if present
      const cleanToken = token.replace(/^Bearer\s+/i, '');
      
      const parts = cleanToken.split('.');
      if (parts.length !== 3) {
        SecurityMonitor.logEvent('jwt_validation_failed', { reason: 'invalid_format' }, 'medium');
        return { isValid: false, error: 'Invalid token format' };
      }
      
      const [encodedHeader, encodedPayload, signature] = parts;
      
      // Verify signature
      const expectedSignature = await this.sign(`${encodedHeader}.${encodedPayload}`);
      if (signature !== expectedSignature) {
        SecurityMonitor.logEvent('jwt_validation_failed', { reason: 'invalid_signature' }, 'high');
        return { isValid: false, error: 'Invalid token signature' };
      }
      
      // Decode header and payload
      let header, payload;
      try {
        header = JSON.parse(this.base64UrlDecode(encodedHeader));
        payload = JSON.parse(this.base64UrlDecode(encodedPayload)) as JWTPayload;
      } catch {
        SecurityMonitor.logEvent('jwt_validation_failed', { reason: 'decode_error' }, 'medium');
        return { isValid: false, error: 'Failed to decode token' };
      }
      
      // Validate header
      if (header.alg !== this.ALGORITHM || header.typ !== 'JWT') {
        SecurityMonitor.logEvent('jwt_validation_failed', { reason: 'invalid_header' }, 'medium');
        return { isValid: false, error: 'Invalid token header' };
      }
      
      // Validate payload
      const now = Math.floor(Date.now() / 1000);
      
      if (payload.exp && payload.exp < now) {
        SecurityMonitor.logEvent('jwt_validation_failed', { 
          reason: 'token_expired',
          sub: payload.sub,
          expiredAt: payload.exp,
          now 
        }, 'medium');
        return { isValid: false, error: 'Token has expired' };
      }
      
      if (payload.iat && payload.iat > now + 60) { // Allow 60 seconds clock skew
        SecurityMonitor.logEvent('jwt_validation_failed', { 
          reason: 'future_token',
          sub: payload.sub,
          issuedAt: payload.iat,
          now 
        }, 'high');
        return { isValid: false, error: 'Token issued in the future' };
      }
      
      if (payload.aud !== this.AUDIENCE) {
        SecurityMonitor.logEvent('jwt_validation_failed', { 
          reason: 'invalid_audience',
          expected: this.AUDIENCE,
          actual: payload.aud 
        }, 'medium');
        return { isValid: false, error: 'Invalid token audience' };
      }
      
      if (payload.iss !== this.ISSUER) {
        SecurityMonitor.logEvent('jwt_validation_failed', { 
          reason: 'invalid_issuer',
          expected: this.ISSUER,
          actual: payload.iss 
        }, 'medium');
        return { isValid: false, error: 'Invalid token issuer' };
      }
      
      // Validate required fields
      if (!payload.sub) {
        SecurityMonitor.logEvent('jwt_validation_failed', { reason: 'missing_subject' }, 'medium');
        return { isValid: false, error: 'Token missing subject' };
      }
      
      SecurityMonitor.logEvent('jwt_validated', { 
        sub: payload.sub,
        role: payload.role,
        remainingTime: payload.exp ? payload.exp - now : 0
      }, 'low');
      
      return { isValid: true, payload };
    } catch (error) {
      SecurityMonitor.logEvent('jwt_validation_error', { 
        error: error instanceof Error ? error.message : 'Unknown'
      }, 'high');
      return { isValid: false, error: 'Token validation error' };
    }
  }
  
  /**
   * Extract payload without validation (for debugging only)
   */
  static extractPayload(token: string): JWTPayload | null {
    try {
      const cleanToken = token.replace(/^Bearer\s+/i, '');
      const parts = cleanToken.split('.');
      if (parts.length !== 3) return null;
      
      const payload = JSON.parse(this.base64UrlDecode(parts[1])) as JWTPayload;
      return payload;
    } catch {
      return null;
    }
  }
  
  /**
   * Check if token is expired (without full validation)
   */
  static isTokenExpired(token: string): boolean {
    const payload = this.extractPayload(token);
    if (!payload || !payload.exp) return true;
    
    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now;
  }
  
  /**
   * Get token expiration time
   */
  static getTokenExpiration(token: string): Date | null {
    const payload = this.extractPayload(token);
    if (!payload || !payload.exp) return null;
    
    return new Date(payload.exp * 1000);
  }
  
  /**
   * Refresh token if it's close to expiring
   */
  static async refreshTokenIfNeeded(token: string, refreshThresholdMs: number = 5 * 60 * 1000): Promise<string | null> {
    const payload = this.extractPayload(token);
    if (!payload || !payload.exp) return null;
    
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = (payload.exp - now) * 1000;
    
    if (timeUntilExpiry <= refreshThresholdMs) {
      // Token is expiring soon, create a new one
      const newToken = await this.createToken({
        sub: payload.sub,
        role: payload.role,
        teamId: payload.teamId,
        permissions: payload.permissions
      });
      
      SecurityMonitor.logEvent('jwt_refreshed', { 
        sub: payload.sub,
        oldExpiry: payload.exp,
        timeRemaining: timeUntilExpiry
      }, 'low');
      
      return newToken;
    }
    
    return null;
  }
  
  /**
   * Base64 URL encode
   */
  private static base64UrlEncode(str: string): string {
    const base64 = btoa(str);
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
  
  /**
   * Base64 URL decode
   */
  private static base64UrlDecode(str: string): string {
    let base64 = str
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding
    const pad = base64.length % 4;
    if (pad === 2) base64 += '==';
    else if (pad === 3) base64 += '=';
    
    return atob(base64);
  }
  
  /**
   * Create HMAC signature
   */
  private static async sign(data: string): Promise<string> {
    try {
      // Get secret key from config
      const secret = config.security.sessionSecret;
      const encoder = new TextEncoder();
      
      // Import key
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      // Sign data
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
      
      // Convert to base64url
      const signatureArray = new Uint8Array(signature);
      const base64 = btoa(String.fromCharCode.apply(null, Array.from(signatureArray)));
      return base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    } catch (error) {
      SecurityMonitor.logEvent('jwt_signing_failed', { 
        error: error instanceof Error ? error.message : 'Unknown'
      }, 'high');
      throw new Error('Failed to sign JWT token');
    }
  }
}

/**
 * Middleware function for API route authentication
 */
export function withJWTAuth(handler: Function) {
  return async function(req: any, res: any) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        SecurityMonitor.logEvent('api_auth_failed', { 
          reason: 'missing_auth_header',
          path: req.url,
          method: req.method,
          ip: req.ip || req.connection?.remoteAddress
        }, 'medium');
        
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }
      
      const token = authHeader.substring(7);
      const validation = await JWTUtils.validateToken(token);
      
      if (!validation.isValid) {
        SecurityMonitor.logEvent('api_auth_failed', { 
          reason: 'invalid_token',
          error: validation.error,
          path: req.url,
          method: req.method,
          ip: req.ip || req.connection?.remoteAddress
        }, 'medium');
        
        return res.status(401).json({ 
          error: validation.error || 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }
      
      // Add user info to request
      req.user = validation.payload;
      
      SecurityMonitor.logEvent('api_auth_success', { 
        sub: validation.payload!.sub,
        role: validation.payload!.role,
        path: req.url,
        method: req.method
      }, 'low');
      
      return handler(req, res);
    } catch (error) {
      SecurityMonitor.logEvent('api_auth_error', { 
        error: error instanceof Error ? error.message : 'Unknown',
        path: req.url,
        method: req.method
      }, 'high');
      
      return res.status(500).json({ 
        error: 'Authentication error',
        code: 'AUTH_ERROR'
      });
    }
  };
}

/**
 * Role-based authorization middleware
 */
export function withRoleAuth(allowedRoles: string[]) {
  return function(handler: Function) {
    return withJWTAuth(async function(req: any, res: any) {
      const userRole = req.user?.role;
      
      if (!userRole || !allowedRoles.includes(userRole)) {
        SecurityMonitor.logEvent('api_authorization_failed', { 
          sub: req.user?.sub,
          userRole,
          requiredRoles: allowedRoles,
          path: req.url,
          method: req.method
        }, 'medium');
        
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }
      
      SecurityMonitor.logEvent('api_authorization_success', { 
        sub: req.user.sub,
        role: userRole,
        path: req.url,
        method: req.method
      }, 'low');
      
      return handler(req, res);
    });
  };
}

/**
 * Permission-based authorization middleware
 */
export function withPermissionAuth(requiredPermissions: string[]) {
  return function(handler: Function) {
    return withJWTAuth(async function(req: any, res: any) {
      const userPermissions = req.user?.permissions || [];
      
      const hasPermission = requiredPermissions.some(permission => 
        userPermissions.includes(permission)
      );
      
      if (!hasPermission) {
        SecurityMonitor.logEvent('api_permission_failed', { 
          sub: req.user?.sub,
          userPermissions,
          requiredPermissions,
          path: req.url,
          method: req.method
        }, 'medium');
        
        return res.status(403).json({ 
          error: 'Missing required permissions',
          code: 'MISSING_PERMISSIONS'
        });
      }
      
      SecurityMonitor.logEvent('api_permission_success', { 
        sub: req.user.sub,
        permissions: userPermissions,
        path: req.url,
        method: req.method
      }, 'low');
      
      return handler(req, res);
    });
  };
}