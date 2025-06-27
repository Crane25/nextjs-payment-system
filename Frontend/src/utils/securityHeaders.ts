import { config } from '../config/env';

// HTTPS Redirect Middleware
export function createHttpsRedirect() {
  return (req: any, res: any, next: any) => {
    if (config.security.forceHttps && req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  };
}

// Security headers utility functions
export interface SecurityHeadersConfig {
  csp?: {
    scriptSrc?: string[];
    styleSrc?: string[];
    imgSrc?: string[];
    connectSrc?: string[];
    fontSrc?: string[];
    objectSrc?: string[];
    mediaSrc?: string[];
    frameSrc?: string[];
  };
  hsts?: {
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  frameOptions?: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM';
  contentTypeOptions?: boolean;
  xssProtection?: boolean;
  referrerPolicy?: string;
  permissionsPolicy?: Record<string, string[]>;
}

export class SecurityHeaders {
  private config: SecurityHeadersConfig;

  constructor(config: SecurityHeadersConfig = {}) {
    this.config = {
      csp: {
        scriptSrc: ['self', 'unsafe-inline', 'unsafe-eval'],
        styleSrc: ['self', 'unsafe-inline'],
        imgSrc: ['self', 'data:', 'blob:'],
        connectSrc: ['self'],
        fontSrc: ['self'],
        objectSrc: ['none'],
        mediaSrc: ['self'],
        frameSrc: ['none'],
        ...config.csp
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
        ...config.hsts
      },
      frameOptions: config.frameOptions || 'DENY',
      contentTypeOptions: config.contentTypeOptions !== false,
      xssProtection: config.xssProtection !== false,
      referrerPolicy: config.referrerPolicy || 'strict-origin-when-cross-origin',
      permissionsPolicy: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: [],
        usb: [],
        ...config.permissionsPolicy
      }
    };
  }

  generateCSP(): string {
    const directives: string[] = [];
    
    if (this.config.csp) {
      Object.entries(this.config.csp).forEach(([directive, sources]) => {
        if (sources && sources.length > 0) {
          const directiveName = directive.replace(/([A-Z])/g, '-$1').toLowerCase();
          const sourceList = sources.map(src => src === 'self' ? "'self'" : src).join(' ');
          directives.push(`${directiveName} ${sourceList}`);
        }
      });
    }
    
    // Add default directives
    directives.push("default-src 'self'");
    directives.push("base-uri 'self'");
    directives.push("form-action 'self'");
    directives.push("frame-ancestors 'none'");
    directives.push("upgrade-insecure-requests");
    directives.push("block-all-mixed-content");
    
    return directives.join('; ');
  }

  generateHSTS(): string {
    if (!this.config.hsts) return '';
    
    const parts = [`max-age=${this.config.hsts.maxAge}`];
    
    if (this.config.hsts.includeSubDomains) {
      parts.push('includeSubDomains');
    }
    
    if (this.config.hsts.preload) {
      parts.push('preload');
    }
    
    return parts.join('; ');
  }

  generatePermissionsPolicy(): string {
    if (!this.config.permissionsPolicy) return '';
    
    const policies = Object.entries(this.config.permissionsPolicy).map(([feature, allowlist]) => {
      const origins = allowlist.length > 0 ? allowlist.join(' ') : '';
      return `${feature}=(${origins})`;
    });
    
    return policies.join(', ');
  }

  getAllHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    
    headers['Content-Security-Policy'] = this.generateCSP();
    headers['Strict-Transport-Security'] = this.generateHSTS();
    headers['X-Frame-Options'] = this.config.frameOptions!;
    headers['Referrer-Policy'] = this.config.referrerPolicy!;
    headers['Permissions-Policy'] = this.generatePermissionsPolicy();
    
    if (this.config.contentTypeOptions) {
      headers['X-Content-Type-Options'] = 'nosniff';
    }
    
    if (this.config.xssProtection) {
      headers['X-XSS-Protection'] = '1; mode=block';
    }
    
    // Additional security headers
    headers['X-DNS-Prefetch-Control'] = 'off';
    headers['X-Download-Options'] = 'noopen';
    headers['X-Permitted-Cross-Domain-Policies'] = 'none';
    headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
    headers['Cross-Origin-Opener-Policy'] = 'same-origin';
    headers['Cross-Origin-Resource-Policy'] = 'same-origin';
    
    return headers;
  }
}

