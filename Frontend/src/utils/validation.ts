// Enhanced input validation utilities
import { SecurityMonitor } from './securityHeaders';

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedValue?: any;
}

// Collection and field validation
const ALLOWED_COLLECTIONS = [
  'users', 'teams', 'websites', 'topupHistory', 'withdrawHistory', 
  'teamMembers', 'invitations', 'userProfiles', 'systemLogs'
];

const ALLOWED_FIELDS = {
  users: ['email', 'displayName', 'username', 'role', 'createdAt'],
  teams: ['name', 'description', 'ownerId', 'createdAt', 'status'],
  websites: ['name', 'url', 'apiKey', 'status', 'balance', 'teamId', 'userId'],
  topupHistory: ['websiteId', 'amount', 'timestamp', 'status', 'teamId', 'userId'],
  withdrawHistory: ['websiteId', 'amount', 'timestamp', 'status', 'teamId', 'withdrawByUid'],
  teamMembers: ['email', 'displayName', 'role', 'status', 'teamId', 'userId'],
  invitations: ['email', 'teamId', 'status', 'invitedBy', 'createdAt'],
  userProfiles: ['email', 'displayName', 'role', 'teamId', 'createdAt'],
  systemLogs: ['timestamp', 'userId', 'action', 'category', 'severity']
};

const SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'];
const STATUS_VALUES = ['active', 'inactive', 'pending', 'completed', 'failed'];
const ROLE_VALUES = ['admin', 'manager', 'user'];

/**
 * Comprehensive input sanitization
 */
export class InputValidator {
  
