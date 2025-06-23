import { NextRequest, NextResponse } from 'next/server';
import { config as appConfig } from './src/config/env';
import { serverConfig } from './src/config/env.server';
import { SecurityHeaders, SecurityMonitor } from './src/utils/securityHeaders';
import { InputValidator, OperationRateLimit } from './src/utils/validation';

// Enhanced security middleware with comprehensive protection
export function middleware(request: NextRequest) {
  const startTime = Date.now();
  const ip = getClientIP(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const path = request.nextUrl.pathname;
  const method = request.method;

  try {
    // 1. IP Filtering (if enabled)
    if (appConfig.security.blockedIPs.length > 0 && appConfig.security.blockedIPs.includes(ip)) {
      SecurityMonitor.logEvent('blocked_ip_access', { ip, path, userAgent }, 'high', 'access');
      return new NextResponse('Access Denied', { status: 403 });
    }

    if (appConfig.security.allowedIPs.length > 0 && !appConfig.security.allowedIPs.includes(ip)) {
      SecurityMonitor.logEvent('unauthorized_ip_access', { ip, path, userAgent }, 'medium', 'access');
      return new NextResponse('Access Denied', { status: 403 });
    }

    // 2. Maintenance Mode Check
    if (appConfig.features.enableMaintenanceMode && !path.startsWith('/api/health')) {
      return new NextResponse('Service Temporarily Unavailable', { 
        status: 503,
        headers: { 'Retry-After': '3600' }
      });
    }

    // 3. Enhanced Rate Limiting
    const rateLimitResult = checkRateLimit(request, ip, path);
    if (!rateLimitResult.allowed) {
      SecurityMonitor.logEvent('rate_limit_exceeded', {
        ip,
        path,
        userAgent,
        attempts: rateLimitResult.attempts,
        resetTime: rateLimitResult.resetTime
      }, 'medium', 'rate_limit');

    return new NextResponse('Too Many Requests', { 
      status: 429,
      headers: {
          'Retry-After': Math.ceil(rateLimitResult.remainingTime / 1000).toString(),
          'X-RateLimit-Limit': appConfig.security.rateLimitMaxRequests.toString(),
        'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateLimitResult.resetTime.toString()
      }
    });
  }
  
    // 4. Path Validation and Sanitization
    const pathValidation = validatePath(path);
    if (!pathValidation.isValid) {
      SecurityMonitor.logEvent('invalid_path_access', {
        ip,
        originalPath: path,
        error: pathValidation.error,
        userAgent
      }, 'high', 'validation');
      
      return new NextResponse('Bad Request', { status: 400 });
    }

    // 5. Method Validation
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    if (!allowedMethods.includes(method)) {
      SecurityMonitor.logEvent('invalid_http_method', {
        ip,
        path,
        method,
        userAgent
      }, 'medium', 'validation');
      
      return new NextResponse('Method Not Allowed', { status: 405 });
    }

    // 6. User Agent Validation
    const userAgentValidation = validateUserAgent(userAgent);
    if (!userAgentValidation.isValid) {
      SecurityMonitor.logEvent('suspicious_user_agent', {
        ip,
        path,
        userAgent,
        reason: userAgentValidation.reason
      }, 'medium', 'validation');
      
      // Don't block, but log for monitoring
    }

    // 7. Query Parameter Validation
    const queryValidation = validateQueryParameters(request.nextUrl.searchParams);
    if (!queryValidation.isValid) {
      SecurityMonitor.logEvent('invalid_query_parameters', {
        ip,
        path,
        invalidParams: queryValidation.invalidParams,
        userAgent
      }, 'medium', 'validation');
      
      return new NextResponse('Bad Request', { status: 400 });
    }

    // 8. Content-Length Validation for POST/PUT requests
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const contentLength = parseInt(request.headers.get('content-length') || '0');
      if (contentLength > appConfig.security.maxInputLength) {
        SecurityMonitor.logEvent('oversized_request', {
          ip,
          path,
          contentLength,
          maxAllowed: appConfig.security.maxInputLength,
          userAgent
        }, 'medium', 'validation');
        
    return new NextResponse('Request Entity Too Large', { status: 413 });
  }
    }

    // 9. Security Headers Validation for API requests
    if (path.startsWith('/api/')) {
      const headerValidation = validateSecurityHeaders(request);
      if (!headerValidation.isValid) {
        SecurityMonitor.logEvent('missing_security_headers', {
          ip,
          path,
          missingHeaders: headerValidation.missingHeaders,
          userAgent
        }, 'low', 'validation');
        
        // Don't block API requests for missing headers, but log
      }
    }

    // 10. CSRF Protection for state-changing requests
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && path.startsWith('/api/')) {
      const csrfValidation = validateCSRFToken(request);
      if (!csrfValidation.isValid) {
        SecurityMonitor.logEvent('csrf_validation_failed', {
          ip,
          path,
          method,
          reason: csrfValidation.reason,
          userAgent
        }, 'high', 'csrf');
        
      return new NextResponse('CSRF Token Invalid', { status: 403 });
    }
  }
  
    // Continue to next middleware/page
    const response = NextResponse.next();

    // 11. Add Enhanced Security Headers
    if (appConfig.security.securityHeadersEnabled) {
      const securityHeaders = new SecurityHeaders({
        csp: {
          scriptSrc: appConfig.security.scriptSources,
          styleSrc: appConfig.security.styleSources,
          imgSrc: appConfig.security.imgSources,
          connectSrc: appConfig.security.connectSources,
          fontSrc: appConfig.security.fontSources,
          frameSrc: appConfig.security.frameSources,
          objectSrc: ['none']
        },
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        },
        frameOptions: 'DENY',
        contentTypeOptions: true,
        xssProtection: true,
        referrerPolicy: 'strict-origin-when-cross-origin',
        permissionsPolicy: {
          camera: [],
          microphone: [],
          geolocation: [],
          payment: ['self'],
          usb: []
        }
      });

      const headers = securityHeaders.getAllHeaders();
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

      // Add custom security headers
      response.headers.set('X-Request-ID', crypto.randomUUID());
      response.headers.set('X-Response-Time', (Date.now() - startTime).toString());
      response.headers.set('X-Security-Version', '1.0');
    }

    // 12. Add Rate Limit Headers
    response.headers.set('X-RateLimit-Limit', appConfig.security.rateLimitMaxRequests.toString());
    response.headers.set('X-RateLimit-Remaining', (appConfig.security.rateLimitMaxRequests - rateLimitResult.attempts).toString());
    response.headers.set('X-RateLimit-Reset', rateLimitResult.resetTime.toString());

    // 13. Log successful request
    SecurityMonitor.logEvent('request_processed', {
      ip,
      path,
      method,
      userAgent: userAgent.substring(0, 100),
      responseTime: Date.now() - startTime,
      statusCode: response.status
    }, 'low', 'access');

    return response;

  } catch (error) {
    // Log middleware errors
    SecurityMonitor.logEvent('middleware_error', {
      ip,
      path,
      method,
      error: error instanceof Error ? error.message : 'Unknown error',
      userAgent
    }, 'critical', 'other');

    // Only log detailed errors in development
    if (appConfig.app.isDevelopment) {
      console.error('Middleware error:', error);
    }
    
    // Return safe error response
    return new NextResponse('Service Temporarily Unavailable', { status: 503 });
  }
}

