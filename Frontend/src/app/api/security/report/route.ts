import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../config/env';
import { InputValidator, OperationRateLimit } from '../../../../utils/validation';
import { JWTUtils, withJWTAuth, withRoleAuth } from '../../../../utils/jwt';

// In production, you would store these in a database or send to a monitoring service
const securityEvents: Array<{
  id: string;
  timestamp: number;
  event: string;
  severity: string;
  data: any;
  ip: string;
  userAgent: string;
}> = [];

export async function POST(request: NextRequest) {
  try {
    // Get client info
    const ip = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Enhanced rate limiting check
    if (!OperationRateLimit.checkLimit(ip, 'security_report', 10, 15 * 60 * 1000)) {
      const remainingTime = OperationRateLimit.getRemainingTime(ip, 'security_report');
      return NextResponse.json(
        { 
          error: 'Too many security reports',
          retryAfter: Math.ceil(remainingTime / 1000)
        },
        { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil(remainingTime / 1000).toString()
          }
        }
      );
    }

    // Validate content type
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 400 }
      );
    }

    // Parse and validate request body
    let body: any;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON format' },
        { status: 400 }
      );
    }

    // Validate required fields with enhanced validation
    const eventValidation = InputValidator.validateText(body.event, {
      required: true,
      minLength: 1,
      maxLength: 100,
      allowSpecialChars: false,
      allowHtml: false
    });

    if (!eventValidation.isValid) {
      return NextResponse.json(
        { error: `Event validation failed: ${eventValidation.error}` },
        { status: 400 }
      );
    }

    const severityValidation = InputValidator.validateSeverity(body.severity);
    if (!severityValidation.isValid) {
      return NextResponse.json(
        { error: `Severity validation failed: ${severityValidation.error}` },
        { status: 400 }
      );
    }

    // Validate and sanitize data field
    let sanitizedData: Record<string, any> = {};
    if (body.data && typeof body.data === 'object') {
      // Sanitize each field in data object
      for (const [key, value] of Object.entries(body.data)) {
        if (typeof value === 'string') {
          const dataValidation = InputValidator.validateText(value, {
            maxLength: 500,
            allowSpecialChars: true,
            allowHtml: false
          });
          if (dataValidation.isValid) {
            sanitizedData[key] = dataValidation.sanitizedValue;
          }
        } else if (typeof value === 'number' && isFinite(value as number)) {
          sanitizedData[key] = value;
        } else if (typeof value === 'boolean') {
          sanitizedData[key] = value;
        }
        // Skip invalid data types
      }
    }

    // Create security event record with validated data
    const securityEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      event: eventValidation.sanitizedValue,
      severity: severityValidation.sanitizedValue,
      data: sanitizedData,
      ip,
      userAgent: userAgent.substring(0, 200) // Limit user agent length
    };

    // Store event (in production, use database)
    securityEvents.push(securityEvent);
    
    // Keep only last 10000 events to prevent memory issues
    if (securityEvents.length > 10000) {
      securityEvents.splice(0, securityEvents.length - 10000);
    }

    // Log critical events immediately
    if (severityValidation.sanitizedValue === 'critical') {
      console.error('[CRITICAL SECURITY EVENT]', {
        ...securityEvent,
        data: JSON.stringify(securityEvent.data).substring(0, 500) // Limit log size
      });
      
      // In production, send alerts (email, Slack, etc.)
      await sendSecurityAlert(securityEvent);
    }

    return NextResponse.json(
      { 
        success: true, 
        eventId: securityEvent.id,
        timestamp: securityEvent.timestamp
      },
      { 
        status: 201,
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY'
        }
      }
    );

  } catch (error) {
    // Only log detailed errors in development
    if (config.app.isDevelopment) {
      console.error('Security report API error:', error);
    }
    
    // Don't expose internal error details
    return NextResponse.json(
      { error: 'Service temporarily unavailable' },
      { 
        status: 503,
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY'
        }
      }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    
    // Enhanced rate limiting for GET requests
    if (!OperationRateLimit.checkLimit(ip, 'security_report_read', 20, 60 * 1000)) {
      const remainingTime = OperationRateLimit.getRemainingTime(ip, 'security_report_read');
      return NextResponse.json(
        { 
          error: 'Too many requests',
          retryAfter: Math.ceil(remainingTime / 1000)
        },
        { status: 429 }
      );
    }

    // Enhanced authentication check
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization header required' },
        { status: 401 }
      );
    }

    // Validate Bearer token format
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/);
    if (!tokenMatch) {
      return NextResponse.json(
        { error: 'Invalid authorization format. Use: Bearer <token>' },
        { status: 401 }
      );
    }

    const token = tokenMatch[1];
    
    // Validate token format (basic validation)
    if (!token || token.length < 10 || token.length > 500) {
      return NextResponse.json(
        { error: 'Invalid token format' },
        { status: 401 }
      );
    }

    // In production, validate the actual token against your auth system
    // For now, we'll do basic validation
    if (!(await isValidAuthToken(token))) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    
    // Validate severity parameter
    let validatedSeverity: string | null = null;
    const severityParam = searchParams.get('severity');
    if (severityParam) {
      const severityValidation = InputValidator.validateSeverity(severityParam);
      if (!severityValidation.isValid) {
        return NextResponse.json(
          { error: `Invalid severity parameter: ${severityValidation.error}` },
          { status: 400 }
        );
      }
      validatedSeverity = severityValidation.sanitizedValue;
    }

    // Validate pagination parameters
    const limitParam = searchParams.get('limit') || '100';
    const offsetParam = searchParams.get('offset') || '0';
    
    const paginationValidation = InputValidator.validatePagination(limitParam, offsetParam);
    if (!paginationValidation.isValid) {
      return NextResponse.json(
        { error: `Pagination validation failed: ${paginationValidation.error}` },
        { status: 400 }
      );
    }

    const { limit, offset } = paginationValidation.sanitizedValue;

    // Filter events
    let filteredEvents = securityEvents;

    // Apply severity filter if provided
    if (validatedSeverity) {
      filteredEvents = filteredEvents.filter(event => event.severity === validatedSeverity);
    }

    // Sort by timestamp (newest first)
    filteredEvents.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const paginatedEvents = filteredEvents.slice(offset, offset + limit);

    // Sanitize response data (remove sensitive information)
    const sanitizedEvents = paginatedEvents.map(event => ({
      id: event.id,
      timestamp: event.timestamp,
      event: event.event,
      severity: event.severity,
      data: sanitizeEventData(event.data),
      // Don't expose full IP and user agent for privacy
      ipHash: hashIP(event.ip),
      userAgentInfo: extractSafeUserAgentInfo(event.userAgent)
    }));

    return NextResponse.json({
      events: sanitizedEvents,
      total: filteredEvents.length,
      offset,
      limit,
      hasMore: offset + limit < filteredEvents.length
    }, {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });

  } catch (error) {
    console.error('Security report GET API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper functions with enhanced security
function getClientIP(request: NextRequest): string {
  // Check multiple headers for IP (in order of preference)
  const headers = [
    'x-forwarded-for',
    'x-real-ip',
    'x-client-ip',
    'cf-connecting-ip' // Cloudflare
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

async function isValidAuthToken(token: string): Promise<boolean> {
  try {
    // Use our JWT validation utility
    const validation = await JWTUtils.validateToken(token);
    
    if (!validation.isValid) {
      return false;
    }
    
    // Check if user has permission to access security reports
    const payload = validation.payload!;
    const hasPermission = payload.role === 'admin' || 
                         (payload.permissions ? payload.permissions.includes('security:read') : false);
    
    return hasPermission;
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
}

function sanitizeEventData(data: any): any {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Only include safe, non-sensitive data
    if (typeof value === 'string' && value.length <= 200) {
      // Remove any potential sensitive patterns
      const cleaned = value
        .replace(/password/gi, '[REDACTED]')
        .replace(/token/gi, '[REDACTED]')
        .replace(/secret/gi, '[REDACTED]')
        .replace(/key/gi, '[REDACTED]');
      
      sanitized[key] = cleaned;
    } else if (typeof value === 'number' && isFinite(value)) {
      sanitized[key] = value;
    } else if (typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

function hashIP(ip: string): string {
  // Simple hash for IP privacy (in production, use proper hashing)
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

function extractSafeUserAgentInfo(userAgent: string): any {
  // Extract only safe, non-identifying information from user agent
  const info: any = {};
  
  if (userAgent.includes('Chrome')) info.browser = 'Chrome';
  else if (userAgent.includes('Firefox')) info.browser = 'Firefox';
  else if (userAgent.includes('Safari')) info.browser = 'Safari';
  else if (userAgent.includes('Edge')) info.browser = 'Edge';
  else info.browser = 'Other';
  
  if (userAgent.includes('Windows')) info.os = 'Windows';
  else if (userAgent.includes('Mac')) info.os = 'macOS';
  else if (userAgent.includes('Linux')) info.os = 'Linux';
  else if (userAgent.includes('Android')) info.os = 'Android';
  else if (userAgent.includes('iOS')) info.os = 'iOS';
  else info.os = 'Other';
  
  return info;
}

async function sendSecurityAlert(event: any): Promise<void> {
  // Enhanced security alerting with validation
  try {
    // Validate CSP report URI
    if (config.security.cspReportUri) {
      const urlValidation = InputValidator.validateUrl(config.security.cspReportUri, { requireHttps: true });
      
      if (urlValidation.isValid) {
        // Sanitize event data before sending
        const sanitizedEvent = {
          id: event.id,
          timestamp: event.timestamp,
          event: event.event,
          severity: event.severity,
          data: sanitizeEventData(event.data)
        };

        await fetch(urlValidation.sanitizedValue, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'SecurityMonitor/1.0'
          },
          body: JSON.stringify(sanitizedEvent),
          // Add timeout to prevent hanging
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });
      }
    }
  } catch (error) {
    console.error('Failed to send security alert:', error);
    // Don't throw error to avoid breaking the main flow
  }
} 