  /**
   * Sanitize and validate text input
   */
  static validateText(input: any, options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    allowSpecialChars?: boolean;
    allowHtml?: boolean;
  } = {}): ValidationResult {
    
    // Type check
    if (typeof input !== 'string') {
      if (options.required) {
        return { isValid: false, error: 'ข้อมูลต้องเป็นข้อความ' };
      }
      return { isValid: true, sanitizedValue: '' };
    }

    // Required check
    if (options.required && (!input || input.trim().length === 0)) {
      return { isValid: false, error: 'ข้อมูลนี้จำเป็นต้องกรอก' };
    }

    // Length validation
    const trimmed = input.trim();
    if (options.minLength && trimmed.length < options.minLength) {
      return { isValid: false, error: `ต้องมีอย่างน้อย ${options.minLength} ตัวอักษร` };
    }
    
    if (options.maxLength && trimmed.length > options.maxLength) {
      return { isValid: false, error: `ต้องไม่เกิน ${options.maxLength} ตัวอักษร` };
    }

    // Sanitization
    let sanitized = trimmed;
    
    if (!options.allowHtml) {
      // Remove HTML tags and dangerous characters
      sanitized = sanitized
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[<>]/g, '') // Remove < >
        .replace(/javascript:/gi, '') // Remove javascript:
        .replace(/on\w+\s*=/gi, '') // Remove event handlers
        .replace(/data:/gi, '') // Remove data: URLs
        .replace(/vbscript:/gi, ''); // Remove vbscript:
    }

    if (!options.allowSpecialChars) {
      // Allow only alphanumeric, spaces, and basic punctuation
      sanitized = sanitized.replace(/[^\w\s\-_.@]/g, '');
    }

    SecurityMonitor.logEvent('input_validated', {
      originalLength: input.length,
      sanitizedLength: sanitized.length,
      type: 'text'
    }, 'low');

    return { isValid: true, sanitizedValue: sanitized };
  }

  /**
   * Validate email address
   */
  static validateEmail(email: any): ValidationResult {
    if (typeof email !== 'string') {
      return { isValid: false, error: 'อีเมลต้องเป็นข้อความ' };
    }

    const trimmed = email.trim().toLowerCase();
    
    // Basic email regex
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    if (!emailRegex.test(trimmed)) {
      return { isValid: false, error: 'รูปแบบอีเมลไม่ถูกต้อง' };
    }

    if (trimmed.length > 254) {
      return { isValid: false, error: 'อีเมลยาวเกินไป' };
    }

    return { isValid: true, sanitizedValue: trimmed };
  }

  /**
   * Validate URL
   */
  static validateUrl(url: any, options: { requireHttps?: boolean } = {}): ValidationResult {
    if (typeof url !== 'string') {
      return { isValid: false, error: 'URL ต้องเป็นข้อความ' };
    }

    const trimmed = url.trim();
    
    try {
      const parsed = new URL(trimmed);
      
      // Check protocol
      if (options.requireHttps && parsed.protocol !== 'https:') {
        return { isValid: false, error: 'ต้องใช้ HTTPS เท่านั้น' };
      }
      
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { isValid: false, error: 'ต้องเป็น HTTP หรือ HTTPS เท่านั้น' };
      }

      return { isValid: true, sanitizedValue: parsed.toString() };
    } catch {
      return { isValid: false, error: 'รูปแบบ URL ไม่ถูกต้อง' };
    }
  }

  /**
   * Validate number
   */
  static validateNumber(num: any, options: {
    min?: number;
    max?: number;
    integer?: boolean;
    positive?: boolean;
  } = {}): ValidationResult {
    
    let parsed: number;
    
    if (typeof num === 'string') {
      parsed = parseFloat(num);
    } else if (typeof num === 'number') {
      parsed = num;
    } else {
      return { isValid: false, error: 'ต้องเป็นตัวเลข' };
    }

    if (isNaN(parsed) || !isFinite(parsed)) {
      return { isValid: false, error: 'ตัวเลขไม่ถูกต้อง' };
    }

    if (options.integer && !Number.isInteger(parsed)) {
      return { isValid: false, error: 'ต้องเป็นจำนวนเต็ม' };
    }

    if (options.positive && parsed <= 0) {
      return { isValid: false, error: 'ต้องเป็นจำนวนบวก' };
    }

    if (options.min !== undefined && parsed < options.min) {
      return { isValid: false, error: `ต้องไม่น้อยกว่า ${options.min}` };
    }

    if (options.max !== undefined && parsed > options.max) {
      return { isValid: false, error: `ต้องไม่เกิน ${options.max}` };
    }

    return { isValid: true, sanitizedValue: parsed };
  }

  /**
   * Validate Firestore collection name
   */
  static validateCollection(collection: any): ValidationResult {
    if (typeof collection !== 'string') {
      return { isValid: false, error: 'Collection name ต้องเป็นข้อความ' };
    }

    const trimmed = collection.trim();
    
    if (!ALLOWED_COLLECTIONS.includes(trimmed)) {
      SecurityMonitor.logEvent('invalid_collection_access', { collection: trimmed }, 'medium');
      return { isValid: false, error: 'Collection ไม่ได้รับอนุญาต' };
    }

    return { isValid: true, sanitizedValue: trimmed };
  }

  /**
   * Validate Firestore field name
   */
  static validateField(field: any, collection: string): ValidationResult {
    if (typeof field !== 'string') {
      return { isValid: false, error: 'Field name ต้องเป็นข้อความ' };
    }

    const trimmed = field.trim();
    const allowedFields = ALLOWED_FIELDS[collection as keyof typeof ALLOWED_FIELDS];
    
    if (!allowedFields || !allowedFields.includes(trimmed)) {
      SecurityMonitor.logEvent('invalid_field_access', { field: trimmed, collection }, 'medium');
      return { isValid: false, error: 'Field ไม่ได้รับอนุญาต' };
    }

    return { isValid: true, sanitizedValue: trimmed };
  }

  /**
   * Validate severity level
   */
  static validateSeverity(severity: any): ValidationResult {
    if (typeof severity !== 'string') {
      return { isValid: false, error: 'Severity ต้องเป็นข้อความ' };
    }

    const trimmed = severity.trim().toLowerCase();
    
    if (!SEVERITY_LEVELS.includes(trimmed)) {
      return { isValid: false, error: 'Severity level ไม่ถูกต้อง' };
    }

    return { isValid: true, sanitizedValue: trimmed };
  }

  /**
   * Validate status value
   */
  static validateStatus(status: any): ValidationResult {
    if (typeof status !== 'string') {
      return { isValid: false, error: 'Status ต้องเป็นข้อความ' };
    }

    const trimmed = status.trim().toLowerCase();
    
    if (!STATUS_VALUES.includes(trimmed)) {
      return { isValid: false, error: 'Status ไม่ถูกต้อง' };
    }

    return { isValid: true, sanitizedValue: trimmed };
  }

  /**
   * Validate role value
   */
  static validateRole(role: any): ValidationResult {
    if (typeof role !== 'string') {
      return { isValid: false, error: 'Role ต้องเป็นข้อความ' };
    }

    const trimmed = role.trim().toLowerCase();
    
    if (!ROLE_VALUES.includes(trimmed)) {
      return { isValid: false, error: 'Role ไม่ถูกต้อง' };
    }

    return { isValid: true, sanitizedValue: trimmed };
  }

  /**
   * Validate pagination parameters
   */
  static validatePagination(limit: any, offset: any): ValidationResult {
    const limitResult = this.validateNumber(limit, { min: 1, max: 1000, integer: true, positive: true });
    if (!limitResult.isValid) {
      return { isValid: false, error: `Limit: ${limitResult.error}` };
    }

    const offsetResult = this.validateNumber(offset, { min: 0, integer: true });
    if (!offsetResult.isValid) {
      return { isValid: false, error: `Offset: ${offsetResult.error}` };
    }

    return { 
      isValid: true, 
      sanitizedValue: { 
        limit: limitResult.sanitizedValue, 
        offset: offsetResult.sanitizedValue 
      } 
    };
  }

  /**
   * Validate search query
   */
  static validateSearchQuery(query: any): ValidationResult {
    if (!query) {
      return { isValid: true, sanitizedValue: '' };
    }

    const textResult = this.validateText(query, {
      maxLength: 100,
      allowSpecialChars: false,
      allowHtml: false
    });

    if (!textResult.isValid) {
      return textResult;
    }

    // Additional search-specific validation
    const sanitized = textResult.sanitizedValue as string;
    
    // Prevent potential NoSQL injection patterns
    const dangerousPatterns = [
      /\$where/i, /\$regex/i, /\$ne/i, /\$gt/i, /\$lt/i,
      /javascript/i, /function/i, /eval/i, /script/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sanitized)) {
        SecurityMonitor.logEvent('suspicious_search_query', { query: sanitized }, 'high');
        return { isValid: false, error: 'คำค้นหาไม่ถูกต้อง' };
      }
    }

    return { isValid: true, sanitizedValue: sanitized };
  }

  /**
   * Validate API key format
   */
  static validateApiKey(apiKey: any): ValidationResult {
    if (typeof apiKey !== 'string') {
      return { isValid: false, error: 'API Key ต้องเป็นข้อความ' };
    }

    const trimmed = apiKey.trim();
    
    // Basic API key format validation (adjust based on your API key format)
    if (trimmed.length < 10 || trimmed.length > 100) {
      return { isValid: false, error: 'API Key ต้องมี 10-100 ตัวอักษร' };
    }

    // Check for valid characters (alphanumeric and some special chars)
    if (!/^[a-zA-Z0-9\-_\.]+$/.test(trimmed)) {
      return { isValid: false, error: 'API Key มีตัวอักษรไม่ถูกต้อง' };
    }

    return { isValid: true, sanitizedValue: trimmed };
  }
}

/**
 * Rate limiting for sensitive operations
 */
export class OperationRateLimit {
  private static attempts = new Map<string, { count: number; resetTime: number }>();

  static checkLimit(
    identifier: string, 
    operation: string, 
    maxAttempts: number = 10, 
    windowMs: number = 60000
  ): boolean {
    const key = `${operation}:${identifier}`;
    const now = Date.now();
    const record = this.attempts.get(key);

    if (!record || now > record.resetTime) {
      this.attempts.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (record.count >= maxAttempts) {
      SecurityMonitor.logEvent('rate_limit_exceeded', {
        operation,
        identifier,
        attempts: record.count
      }, 'medium');
      return false;
    }

    record.count++;
    return true;
  }

  static getRemainingTime(identifier: string, operation: string): number {
    const key = `${operation}:${identifier}`;
    const record = this.attempts.get(key);
    
    if (!record) return 0;
    
    const remaining = record.resetTime - Date.now();
    return Math.max(0, remaining);
  }
} 