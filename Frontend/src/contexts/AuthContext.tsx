'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { logLogin, logSignup } from '../utils/logger';

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

  async function signUp(username: string, password: string) {
    if (!auth || !db) {
      throw new Error('Firebase not initialized');
    }
    
    try {
      // Check if username already exists
      const usernameDoc = await getDoc(doc(db, 'usernames', username));
      if (usernameDoc.exists()) {
        throw new Error('Username already exists');
      }
      
      // Create user with a fake email (username@app.local)
      const fakeEmail = `${username}@app.local`;
      const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, password);
      
      // Update user profile with username
      await updateProfile(userCredential.user, {
        displayName: username
      });
      
      // Store username mapping in Firestore
      await setDoc(doc(db, 'usernames', username), {
        uid: userCredential.user.uid,
        createdAt: new Date()
      });
      
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        username: username,
        displayName: username,
        email: fakeEmail,
        role: 'user',
        createdAt: new Date()
      });

      // Log successful signup
      await logSignup(
        userCredential.user.uid,
        fakeEmail,
        username
      );
      
    } catch (error: any) {
      // SignUp error - provide user-friendly messages
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('ชื่อผู้ใช้นี้มีคนใช้แล้ว กรุณาเลือกชื่อผู้ใช้อื่น');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('รูปแบบชื่อผู้ใช้ไม่ถูกต้อง');
      } else if (error.code === 'permission-denied') {
        throw new Error('ไม่สามารถสร้างบัญชีได้ในขณะนี้');
      } else if (error.code === 'unavailable') {
        throw new Error('บริการไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง');
      } else if (error.message === 'Username already exists') {
        throw new Error('ชื่อผู้ใช้นี้มีคนใช้แล้ว กรุณาเลือกชื่อผู้ใช้อื่น');
      } else {
        throw new Error('การสมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    }
  }

  async function signIn(username: string, password: string) {
    if (!auth || !db) {
      throw new Error('Firebase not initialized');
    }
    
    try {
      // Get user ID from username
      const usernameDoc = await getDoc(doc(db, 'usernames', username));
      if (!usernameDoc.exists()) {
        throw new Error('Username not found');
      }
      
      // Sign in with fake email
      const fakeEmail = `${username}@app.local`;
      const userCredential = await signInWithEmailAndPassword(auth, fakeEmail, password);
      
      // Log successful login
      await logLogin(
        userCredential.user.uid,
        fakeEmail,
        username
      );
      
    } catch (error: any) {
      // SignIn error - provide user-friendly messages
      if (error.code === 'permission-denied') {
        throw new Error('ไม่สามารถเข้าสู่ระบบได้ในขณะนี้');
      } else if (error.code === 'unavailable') {
        throw new Error('บริการไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง');
      } else if (error.message === 'Username not found') {
        throw new Error('ไม่พบชื่อผู้ใช้นี้');
      } else if (error.code === 'auth/wrong-password') {
        throw new Error('รหัสผ่านไม่ถูกต้อง');
      } else if (error.code === 'auth/invalid-credential') {
        throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      } else if (error.code === 'auth/user-not-found') {
        throw new Error('ไม่พบชื่อผู้ใช้นี้');
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