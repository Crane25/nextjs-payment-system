// Security utility functions
import { SecurityMonitor, InputSanitizer } from './securityHeaders';
import { config } from '../config/env';
import { serverConfig } from '../config/env.server';

/**
 * Sanitize user input to prevent XSS attacks
 */
export function sanitizeInput(input: string): string {
  const sanitized = InputSanitizer.sanitizeHtml(input);
  SecurityMonitor.logEvent('input_sanitized', { originalLength: input.length, sanitizedLength: sanitized.length }, 'low');
  return sanitized;
}

/**
 * Validate username format
 */
export function validateUsername(username: string): { isValid: boolean; error?: string } {
  if (!username || username.length < 3) {
    return { isValid: false, error: 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร' };
  }
  
  if (username.length > 20) {
    return { isValid: false, error: 'ชื่อผู้ใช้ต้องไม่เกิน 20 ตัวอักษร' };
  }
  
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { isValid: false, error: 'ชื่อผู้ใช้ใช้ได้เฉพาะตัวอักษร ตัวเลข และ _' };
  }
  
  // Check for reserved usernames
  const reservedUsernames = ['admin', 'root', 'system', 'api', 'www', 'mail'];
  if (reservedUsernames.includes(username.toLowerCase())) {
    return { isValid: false, error: 'ชื่อผู้ใช้นี้ไม่สามารถใช้ได้' };
  }
  
  return { isValid: true };
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): { isValid: boolean; error?: string; strength: number } {
  if (!password || password.length < 6) {
    return { isValid: false, error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', strength: 0 };
  }
  
  if (password.length > 128) {
    return { isValid: false, error: 'รหัสผ่านต้องไม่เกิน 128 ตัวอักษร', strength: 0 };
  }
  
  let strength = 0;
  
  // Check for different character types
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^a-zA-Z0-9]/.test(password)) strength++;
  
  // Check length bonus
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  
  // Check for common weak passwords
  const weakPasswords = ['password', '123456', 'qwerty', 'abc123', 'password123'];
  if (weakPasswords.includes(password.toLowerCase())) {
    return { isValid: false, error: 'รหัสผ่านนี้ไม่ปลอดภัย กรุณาเลือกรหัสผ่านที่แข็งแกร่งกว่า', strength: 0 };
  }
  
  return { isValid: true, strength };
}

/**
 * Rate limiting helper (client-side basic implementation)
 */
export class RateLimiter {
  private attempts: Map<string, number[]> = new Map();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  
  constructor(maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) { // 5 attempts per 15 minutes
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }
  
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(identifier) || [];
    
    // Remove old attempts outside the window
    const recentAttempts = attempts.filter(time => now - time < this.windowMs);
    
    if (recentAttempts.length >= this.maxAttempts) {
      return false;
    }
    
    // Add current attempt
    recentAttempts.push(now);
    this.attempts.set(identifier, recentAttempts);
    
    return true;
  }
  
  getRemainingTime(identifier: string): number {
    const attempts = this.attempts.get(identifier) || [];
    if (attempts.length < this.maxAttempts) return 0;
    
    const oldestAttempt = Math.min(...attempts);
    const timeUntilReset = this.windowMs - (Date.now() - oldestAttempt);
    
    return Math.max(0, timeUntilReset);
  }
}

/**
 * CSRF protection helper
 */
export function generateCSRFToken(): string {
  return crypto.randomUUID();
}

/**
 * Secure session storage with proper encryption
 */
export class SecureStorage {
  private static readonly PREFIX = 'secure_';
  
  /**
   * Encrypt data using AES-GCM with Web Crypto API
   */
  private static async encrypt(data: string): Promise<string> {
    try {
      const key = await this.getEncryptionKey();
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      
      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      // Encrypt the data
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        dataBuffer
      );
      
      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);
      
