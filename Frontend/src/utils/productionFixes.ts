/**
 * Production Environment Fixes
 * แก้ไขปัญหาการสมัครสมาชิกใน production environment
 */

import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * ตรวจสอบว่าอยู่ใน production environment หรือไม่
 */
export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || 
         process.env.VERCEL_ENV === 'production' ||
         typeof window !== 'undefined' && window.location.hostname !== 'localhost';
}

/**
 * ปรับแต่ง Firebase operations สำหรับ production
 */
export async function productionSafeTransaction<T>(
  operation: () => Promise<T>,
  retryCount: number = 3
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // หากเป็น network error หรือ timeout ให้ retry
      if (
        error.code === 'unavailable' ||
        error.code === 'deadline-exceeded' ||
        error.name === 'NetworkError' ||
        error.message?.includes('network') ||
        error.message?.includes('timeout')
      ) {
        if (attempt < retryCount) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      // หากเป็น permission error หรือ auth error ไม่ต้อง retry
      if (
        error.code === 'permission-denied' ||
        error.code === 'unauthenticated' ||
        error.message?.includes('permission') ||
        error.message?.includes('auth')
      ) {
        throw error;
      }
      
      // หากเป็นครั้งสุดท้าย ให้ throw error
      if (attempt === retryCount) {
        throw error;
      }
    }
  }
  
  throw lastError;
}

/**
 * สร้าง production-safe registration function
 */
export async function productionSafeRegistration(
  username: string,
  password: string,
  authUser: any
): Promise<{success: boolean; error?: string}> {
  try {
    const userId = authUser.uid;
    const timestamp = new Date();
    const fakeEmail = `${username}@app.local`;
    
    // รอให้ Auth token อัพเดทและพร้อมใช้งาน
    await authUser.getIdToken(true);
    
    // รอสักครู่เพื่อให้ Auth state อัพเดทใน Firestore
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // ใช้ production-safe transaction
    await productionSafeTransaction(async () => {
      await runTransaction(db, async (transaction) => {
        const usernameDocRef = doc(db, 'usernames', username);
        const userDocRef = doc(db, 'users', userId);
        
        // ตรวจสอบ username ซ้ำ
        const usernameCheck = await transaction.get(usernameDocRef);
        if (usernameCheck.exists()) {
          throw new Error('Username was taken during registration');
        }
        
        // เขียนข้อมูลไปยัง usernames collection
        transaction.set(usernameDocRef, {
          uid: userId,
          createdAt: timestamp,
          username: username
        });
        
        // เขียนข้อมูลไปยัง users collection
        transaction.set(userDocRef, {
          username: username,
          displayName: username,
          email: fakeEmail,
          role: 'user',
          createdAt: timestamp,
          lastLogin: timestamp,
          permissions: []
        });
      });
    });
    
    // รอสักครู่เพื่อให้ข้อมูลอัพเดท
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('✅ Production registration completed');
    return { success: true };
    
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message || 'Registration failed'
    };
  }
}

 