// Error handling utility for safe error messages
import { config } from '../config/env';

export interface SafeError {
  message: string;
  shouldLog: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Convert system errors to user-friendly messages
 */
export function getSafeErrorMessage(error: any): SafeError {
  // Default safe error
  const defaultError: SafeError = {
    message: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
    shouldLog: true,
    severity: 'medium'
  };

  if (!error) {
    return defaultError;
  }

  // Firebase Auth errors
  if (error.code?.startsWith('auth/')) {
    switch (error.code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return {
          message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
          shouldLog: false,
          severity: 'low'
        };
      case 'auth/email-already-in-use':
        return {
          message: 'ชื่อผู้ใช้นี้มีคนใช้แล้ว',
          shouldLog: false,
          severity: 'low'
        };
      case 'auth/weak-password':
        return {
          message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',
          shouldLog: false,
          severity: 'low'
        };
      case 'auth/network-request-failed':
        return {
          message: 'ไม่สามารถเชื่อมต่อได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต',
          shouldLog: true,
          severity: 'medium'
        };
      default:
        return {
          message: 'เกิดข้อผิดพลาดในการยืนยันตัวตน',
          shouldLog: true,
          severity: 'medium'
        };
    }
  }

  // Firestore errors
  if (error.code?.startsWith('firestore/')) {
    switch (error.code) {
      case 'firestore/permission-denied':
        return {
          message: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้',
          shouldLog: true,
          severity: 'high'
        };
      case 'firestore/unavailable':
        return {
          message: 'บริการไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง',
          shouldLog: true,
          severity: 'high'
        };
      case 'firestore/deadline-exceeded':
        return {
          message: 'การเชื่อมต่อหมดเวลา กรุณาลองใหม่อีกครั้ง',
          shouldLog: true,
          severity: 'medium'
        };
      default:
        return {
          message: 'เกิดข้อผิดพลาดในการเข้าถึงข้อมูล',
          shouldLog: true,
          severity: 'medium'
        };
    }
  }

  // Network errors
  if (error.name === 'NetworkError' || error.message?.includes('network')) {
    return {
      message: 'ไม่สามารถเชื่อมต่อได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต',
      shouldLog: true,
      severity: 'medium'
    };
  }

  // Custom application errors
  if (typeof error.message === 'string') {
    // Known safe messages that can be shown to users
    const safeMessages = [
      'ไม่พบชื่อผู้ใช้นี้',
      'รหัสผ่านไม่ถูกต้อง',
      'ชื่อผู้ใช้นี้มีคนใช้แล้ว',
      'ไม่มีสิทธิ์เข้าถึง',
      'ข้อมูลไม่ครบถ้วน'
    ];

    if (safeMessages.some(msg => error.message.includes(msg))) {
      return {
        message: error.message,
        shouldLog: false,
        severity: 'low'
      };
    }
  }

  // For development, show more details
  if (config.app.isDevelopment && error.message) {
    return {
      message: `[DEV] ${error.message}`,
      shouldLog: true,
      severity: 'low'
    };
  }

  return defaultError;
}

/**
 * Log error safely without exposing sensitive information
 */
export function logError(error: any, context?: string): void {
  const safeError = getSafeErrorMessage(error);
  
  if (!safeError.shouldLog) {
    return;
  }

  // Only log in development or for high severity errors
  if (config.app.isDevelopment || safeError.severity === 'high' || safeError.severity === 'critical') {
    const logData: any = {
      context,
      severity: safeError.severity,
      timestamp: new Date().toISOString()
    };

    if (config.app.isDevelopment) {
      logData.originalError = error?.message || 'Unknown error';
    }

    switch (safeError.severity) {
      case 'critical':
        console.error('[CRITICAL ERROR]', logData);
        break;
      case 'high':
        console.error('[HIGH ERROR]', logData);
        break;
      case 'medium':
        console.warn('[MEDIUM ERROR]', logData);
        break;
      default:
        console.log('[LOW ERROR]', logData);
    }
  }
}

/**
 * Handle error with toast notification
 */
export function handleError(error: any, context?: string): string {
  const safeError = getSafeErrorMessage(error);
  logError(error, context);
  return safeError.message;
}

/**
 * Common error messages for different operations
 */
export const ERROR_MESSAGES = {
  NETWORK: 'ไม่สามารถเชื่อมต่อได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต',
  PERMISSION_DENIED: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้',
  SERVICE_UNAVAILABLE: 'บริการไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง',
  INVALID_INPUT: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบและลองใหม่',
  TIMEOUT: 'การเชื่อมต่อหมดเวลา กรุณาลองใหม่อีกครั้ง',
  UNKNOWN: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
  
  // Authentication
  AUTH_FAILED: 'การยืนยันตัวตนไม่สำเร็จ',
  LOGIN_FAILED: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
  REGISTER_FAILED: 'สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
  
  // Data operations
  LOAD_FAILED: 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง',
  SAVE_FAILED: 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง',
  DELETE_FAILED: 'ไม่สามารถลบข้อมูลได้ กรุณาลองใหม่อีกครั้ง',
  UPDATE_FAILED: 'ไม่สามารถอัปเดตข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
} as const; 