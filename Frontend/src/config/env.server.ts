// Server-side Environment Configuration
// This file should ONLY be imported in server-side code (API routes, middleware, etc.)
// DO NOT import this in client-side components

export const serverConfig = {
  // Security Environment Variables (Server-side only)
  security: {
    sessionSecret: process.env.SESSION_SECRET || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('SESSION_SECRET environment variable is required in production');
      }
      return 'development-session-secret-' + Math.random().toString(36).substring(2, 15);
    })(),
    csrfSecret: process.env.CSRF_SECRET || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('CSRF_SECRET environment variable is required in production');
      }
      return 'development-csrf-secret-' + Math.random().toString(36).substring(2, 15);
    })(),
    encryptionKey: process.env.ENCRYPTION_KEY || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('ENCRYPTION_KEY environment variable is required in production');
      }
      return 'development-encryption-key-' + Math.random().toString(36).substring(2, 15);
    })(),
    hashSalt: process.env.HASH_SALT || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('HASH_SALT environment variable is required in production');
      }
      return 'development-hash-salt-' + Math.random().toString(36).substring(2, 15);
    })(),
    
    // Other server-side security settings
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT_MS || '3600000'),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
    lockoutDurationMs: parseInt(process.env.LOCKOUT_DURATION_MS || '900000'),
    
    // External services (server-side only)
    monitoringApiKey: process.env.MONITORING_API_KEY,
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL,
    externalMonitoringUrl: process.env.EXTERNAL_MONITORING_URL,
  },
  
  // Database configuration (server-side only)
  database: {
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000'),
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10'),
    enableSSL: process.env.DB_ENABLE_SSL !== 'false'
  },
  
  // Email configuration (server-side only)
  email: {
    serverUser: process.env.EMAIL_SERVER_USER,
    serverPassword: process.env.EMAIL_SERVER_PASSWORD,
    serverHost: process.env.EMAIL_SERVER_HOST || 'smtp.gmail.com',
    serverPort: parseInt(process.env.EMAIL_SERVER_PORT || '587'),
    from: process.env.EMAIL_FROM
  }
};

// Server-side validation function
export function validateServerConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.SESSION_SECRET) {
      errors.push('SESSION_SECRET is required in production');
    }
    if (!process.env.CSRF_SECRET) {
      errors.push('CSRF_SECRET is required in production');
    }
    if (!process.env.ENCRYPTION_KEY) {
      errors.push('ENCRYPTION_KEY is required in production');
    }
    if (!process.env.HASH_SALT) {
      errors.push('HASH_SALT is required in production');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
} 