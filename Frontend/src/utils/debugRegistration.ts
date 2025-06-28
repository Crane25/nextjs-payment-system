import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
import { createUserWithEmailAndPassword, updateProfile, deleteUser } from 'firebase/auth';
import { auth, db } from '../lib/firebase';

export interface RegistrationDebugResult {
  step: string;
  success: boolean;
  error?: string;
  details?: any;
}

/**
 * ทดสอบการสมัครสมาชิกแบบ step-by-step เพื่อ debug
 */
export async function debugRegistration(username: string, password: string): Promise<RegistrationDebugResult[]> {
  const results: RegistrationDebugResult[] = [];
  let userCredential: any = null;

  try {
    // Step 1: Check Firebase connection
    results.push({
      step: '1. Check Firebase Connection',
      success: !!auth && !!db,
      details: { auth: !!auth, db: !!db }
    });

    if (!auth || !db) {
      return results;
    }

    // Step 2: Check username availability
    try {
      const usernameDoc = await getDoc(doc(db, 'usernames', username));
      results.push({
        step: '2. Check Username Availability',
        success: !usernameDoc.exists(),
        details: { exists: usernameDoc.exists(), data: usernameDoc.exists() ? usernameDoc.data() : null }
      });

      if (usernameDoc.exists()) {
        return results;
      }
    } catch (error: any) {
      results.push({
        step: '2. Check Username Availability',
        success: false,
        error: error.message
      });
      return results;
    }

    // Step 3: Create Firebase Auth user
    try {
      const fakeEmail = `${username}@app.local`;
      userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, password);
      results.push({
        step: '3. Create Firebase Auth User',
        success: true,
        details: { uid: userCredential.user.uid, email: fakeEmail }
      });
    } catch (error: any) {
      results.push({
        step: '3. Create Firebase Auth User',
        success: false,
        error: error.message,
        details: { code: error.code }
      });
      return results;
    }

    // Step 4: Update user profile
    try {
      await updateProfile(userCredential.user, {
        displayName: username
      });
      results.push({
        step: '4. Update User Profile',
        success: true,
        details: { displayName: username }
      });
    } catch (error: any) {
      results.push({
        step: '4. Update User Profile',
        success: false,
        error: error.message
      });
    }

    // Step 5: Write to Firestore with transaction
    try {
      const userId = userCredential.user.uid;
      const timestamp = new Date();
      const usernameDocRef = doc(db, 'usernames', username);
      const userDocRef = doc(db, 'users', userId);

      await runTransaction(db, async (transaction) => {
        // Double-check username availability
        const usernameCheck = await transaction.get(usernameDocRef);
        if (usernameCheck.exists()) {
          throw new Error('Username was taken during registration');
        }

        // Write to usernames collection
        transaction.set(usernameDocRef, {
          uid: userId,
          createdAt: timestamp,
          username: username
        });

        // Write to users collection
        transaction.set(userDocRef, {
          username: username,
          displayName: username,
          email: `${username}@app.local`,
          role: 'user',
          createdAt: timestamp,
          lastLogin: timestamp,
          permissions: []
        });
      });

      results.push({
        step: '5. Write to Firestore',
        success: true,
        details: { userId, username, timestamp: timestamp.toISOString() }
      });
    } catch (error: any) {
      results.push({
        step: '5. Write to Firestore',
        success: false,
        error: error.message,
        details: { code: error.code }
      });

      // Cleanup Auth user if Firestore failed
      if (userCredential?.user) {
        try {
          await deleteUser(userCredential.user);
          results.push({
            step: '5a. Cleanup Auth User',
            success: true,
            details: { reason: 'Firestore operation failed' }
          });
        } catch (deleteError: any) {
          results.push({
            step: '5a. Cleanup Auth User',
            success: false,
            error: deleteError.message
          });
        }
      }
    }

    // Step 6: Verify data was written correctly
    try {
      const usernameDoc = await getDoc(doc(db, 'usernames', username));
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));

      results.push({
        step: '6. Verify Data Written',
        success: usernameDoc.exists() && userDoc.exists(),
        details: {
          usernameExists: usernameDoc.exists(),
          userExists: userDoc.exists(),
          usernameData: usernameDoc.exists() ? usernameDoc.data() : null,
          userData: userDoc.exists() ? { ...userDoc.data(), email: '***' } : null
        }
      });
    } catch (error: any) {
      results.push({
        step: '6. Verify Data Written',
        success: false,
        error: error.message
      });
    }

  } catch (error: any) {
    results.push({
      step: 'Unexpected Error',
      success: false,
      error: error.message,
      details: { code: error.code, name: error.name }
    });
  }

  return results;
}

/**
 * ตรวจสอบข้อมูลที่มีอยู่ในระบบ
 */
export async function checkExistingData(username: string): Promise<{
  usernameExists: boolean;
  userExists?: boolean;
  authUserExists?: boolean;
  usernameData?: any;
  userData?: any;
  issues: string[];
}> {
  const result = {
    usernameExists: false,
    userExists: false,
    authUserExists: false,
    usernameData: null as any,
    userData: null as any,
    issues: [] as string[]
  };

  try {
    // Check usernames collection
    const usernameDoc = await getDoc(doc(db, 'usernames', username));
    result.usernameExists = usernameDoc.exists();
    if (usernameDoc.exists()) {
      result.usernameData = usernameDoc.data();
      
      // Check corresponding user document
      if (result.usernameData?.uid) {
        const userDoc = await getDoc(doc(db, 'users', result.usernameData.uid));
        result.userExists = userDoc.exists();
        if (userDoc.exists()) {
          result.userData = userDoc.data();
        } else {
          result.issues.push('Username exists but corresponding user document is missing');
        }
      } else {
        result.issues.push('Username document exists but has no uid field');
      }
    }

    // Check if auth user exists (by trying to sign in)
    try {
      const fakeEmail = `${username}@app.local`;
      // We can't directly check if auth user exists without signing in
      // This would be checked during actual sign-in process
    } catch (error) {
      // This is expected if user doesn't exist
    }

  } catch (error: any) {
    result.issues.push(`Error checking data: ${error.message}`);
  }

  return result;
}

/**
 * ล้างข้อมูลการทดสอบ (ใช้ระวัง!)
 */
export async function cleanupTestData(username: string, uid?: string): Promise<boolean> {
  try {
    if (!db) return false;

    // Delete from usernames collection
    await setDoc(doc(db, 'usernames', username), {}, { merge: false });
    
    // Delete from users collection if uid provided
    if (uid) {
      await setDoc(doc(db, 'users', uid), {}, { merge: false });
    }

    return true;
  } catch (error) {
    console.error('Failed to cleanup test data:', error);
    return false;
  }
} 