// Helper Functions

function getClientIP(request: NextRequest): string {
  // Check multiple headers for IP (in order of preference)
  const headers = [
    'x-forwarded-for',
    'x-real-ip',
    'x-client-ip',
    'cf-connecting-ip', // Cloudflare
    'x-cluster-client-ip',
    'x-forwarded',
    'forwarded-for',
    'forwarded'
  ];

  for (const header of headers) {
    const value = request.headers.get(header);
    if (value) {
      // Take the first IP if there are multiple (comma-separated)
      const ip = value.split(',')[0].trim();
      if (isValidIP(ip)) {
        return ip;
      }
    }
  }

  // Fallback to request.ip or unknown
  return request.ip || 'unknown';
}

function isValidIP(ip: string): boolean {
  // Basic IP validation (IPv4 and IPv6)
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

interface RateLimitResult {
  allowed: boolean;
  attempts: number;
  resetTime: number;
  remainingTime: number;
}

function checkRateLimit(request: NextRequest, ip: string, path: string): RateLimitResult {
  // Different rate limits for different endpoints
  let maxRequests = appConfig.security.rateLimitMaxRequests;
  let windowMs = appConfig.security.rateLimitWindowMs;

  // Stricter limits for sensitive endpoints
  if (path.startsWith('/api/auth/')) {
    maxRequests = Math.floor(maxRequests * 0.2); // 20% of normal limit
  } else if (path.startsWith('/api/security/')) {
    maxRequests = Math.floor(maxRequests * 0.1); // 10% of normal limit
  } else if (path.startsWith('/api/')) {
    maxRequests = Math.floor(maxRequests * 0.5); // 50% of normal limit
  }

  const identifier = `${ip}:${path.split('/')[1] || 'root'}`;
  
  return {
    allowed: OperationRateLimit.checkLimit(identifier, 'http_request', maxRequests, windowMs),
    attempts: 0, // This would need to be tracked properly
    resetTime: Date.now() + windowMs,
    remainingTime: windowMs
  };
}

function validatePath(path: string): { isValid: boolean; error?: string } {
  // Path length validation
  if (path.length > 2000) {
    return { isValid: false, error: 'Path too long' };
  }

  // Check for path traversal attempts
  const dangerousPatterns = [
    /\.\./g, // Directory traversal
    /\/\//g, // Double slashes
    /%2e%2e/gi, // URL encoded ..
    /%2f/gi, // URL encoded /
    /\0/g, // Null bytes
    /[<>]/g, // HTML brackets
    /javascript:/gi, // JavaScript protocol
    /data:/gi, // Data protocol
    /vbscript:/gi, // VBScript protocol
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(path)) {
      return { isValid: false, error: 'Dangerous path pattern detected' };
    }
  }

  return { isValid: true };
}

