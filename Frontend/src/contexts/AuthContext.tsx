'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  deleteUser
} from 'firebase/auth';
import { doc, setDoc, getDoc, runTransaction, writeBatch } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { logLogin, logSignup } from '../utils/logger';
import { validateAndRepairUserData } from '../utils/userValidation';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (username: string, password: string) => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      // Auth not initialized
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Helper function to retry operations
  const retryOperation = async <T,>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> => {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry for certain errors
        if (
          error.code === 'auth/email-already-in-use' ||
          error.code === 'auth/weak-password' ||
          error.code === 'auth/invalid-email' ||
          error.message === 'Username already exists'
        ) {
          throw error;
        }
        
        // If this is the last attempt, throw the error
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Wait before retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
    
    throw lastError;
  };

  async function signUp(username: string, password: string) {
    if (!auth || !db) {
      throw new Error('Firebase not initialized');
    }
    
    try {
      await retryOperation(async () => {
        // Step 1: Check if username already exists
        const usernameDocRef = doc(db, 'usernames', username);
        const usernameDoc = await getDoc(usernameDocRef);
        
        if (usernameDoc.exists()) {
          throw new Error('Username already exists');
        }
        
        let userCredential: any = null;
        
        try {
          // Step 2: Create user with Firebase Auth (cannot be in transaction)
          const fakeEmail = `${username}@app.local`;
          // Create Firebase Auth user
          userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, password);
          
          // Update user profile with username
          await updateProfile(userCredential.user, {
            displayName: username
          });
          
          const userId = userCredential.user.uid;
          const timestamp = new Date();
          
          // Step 3: Use transaction to write both Firestore documents atomically
          await runTransaction(db, async (transaction) => {
            // Double-check username availability within transaction
            const usernameCheck = await transaction.get(usernameDocRef);
            if (usernameCheck.exists()) {
              throw new Error('Username was taken during registration');
            }
            
            // Store username mapping in Firestore
            transaction.set(usernameDocRef, {
              uid: userId,
              createdAt: timestamp,
              username: username
            });
            
            // Store user data in users collection
            const userDocRef = doc(db, 'users', userId);
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
          return { userId, fakeEmail, username };
          
        } catch (firestoreError: any) {
          // If Firestore operations fail but Auth user was created, we need to clean up
          if (userCredential?.user) {
            try {
              // Delete the Auth user if Firestore operations failed
              await deleteUser(userCredential.user);
              console.log('Cleaned up Auth user after Firestore failure');
            } catch (deleteError) {
              console.error('Failed to cleanup Auth user:', deleteError);
            }
          }
          throw firestoreError;
        }
      });

      // Log successful signup (outside transaction to avoid blocking)
      try {
        const fakeEmail = `${username}@app.local`;
        const currentUser = auth.currentUser;
        if (currentUser) {
          await logSignup(currentUser.uid, fakeEmail, username);
        }
      } catch (logError) {
        // Don't fail signup if logging fails
        console.warn('Failed to log signup:', logError);
      }
      
    } catch (error: any) {
      // Enhanced error handling with more specific messages
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('ชื่อผู้ใช้นี้มีคนใช้แล้ว กรุณาเลือกชื่อผู้ใช้อื่น');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('รูปแบบชื่อผู้ใช้ไม่ถูกต้อง');
      } else if (error.code === 'permission-denied' || error.code === 'firestore/permission-denied') {
        throw new Error('ไม่สามารถสร้างบัญชีได้ในขณะนี้ กรุณาติดต่อผู้ดูแลระบบ');
      } else if (error.code === 'unavailable' || error.code === 'firestore/unavailable') {
        throw new Error('บริการไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้งใน 2-3 นาที');
      } else if (error.code === 'auth/network-request-failed' || error.name === 'NetworkError') {
        throw new Error('ไม่สามารถเชื่อมต่อได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
      } else if (error.code === 'firestore/deadline-exceeded') {
        throw new Error('การเชื่อมต่อหมดเวลา กรุณาลองใหม่อีกครั้ง');
      } else if (error.message === 'Username already exists') {
        throw new Error('ชื่อผู้ใช้นี้มีคนใช้แล้ว กรุณาเลือกชื่อผู้ใช้อื่น');
      } else if (error.message?.includes('Firebase not initialized')) {
        throw new Error('บริการไม่พร้อมใช้งาน กรุณารอสักครู่แล้วลองใหม่');
      } else {
        // Log unexpected errors for debugging
        console.error('Unexpected signup error:', {
          code: error.code,
          message: error.message,
          name: error.name
        });
        throw new Error('การสมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หากปัญหายังคงอยู่ กรุณาติดต่อผู้ดูแลระบบ');
      }
    }
  }

  async function signIn(username: string, password: string) {
    if (!auth || !db) {
      throw new Error('Firebase not initialized');
    }
    
    try {
      await retryOperation(async () => {
        // Get user ID from username
        const usernameDoc = await getDoc(doc(db, 'usernames', username));
        if (!usernameDoc.exists()) {
          throw new Error('Username not found');
        }
        
                 // Sign in with fake email
         const fakeEmail = `${username}@app.local`;
         const userCredential = await signInWithEmailAndPassword(auth, fakeEmail, password);
         
         // Validate and repair user data if needed
         try {
           const validation = await validateAndRepairUserData(
             userCredential.user.uid,
             username,
             fakeEmail
           );
           
           if (validation.wasRepaired) {
             console.log('User data was repaired during login:', validation);
           }
           
           if (!validation.isValid) {
             console.warn('User data validation failed:', validation.issues);
           }
         } catch (validationError) {
           // Don't fail login if validation fails
           console.warn('Failed to validate user data:', validationError);
         }
         
         // Update last login time
         try {
           await setDoc(doc(db, 'users', userCredential.user.uid), {
             lastLogin: new Date()
           }, { merge: true });
         } catch (updateError) {
           // Don't fail login if update fails
           console.warn('Failed to update last login:', updateError);
         }
         
         // Log successful login
         try {
           await logLogin(userCredential.user.uid, fakeEmail, username);
         } catch (logError) {
           // Don't fail login if logging fails
           console.warn('Failed to log login:', logError);
         }
      });
      
    } catch (error: any) {
      // Enhanced error handling
      if (error.code === 'permission-denied' || error.code === 'firestore/permission-denied') {
        throw new Error('ไม่สามารถเข้าสู่ระบบได้ในขณะนี้');
      } else if (error.code === 'unavailable' || error.code === 'firestore/unavailable') {
        throw new Error('บริการไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง');
      } else if (error.message === 'Username not found') {
        throw new Error('ไม่พบชื่อผู้ใช้นี้');
      } else if (error.code === 'auth/wrong-password') {
        throw new Error('รหัสผ่านไม่ถูกต้อง');
      } else if (error.code === 'auth/invalid-credential') {
        throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      } else if (error.code === 'auth/user-not-found') {
        throw new Error('ไม่พบชื่อผู้ใช้นี้');
      } else if (error.code === 'auth/network-request-failed' || error.name === 'NetworkError') {
        throw new Error('ไม่สามารถเชื่อมต่อได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
      } else {
        throw new Error('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    }
  }

  async function logout() {
    if (!auth) {
      throw new Error('Firebase not initialized');
    }
    
    await signOut(auth);
  }

  const value = {
    user,
    loading,
    signUp,
    signIn,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
} 