import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface UsernameValidationResult {
  isValid: boolean;
  exists: boolean;
  uid?: string;
  issues: string[];
}

export interface UserDataValidationResult {
  isValid: boolean;
  hasUsernameEntry: boolean;
  hasUserEntry: boolean;
  issues: string[];
}

/**
 * ตรวจสอบความถูกต้องของข้อมูล username ในฐานข้อมูล
 */
export async function validateUsernameData(username: string): Promise<UsernameValidationResult> {
  const result: UsernameValidationResult = {
    isValid: true,
    exists: false,
    issues: []
  };

  try {
    if (!db) {
      result.isValid = false;
      result.issues.push('ฐานข้อมูลไม่พร้อมใช้งาน');
      return result;
    }

    // ตรวจสอบว่า username มีอยู่ในตาราง usernames หรือไม่
    const usernameDoc = await getDoc(doc(db, 'usernames', username));
    
    if (usernameDoc.exists()) {
      result.exists = true;
      const data = usernameDoc.data();
      
      if (data.uid) {
        result.uid = data.uid;
        
        // ตรวจสอบว่า user ที่เชื่อมโยงมีอยู่จริงหรือไม่
        const userDoc = await getDoc(doc(db, 'users', data.uid));
        if (!userDoc.exists()) {
          result.isValid = false;
          result.issues.push('พบข้อมูล username แต่ไม่พบข้อมูล user ที่เชื่อมโยง');
        } else {
          const userData = userDoc.data();
          if (userData.username !== username) {
            result.isValid = false;
            result.issues.push('ข้อมูล username ไม่ตรงกับข้อมูลใน user record');
          }
        }
      } else {
        result.isValid = false;
        result.issues.push('ข้อมูล username ไม่มี uid');
      }
    }

    return result;
  } catch (error: any) {
    result.isValid = false;
    result.issues.push(`เกิดข้อผิดพลาดในการตรวจสอบ: ${error.message}`);
    return result;
  }
}

/**
 * ตรวจสอบความสมบูรณ์ของข้อมูล user และ username
 */
export async function validateUserData(userId: string, username: string): Promise<UserDataValidationResult> {
  const result: UserDataValidationResult = {
    isValid: true,
    hasUsernameEntry: false,
    hasUserEntry: false,
    issues: []
  };

  try {
    if (!db) {
      result.isValid = false;
      result.issues.push('ฐานข้อมูลไม่พร้อมใช้งาน');
      return result;
    }

    // ตรวจสอบข้อมูลใน users collection
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      result.hasUserEntry = true;
      const userData = userDoc.data();
      
      if (!userData.username || userData.username !== username) {
        result.isValid = false;
        result.issues.push('ข้อมูล username ใน user record ไม่ถูกต้อง');
      }
    } else {
      result.isValid = false;
      result.issues.push('ไม่พบข้อมูลใน users collection');
    }

    // ตรวจสอบข้อมูลใน usernames collection
    const usernameDoc = await getDoc(doc(db, 'usernames', username));
    if (usernameDoc.exists()) {
      result.hasUsernameEntry = true;
      const usernameData = usernameDoc.data();
      
      if (!usernameData.uid || usernameData.uid !== userId) {
        result.isValid = false;
        result.issues.push('ข้อมูล uid ใน username record ไม่ถูกต้อง');
      }
    } else {
      result.isValid = false;
      result.issues.push('ไม่พบข้อมูลใน usernames collection');
    }

    return result;
  } catch (error: any) {
    result.isValid = false;
    result.issues.push(`เกิดข้อผิดพลาดในการตรวจสอบ: ${error.message}`);
    return result;
  }
}

/**
 * ซ่อมแซมข้อมูล username ที่ขาดหายหรือไม่ถูกต้อง
 */
export async function repairUsernameData(userId: string, username: string, email: string): Promise<boolean> {
  try {
    if (!db) {
      throw new Error('ฐานข้อมูลไม่พร้อมใช้งาน');
    }

    await runTransaction(db, async (transaction) => {
      const timestamp = new Date();
      
      // เพิ่มหรือแก้ไขข้อมูลใน usernames collection
      const usernameDocRef = doc(db, 'usernames', username);
      transaction.set(usernameDocRef, {
        uid: userId,
        createdAt: timestamp,
        username: username,
        repairedAt: timestamp
      }, { merge: true });

      // เพิ่มหรือแก้ไขข้อมูลใน users collection
      const userDocRef = doc(db, 'users', userId);
      transaction.set(userDocRef, {
        username: username,
        displayName: username,
        email: email,
        repairedAt: timestamp
      }, { merge: true });
    });

    return true;
  } catch (error: any) {
    console.error('Failed to repair username data:', error);
    return false;
  }
}

/**
 * ตรวจสอบและซ่อมแซมข้อมูลหากจำเป็น (สำหรับใช้หลังจาก login)
 */
export async function validateAndRepairUserData(userId: string, username: string, email: string): Promise<{
  isValid: boolean;
  wasRepaired: boolean;
  issues: string[];
}> {
  const validation = await validateUserData(userId, username);
  
  if (validation.isValid) {
    return {
      isValid: true,
      wasRepaired: false,
      issues: []
    };
  }

  // พยายามซ่อมแซมข้อมูล
  const repaired = await repairUsernameData(userId, username, email);
  
  if (repaired) {
    // ตรวจสอบอีกครั้งหลังจากซ่อมแซม
    const revalidation = await validateUserData(userId, username);
    return {
      isValid: revalidation.isValid,
      wasRepaired: true,
      issues: revalidation.isValid ? [] : revalidation.issues
    };
  }

  return {
    isValid: false,
    wasRepaired: false,
    issues: [...validation.issues, 'ไม่สามารถซ่อมแซมข้อมูลได้']
  };
}

/**
 * ฟังก์ชันสำหรับตรวจสอบข้อมูลทั้งหมดของระบบ (สำหรับ admin)
 */
export async function performSystemValidation(): Promise<{
  totalUsers: number;
  validUsers: number;
  invalidUsers: number;
  issues: Array<{ userId: string; username: string; issues: string[] }>;
}> {
  // This would be implemented for admin tools
  // For now, return a placeholder
  return {
    totalUsers: 0,
    validUsers: 0,
    invalidUsers: 0,
    issues: []
  };
} 