function validateUserAgent(userAgent: string): { isValid: boolean; reason?: string } {
  // Empty or very short user agents are suspicious
  if (!userAgent || userAgent.length < 10) {
    return { isValid: false, reason: 'User agent too short or missing' };
  }

  // Very long user agents are suspicious
  if (userAgent.length > 1000) {
    return { isValid: false, reason: 'User agent too long' };
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /bot/i, // Generic bot pattern (might want to allow specific bots)
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
    /<script>/i,
    /javascript:/i,
    /\x00/g // Null bytes
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(userAgent)) {
      return { isValid: false, reason: 'Suspicious user agent pattern' };
    }
  }

  return { isValid: true };
}

function validateQueryParameters(searchParams: URLSearchParams): { isValid: boolean; invalidParams?: string[] } {
  const invalidParams: string[] = [];

  searchParams.forEach((value, key) => {
    // Validate parameter name
    const keyValidation = InputValidator.validateText(key, {
      maxLength: 100,
      allowSpecialChars: false,
      allowHtml: false
    });

    if (!keyValidation.isValid) {
      invalidParams.push(`key:${key}`);
      return; // Use return instead of continue in forEach
    }

    // Validate parameter value
    const valueValidation = InputValidator.validateText(value, {
      maxLength: 1000,
      allowSpecialChars: true,
      allowHtml: false
    });

    if (!valueValidation.isValid) {
      invalidParams.push(`value:${key}=${value.substring(0, 50)}`);
    }
  });

  return {
    isValid: invalidParams.length === 0,
    invalidParams: invalidParams.length > 0 ? invalidParams : undefined
  };
}

function validateSecurityHeaders(request: NextRequest): { isValid: boolean; missingHeaders?: string[] } {
  const requiredHeaders = ['user-agent', 'accept'];
  const missingHeaders: string[] = [];

  for (const header of requiredHeaders) {
    if (!request.headers.get(header)) {
      missingHeaders.push(header);
    }
  }

  // Check for suspicious header combinations
  const referer = request.headers.get('referer');
  const origin = request.headers.get('origin');
  
  if (origin && referer) {
    try {
      const originUrl = new URL(origin);
      const refererUrl = new URL(referer);
      
      // Basic origin/referer mismatch check
      if (originUrl.hostname !== refererUrl.hostname) {
        missingHeaders.push('origin-referer-mismatch');
      }
    } catch {
      // Invalid URLs
      missingHeaders.push('invalid-origin-referer');
    }
  }

  return {
    isValid: missingHeaders.length === 0,
    missingHeaders: missingHeaders.length > 0 ? missingHeaders : undefined
  };
}

function validateCSRFToken(request: NextRequest): { isValid: boolean; reason?: string } {
  // In development, skip CSRF validation
  if (appConfig.app.isDevelopment) {
    return { isValid: true };
  }

  const token = request.headers.get('x-csrf-token') || request.headers.get('csrf-token');
  const sessionId = request.headers.get('x-session-id') || 'anonymous';

  if (!token) {
    return { isValid: false, reason: 'CSRF token missing' };
  }

  // Basic token format validation
  if (token.length < 10 || token.length > 100) {
    return { isValid: false, reason: 'Invalid CSRF token format' };
  }

  // In production, implement proper CSRF validation
  // For now, just check basic format
  if (!/^[a-zA-Z0-9\-_]+$/.test(token)) {
    return { isValid: false, reason: 'Invalid CSRF token characters' };
  }

  return { isValid: true };
}

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|favicon.svg|public/).*)',
  ],
}; 