// Enhanced security event interface
export interface SecurityEvent {
  timestamp: number;
  userId?: string;
  action: string;
  category: 'auth' | 'data' | 'access' | 'validation' | 'rate_limit' | 'injection' | 'xss' | 'csrf' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  data?: Record<string, any>;
  ip?: string;
  userAgent?: string;
  sessionId?: string;
}

// Enhanced security monitoring with better validation and logging
export class SecurityMonitor {
  private static events: SecurityEvent[] = [];
  private static readonly MAX_EVENTS = 10000;
  private static readonly ALERT_THRESHOLDS = {
    critical: 1,
    high: 5,
    medium: 20,
    low: 100
  };

  /**
   * Log a security event with enhanced validation
   */
  static logEvent(
    action: string,
    data: Record<string, any> = {},
    severity: 'low' | 'medium' | 'high' | 'critical' = 'low',
    category: SecurityEvent['category'] = 'other',
    userId?: string
  ): void {
    try {
      // Validate input parameters
      if (!action || typeof action !== 'string' || action.trim().length === 0) {
        if (config.app.isDevelopment) {
          console.warn('SecurityMonitor: Invalid action parameter');
        }
        return;
      }

      // Sanitize action string
      const sanitizedAction = action.trim().substring(0, 100);

      // Validate and sanitize data object
      const sanitizedData = this.sanitizeEventData(data);

      // Create security event
      const event: SecurityEvent = {
        timestamp: Date.now(),
        action: sanitizedAction,
        category,
        severity,
        data: sanitizedData,
        userId: userId?.substring(0, 50), // Limit user ID length
        ip: this.getCurrentIP(),
        userAgent: this.getCurrentUserAgent(),
        sessionId: this.generateSessionId()
      };

      // Store event
      this.events.push(event);

      // Maintain event limit
      if (this.events.length > this.MAX_EVENTS) {
        this.events.splice(0, this.events.length - this.MAX_EVENTS);
      }

      // Log based on severity and environment
      this.logToConsole(event);

      // Check for alert thresholds
      this.checkAlertThresholds(event);

      // Send to external monitoring if configured
      if (config.security.enableExternalLogging) {
        this.sendToExternalMonitoring(event);
      }

    } catch (error) {
      // Only log errors in development
      if (config.app.isDevelopment) {
        console.error('SecurityMonitor: Error logging event:', error);
      }
    }
  }

  /**
   * Get recent security events with filtering
   */
  static getEvents(filter?: {
    severity?: SecurityEvent['severity'];
    category?: SecurityEvent['category'];
    userId?: string;
    limit?: number;
    since?: number;
  }): SecurityEvent[] {
    let filteredEvents = [...this.events];

    if (filter) {
      if (filter.severity) {
        filteredEvents = filteredEvents.filter(event => event.severity === filter.severity);
      }
      
      if (filter.category) {
        filteredEvents = filteredEvents.filter(event => event.category === filter.category);
      }
      
      if (filter.userId) {
        filteredEvents = filteredEvents.filter(event => event.userId === filter.userId);
      }
      
      if (filter.since) {
        filteredEvents = filteredEvents.filter(event => event.timestamp >= filter.since!);
      }
    }

    // Sort by timestamp (newest first)
    filteredEvents.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    const limit = filter?.limit || 1000;
    return filteredEvents.slice(0, limit);
  }

  /**
   * Get security statistics
   */
  static getStatistics(timeWindow: number = 24 * 60 * 60 * 1000): {
    total: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
    recentAlerts: number;
  } {
    const since = Date.now() - timeWindow;
    const recentEvents = this.events.filter(event => event.timestamp >= since);

    const bySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };

    const byCategory: Record<string, number> = {
      auth: 0,
      data: 0,
      access: 0,
      validation: 0,
      rate_limit: 0,
      injection: 0,
      xss: 0,
      csrf: 0,
      other: 0
    };

    recentEvents.forEach(event => {
      bySeverity[event.severity]++;
      byCategory[event.category]++;
    });

    const recentAlerts = recentEvents.filter(event => 
      event.severity === 'high' || event.severity === 'critical'
    ).length;

