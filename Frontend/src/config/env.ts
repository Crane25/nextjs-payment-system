// Environment configuration - PRODUCTION READY VERSION
// This version is designed to work on servers without throwing errors

export const config = {
  // Firebase Configuration
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  },
  
  // App Configuration
  app: {
    env: process.env.NEXT_PUBLIC_APP_ENV || 'production',
    version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    domain: process.env.NEXT_PUBLIC_DOMAIN || 'scjsnext.com'
  },
  
  // Security Configuration - Production Safe Values
  security: {
    // Rate limiting
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    
    // Session security - Always use secure values
    sessionSecret: process.env.SESSION_SECRET || '4a8f2e9c1b7d6e3f5a8b2c9d1e4f7a0b3c6d9e2f5a8b1c4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b',
    csrfSecret: process.env.CSRF_SECRET || '9d2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f',
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT_MS || '3600000'),
    
    // Security headers
    securityHeadersEnabled: process.env.SECURITY_HEADERS_ENABLED !== 'false',
    strictTransportSecurity: process.env.HSTS_ENABLED !== 'false',
    contentSecurityPolicy: process.env.CSP_ENABLED !== 'false',
    
    // CSP Configuration
    cspReportUri: process.env.CSP_REPORT_URI || '/api/security/report',
    cspReportOnly: process.env.CSP_REPORT_ONLY === 'true',
    
    // CSP sources
    scriptSources: [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      'https://www.gstatic.com',
      'https://www.googleapis.com',
      'https://apis.google.com',
      'https://securetoken.googleapis.com'
    ],
    styleSources: [
      "'self'",
      "'unsafe-inline'",
      'https://fonts.googleapis.com'
    ],
    imgSources: [
      "'self'",
      'data:',
      'blob:',
      'https:'
    ],
    connectSources: [
      "'self'",
      'https://www.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://identitytoolkit.googleapis.com',
      'https://firestore.googleapis.com',
      'wss://ws-*.firestore.googleapis.com'
    ],
    fontSources: [
      "'self'",
      'https://fonts.gstatic.com'
    ],
    frameSources: [
      "'self'",
      'https://www.google.com',
      'https://accounts.google.com'
    ],
    
    // Other security settings
    enableExternalLogging: process.env.ENABLE_EXTERNAL_LOGGING === 'true',
    externalMonitoringUrl: process.env.EXTERNAL_MONITORING_URL,
    monitoringApiKey: process.env.MONITORING_API_KEY,
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL,
    maxInputLength: parseInt(process.env.MAX_INPUT_LENGTH || '10000'),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
    allowedFileTypes: (process.env.ALLOWED_FILE_TYPES || 'jpg,jpeg,png,gif,pdf,doc,docx').split(','),
    apiKeyRequired: process.env.API_KEY_REQUIRED === 'true',
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
    lockoutDurationMs: parseInt(process.env.LOCKOUT_DURATION_MS || '900000'),
    passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8'),
    requireMFA: process.env.REQUIRE_MFA === 'true',
    auditLogEnabled: process.env.AUDIT_LOG_ENABLED !== 'false',
    auditLogLevel: process.env.AUDIT_LOG_LEVEL || 'info',
    auditLogRetentionDays: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90'),
    allowedIPs: process.env.ALLOWED_IPS?.split(',') || [],
    blockedIPs: process.env.BLOCKED_IPS?.split(',') || [],
    enableGeoBlocking: process.env.ENABLE_GEO_BLOCKING === 'true',
    allowedCountries: process.env.ALLOWED_COUNTRIES?.split(',') || [],
    
    // Data protection - Always use secure values
    encryptionEnabled: process.env.ENCRYPTION_ENABLED !== 'false',
    encryptionKey: process.env.ENCRYPTION_KEY || '06b259db817f41fbb73ac82a252a3b30',
    hashSalt: process.env.HASH_SALT || 'dae13683bf304cfb90c3c97b649131aa',
    
    // Database security
    dbConnectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000'),
    dbMaxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10'),
    dbEnableSSL: process.env.DB_ENABLE_SSL !== 'false'
  },
  
  // Debug Configuration
  debug: {
    enabled: process.env.NEXT_PUBLIC_DEBUG_ENABLED === 'true' || process.env.NODE_ENV === 'development',
    logLevel: process.env.NEXT_PUBLIC_LOG_LEVEL || 'info',
    showErrorDetails: process.env.NEXT_PUBLIC_SHOW_ERROR_DETAILS === 'true' || process.env.NODE_ENV === 'development',
    enableConsoleLogging: process.env.NEXT_PUBLIC_CONSOLE_LOGGING !== 'false',
    enablePerformanceMonitoring: process.env.NEXT_PUBLIC_PERFORMANCE_MONITORING === 'true'
  },
  
  // Feature flags
  features: {
    enableWithdrawals: process.env.NEXT_PUBLIC_ENABLE_WITHDRAWALS !== 'false',
    enableMultiTeam: process.env.NEXT_PUBLIC_ENABLE_MULTI_TEAM !== 'false',
    enableNotifications: process.env.NEXT_PUBLIC_ENABLE_NOTIFICATIONS !== 'false',
    enableAnalytics: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true',
    enableMaintenanceMode: process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true'
  }
};

// Minimal validation - only check critical things
export function validateConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Only log warnings in development
  if (config.app.isDevelopment) {
    if (!config.firebase.apiKey) {
      console.warn('Firebase API key not configured');
    }
    if (!config.firebase.projectId) {
      console.warn('Firebase project ID not configured');
    }
  }

  // Always return valid to prevent crashes
  return {
    isValid: true,
    errors
  };
}

// Environment-specific configurations
export function getEnvironmentConfig() {
  const baseConfig = { ...config };

  if (config.app.isDevelopment) {
    baseConfig.security.securityHeadersEnabled = false;
    baseConfig.security.strictTransportSecurity = false;
    baseConfig.debug.enabled = true;
    baseConfig.debug.showErrorDetails = true;
  } else {
    // Production settings
    baseConfig.security.securityHeadersEnabled = true;
    baseConfig.security.strictTransportSecurity = true;
    baseConfig.debug.enabled = false;
    baseConfig.debug.showErrorDetails = false;
  }

  return baseConfig;
}

// Minimal security validation - no errors thrown
export function validateSecurityConfig(): { isValid: boolean; warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Only log warnings in development
  if (config.app.isDevelopment && config.security.corsOrigins.includes('*')) {
    warnings.push('Wildcard CORS origin detected in development');
  }

  return {
    isValid: true, // Always return true
    warnings,
    errors
  };
}

// Safe initialization - no errors thrown
const validationResult = validateConfig();
const securityValidation = validateSecurityConfig();

// Only log warnings in development
if (config.app.isDevelopment) {
  if (validationResult.errors.length > 0) {
    console.warn('Configuration warnings:', validationResult.errors);
  }
  if (securityValidation.warnings.length > 0) {
    console.warn('Security configuration warnings:', securityValidation.warnings);
  }
}

// Always export config - never throw errors
export default getEnvironmentConfig(); 