      // Convert to base64 for storage
      return btoa(String.fromCharCode.apply(null, Array.from(combined)));
    } catch (error) {
      console.error('Encryption failed:', error);
      // Fallback to base64 encoding if encryption fails
      return btoa(data);
    }
  }
  
  /**
   * Decrypt data using AES-GCM with Web Crypto API
   */
  private static async decrypt(encryptedData: string): Promise<string> {
    try {
      const key = await this.getEncryptionKey();
      
      // Convert from base64
      const combined = new Uint8Array(
        atob(encryptedData).split('').map(char => char.charCodeAt(0))
      );
      
      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);
      
      // Decrypt the data
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
      );
      
      // Convert back to string
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
      // Fallback to base64 decoding if decryption fails
      try {
        return atob(encryptedData);
      } catch {
        return '';
      }
    }
  }
  
  /**
   * Get or generate encryption key
   */
  private static async getEncryptionKey(): Promise<CryptoKey> {
    const keyId = 'secure_storage_key';
    
    // Try to get existing key from IndexedDB (if available)
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      try {
        const storedKey = await this.getStoredKey(keyId);
        if (storedKey) return storedKey;
      } catch {
        // Continue to generate new key
      }
    }
    
    // Generate new key
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    // Store key for future use
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      try {
        await this.storeKey(keyId, key);
      } catch {
        // Continue without storing key
      }
    }
    
    return key;
  }
  
  /**
   * Store encryption key in IndexedDB
   */
  private static async storeKey(keyId: string, key: CryptoKey): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('SecureStorageKeys', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['keys'], 'readwrite');
        const store = transaction.objectStore('keys');
        
        store.put({ id: keyId, key }, keyId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      };
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('keys')) {
          db.createObjectStore('keys');
        }
      };
    });
  }
  
  /**
   * Retrieve encryption key from IndexedDB
   */
  private static async getStoredKey(keyId: string): Promise<CryptoKey | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('SecureStorageKeys', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['keys'], 'readonly');
        const store = transaction.objectStore('keys');
        const getRequest = store.get(keyId);
        
        getRequest.onsuccess = () => {
          const result = getRequest.result;
          resolve(result ? result.key : null);
        };
        getRequest.onerror = () => resolve(null);
      };
    });
  }
  
  static async setItem(key: string, value: string): Promise<void> {
    try {
      const encryptedValue = await this.encrypt(value);
      sessionStorage.setItem(this.PREFIX + key, encryptedValue);
      SecurityMonitor.logEvent('secure_storage_write', { key }, 'low');
    } catch (error) {
      SecurityMonitor.logEvent('secure_storage_write_failed', { key, error: error instanceof Error ? error.message : 'Unknown' }, 'medium');
      throw new Error('Failed to store secure item');
    }
  }
  
  static async getItem(key: string): Promise<string | null> {
    try {
      const encryptedValue = sessionStorage.getItem(this.PREFIX + key);
      if (!encryptedValue) return null;
      
      const decryptedValue = await this.decrypt(encryptedValue);
      SecurityMonitor.logEvent('secure_storage_read', { key }, 'low');
      return decryptedValue;
    } catch (error) {
      SecurityMonitor.logEvent('secure_storage_read_failed', { key, error: error instanceof Error ? error.message : 'Unknown' }, 'medium');
      return null;
    }
  }
  
  static removeItem(key: string): void {
    sessionStorage.removeItem(this.PREFIX + key);
    SecurityMonitor.logEvent('secure_storage_remove', { key }, 'low');
  }
  
  static clear(): void {
    const keys = Object.keys(sessionStorage);
    const removedKeys: string[] = [];
    
    keys.forEach(key => {
      if (key.startsWith(this.PREFIX)) {
        sessionStorage.removeItem(key);
        removedKeys.push(key);
      }
    });
    
    SecurityMonitor.logEvent('secure_storage_clear', { removedCount: removedKeys.length }, 'medium');
  }
}

/**
 * Security audit and monitoring
 */