    return {
      total: recentEvents.length,
      bySeverity,
      byCategory,
      recentAlerts
    };
  }

  /**
   * Clear old events (for maintenance)
   */
  static clearOldEvents(olderThan: number = 7 * 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - olderThan;
    const initialLength = this.events.length;
    
    this.events = this.events.filter(event => event.timestamp >= cutoff);
    
    const removedCount = initialLength - this.events.length;
    
    if (removedCount > 0) {
      this.logEvent('events_cleared', { removedCount }, 'low', 'other');
    }
    
    return removedCount;
  }

  /**
   * Export events for external analysis
   */
  static exportEvents(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = ['timestamp', 'action', 'category', 'severity', 'userId', 'ip', 'data'];
      const rows = this.events.map(event => [
        new Date(event.timestamp).toISOString(),
        event.action,
        event.category,
        event.severity,
        event.userId || '',
        event.ip || '',
        JSON.stringify(event.data || {})
      ]);
      
      return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }
    
    return JSON.stringify(this.events, null, 2);
  }

  // Private helper methods

  private static sanitizeEventData(data: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(data)) {
      // Limit key length
      const sanitizedKey = key.substring(0, 50);
      
      if (typeof value === 'string') {
        // Remove sensitive patterns and limit length
        const sanitizedValue = value
          .replace(/password/gi, '[REDACTED]')
          .replace(/token/gi, '[REDACTED]')
          .replace(/secret/gi, '[REDACTED]')
          .replace(/key/gi, '[REDACTED]')
          .replace(/credit.*card/gi, '[REDACTED]')
          .replace(/ssn/gi, '[REDACTED]')
          .substring(0, 500);
        
        sanitized[sanitizedKey] = sanitizedValue;
      } else if (typeof value === 'number' && isFinite(value)) {
        sanitized[sanitizedKey] = value;
      } else if (typeof value === 'boolean') {
        sanitized[sanitizedKey] = value;
      } else if (value === null) {
        sanitized[sanitizedKey] = null;
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects (limited depth)
        sanitized[sanitizedKey] = this.sanitizeNestedObject(value, 1);
      }
      // Skip other types (functions, symbols, etc.)
    }
    
    return sanitized;
  }

  private static sanitizeNestedObject(obj: any, depth: number): any {
    if (depth > 3) return '[NESTED_OBJECT_TOO_DEEP]'; // Prevent deep recursion
    
    if (Array.isArray(obj)) {
      return obj.slice(0, 10).map(item => // Limit array size
        typeof item === 'object' && item !== null 
          ? this.sanitizeNestedObject(item, depth + 1)
          : item
      );
    }
    
    const sanitized: Record<string, any> = {};
    let fieldCount = 0;
    
    for (const [key, value] of Object.entries(obj)) {
      if (fieldCount >= 20) break; // Limit number of fields
      
      const sanitizedKey = key.substring(0, 50);
      
      if (typeof value === 'string') {
        sanitized[sanitizedKey] = value.substring(0, 200);
      } else if (typeof value === 'number' && isFinite(value)) {
        sanitized[sanitizedKey] = value;
      } else if (typeof value === 'boolean' || value === null) {
        sanitized[sanitizedKey] = value;
      } else if (typeof value === 'object' && value !== null) {
        sanitized[sanitizedKey] = this.sanitizeNestedObject(value, depth + 1);
      }
      
      fieldCount++;
    }
    
    return sanitized;
  }

  private static logToConsole(event: SecurityEvent): void {
    // Only log high severity events in production
    if (!config.app.isDevelopment && event.severity !== 'critical' && event.severity !== 'high') {
      return;
    }

    const logMessage = `[SECURITY ${event.severity.toUpperCase()}] ${event.action}`;
    const logData = {
      category: event.category,
      timestamp: new Date(event.timestamp).toISOString(),
      userId: event.userId,
      data: event.data
    };

    switch (event.severity) {
      case 'critical':
        console.error(logMessage, config.app.isDevelopment ? logData : {});
        break;
      case 'high':
        console.warn(logMessage, config.app.isDevelopment ? logData : {});
        break;
      case 'medium':
        if (config.app.isDevelopment) {
          console.info(logMessage, logData);
        }
        break;
      default:
        // Development logging removed
    }
  }

  private static checkAlertThresholds(event: SecurityEvent): void {
    const recentEvents = this.events.filter(e => 
      e.severity === event.severity && 
      e.timestamp >= Date.now() - (60 * 60 * 1000) // Last hour
    );

    const threshold = this.ALERT_THRESHOLDS[event.severity];
    
    if (recentEvents.length >= threshold) {
      this.triggerAlert(event.severity, recentEvents.length);
    }
  }

  private static triggerAlert(severity: string, count: number): void {
    // Only log alerts in development or for critical events
    if (config.app.isDevelopment || severity === 'critical') {
      console.error(`[SECURITY ALERT] ${count} ${severity} events detected`);
    }
    
    // In production, send alerts via external services
    if (config.security.alertWebhookUrl) {
      this.sendWebhookAlert(severity, count);
    }
  }

  private static async sendWebhookAlert(severity: string, count: number): Promise<void> {
    try {
      if (!config.security.alertWebhookUrl) return;

      const payload = {
        text: `🚨 Security Alert: ${count} ${severity} events detected in the last hour`,
        severity,
        count,
        timestamp: new Date().toISOString(),
        service: 'Payment System Security Monitor'
      };

      await fetch(config.security.alertWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SecurityMonitor/1.0'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
    } catch (error) {
      console.error('Failed to send webhook alert:', error);
    }
  }

  private static async sendToExternalMonitoring(event: SecurityEvent): Promise<void> {
    try {
      if (!config.security.externalMonitoringUrl) return;

      // Rate limit external logging to prevent spam
      const recentExternalLogs = this.events.filter(e => 
        e.timestamp >= Date.now() - (60 * 1000) // Last minute
      ).length;

      if (recentExternalLogs > 100) return; // Skip if too many recent logs

      await fetch(config.security.externalMonitoringUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.security.monitoringApiKey}`,
          'User-Agent': 'SecurityMonitor/1.0'
        },
        body: JSON.stringify({
          ...event,
          source: 'payment-system',
          version: config.app.version
        }),
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
    } catch (error) {
      // Don't log this error to avoid infinite loops
      if (config.app.isDevelopment) {
        console.warn('Failed to send to external monitoring:', error);
      }
    }
  }

  private static getCurrentIP(): string | undefined {
    // In browser environment, this won't work
    // In server environment, you'd get this from request headers
    return undefined;
  }

  private static getCurrentUserAgent(): string | undefined {
    // In browser environment
    if (typeof navigator !== 'undefined') {
      return navigator.userAgent.substring(0, 200);
    }
    return undefined;
  }

  private static generateSessionId(): string {
    // Simple session ID generation
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}

// Input validation and sanitization
export class InputSanitizer {
  static sanitizeHtml(input: string): string {
    return input
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .trim();
  }

  static sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Invalid protocol');
      }
      return parsed.toString();
    } catch {
      return '';
    }
  }

  static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .replace(/\.{2,}/g, '.')
      .substring(0, 255);
  }

  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  static validatePhoneNumber(phone: string): boolean {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  }
}

// Security headers configuration with enhanced CSP
export const securityHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://www.googleapis.com https://apis.google.com https://securetoken.googleapis.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://www.googleapis.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://firestore.googleapis.com wss://ws-*.firestore.googleapis.com",
    "frame-src 'self' https://www.google.com https://accounts.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
    config.security.cspReportUri ? `report-uri ${config.security.cspReportUri}` : ''
  ].filter(Boolean).join('; '),
  
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'interest-cohort=()',
    'payment=(self)',
    'usb=()'
  ].join(', '),
  
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-site'
};

// Enhanced CSRF protection
export class CSRFProtection {
  private static tokens = new Map<string, { token: string; expires: number }>();
  
  static generateToken(sessionId: string): string {
    const token = crypto.randomUUID();
    const expires = Date.now() + (60 * 60 * 1000); // 1 hour
    
    this.tokens.set(sessionId, { token, expires });
    
    // Clean expired tokens
    this.cleanExpiredTokens();
    
    return token;
  }
  
  static validateToken(sessionId: string, token: string): boolean {
    const stored = this.tokens.get(sessionId);
    
    if (!stored || stored.expires < Date.now()) {
      this.tokens.delete(sessionId);
      return false;
    }
    
    return stored.token === token;
  }
  
  private static cleanExpiredTokens(): void {
    const now = Date.now();
    this.tokens.forEach((data, sessionId) => {
      if (data.expires < now) {
        this.tokens.delete(sessionId);
      }
    });
  }
} 