export function getSecurityAuditReport(): {
  score: number;
  issues: Array<{ severity: 'low' | 'medium' | 'high' | 'critical'; message: string; recommendation: string }>;
  lastAudit: number;
} {
  const issues: Array<{ severity: 'low' | 'medium' | 'high' | 'critical'; message: string; recommendation: string }> = [];
  let score = 10;
  
  // Check environment
  if (config.app.isDevelopment) {
    issues.push({
      severity: 'medium',
      message: 'แอปพลิเคชันทำงานในโหมด Development',
      recommendation: 'ตรวจสอบให้แน่ใจว่าไม่ได้ deploy ในโหมด development'
    });
    score -= 1;
  }
  
  // Check for default secrets
      if (serverConfig.security.sessionSecret.includes('default')) {
    issues.push({
      severity: 'high',
      message: 'ใช้ Session Secret เริ่มต้น',
      recommendation: 'เปลี่ยน Session Secret ให้เป็นค่าที่ปลอดภัยในไฟล์ environment'
    });
    score -= 2;
  }
  
  // Check recent security events
  const recentEvents = SecurityMonitor.getEvents({ severity: 'high', limit: 10 });
  if (recentEvents.length > 5) {
    issues.push({
      severity: 'high',
      message: `พบเหตุการณ์ความปลอดภัยระดับสูง ${recentEvents.length} ครั้ง`,
      recommendation: 'ตรวจสอบ security logs และดำเนินการแก้ไข'
    });
    score -= 2;
  }
  
  // Check for HTTPS
  if (typeof window !== 'undefined' && !window.location.protocol.startsWith('https') && config.app.isProduction) {
    issues.push({
      severity: 'critical',
      message: 'ไม่ได้ใช้ HTTPS ในโหมด Production',
      recommendation: 'เปิดใช้งาน HTTPS สำหรับความปลอดภัย'
    });
    score -= 3;
  }
  
  // Check localStorage usage
  const localStorageKeys = typeof window !== 'undefined' ? Object.keys(localStorage) : [];
  const sensitiveKeys = localStorageKeys.filter(key => 
    key.includes('token') || key.includes('password') || key.includes('secret')
  );
  
  if (sensitiveKeys.length > 0) {
    issues.push({
      severity: 'medium',
      message: 'พบข้อมูลที่อาจเป็นอันตรายใน localStorage',
      recommendation: 'ใช้ SecureStorage หรือ sessionStorage แทน localStorage สำหรับข้อมูลสำคัญ'
    });
    score -= 1;
  }
  
  return { 
    score: Math.max(0, score), 
    issues,
    lastAudit: Date.now()
  };
}

/**
 * Enhanced session validation
 */
export async function validateSession(): Promise<boolean> {
  const sessionData = await SecureStorage.getItem('user_session');
  
  if (!sessionData) {
    SecurityMonitor.logEvent('session_validation_failed', { reason: 'no_session' }, 'low');
    return false;
  }
  
  try {
    const session = JSON.parse(sessionData);
    const now = Date.now();
    
    if (now > session.expiresAt) {
      SecureStorage.removeItem('user_session');
      SecurityMonitor.logEvent('session_expired', { userId: session.userId }, 'medium');
      return false;
    }
    
    // Extend session if valid
    session.expiresAt = now + config.security.sessionTimeout;
    await SecureStorage.setItem('user_session', JSON.stringify(session));
    
    return true;
  } catch (error) {
    SecurityMonitor.logEvent('session_validation_error', { error: error instanceof Error ? error.message : 'Unknown' }, 'medium');
    return false;
  }
}

/**
 * Password strength meter
 */
export function getPasswordStrength(password: string): {
  score: number;
  feedback: string[];
  strength: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';
} {
  const feedback: string[] = [];
  let score = 0;
  
  // Length checks
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  
  // Character variety
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 1;
  
  // Penalties
  if (/(.)\1{2,}/.test(password)) {
    score -= 1;
    feedback.push('หลีกเลี่ยงการใช้ตัวอักษรซ้ำติดกัน');
  }
  
  if (/123|abc|qwe/i.test(password)) {
    score -= 1;
    feedback.push('หลีกเลี่ยงการใช้ลำดับตัวอักษรหรือตัวเลข');
  }
  
  // Determine strength
  let strength: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';
  if (score <= 2) strength = 'very-weak';
  else if (score <= 4) strength = 'weak';
  else if (score <= 6) strength = 'fair';
  else if (score <= 8) strength = 'good';
  else strength = 'strong';
  
  // Add feedback based on strength
  if (strength === 'very-weak') {
    feedback.push('รหัสผ่านอ่อนแอมาก');
  } else if (strength === 'weak') {
    feedback.push('รหัสผ่านอ่อนแอ');
  } else if (strength === 'fair') {
    feedback.push('รหัสผ่านปานกลาง');
  } else if (strength === 'good') {
    feedback.push('รหัสผ่านดี');
  } else {
    feedback.push('รหัสผ่านแข็งแกร่ง');
  }
  
  return { score: Math.max(0, score), feedback, strength };
} 