'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ROLE_PERMISSIONS } from '../types/user';
import type { User as CustomUser } from '../types/user';

interface UserContextType {
  userProfile: CustomUser | null;
  loading: boolean;
  refreshUserProfile: () => Promise<void>;
  updateUserRole: (role: 'admin' | 'manager' | 'user') => Promise<void>;
}

const UserContext = createContext<UserContextType>({} as UserContextType);

export function useUserProfile() {
  return useContext(UserContext);
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<number>(0);

  const loadUserProfile = async (force = false) => {
    if (!user || !db) {
      setUserProfile(null);
      setLoading(false);
      return;
    }

    // ใช้ cache 60 วินาที เว้นแต่จะ force refresh (เพิ่มเวลา cache)
    const now = Date.now();
    if (!force && now - lastFetch < 60000 && userProfile) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // ลองหา user profile ก่อน
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        


        
        // ตรวจสอบว่าผู้ใช้ยังเป็นสมาชิกทีมอยู่หรือไม่ (เฉพาะ non-admin)
        let validTeamId = userData.teamId;
        if (userData.teamId && userData.role !== 'admin') {
          try {
            const membersQuery = query(
              collection(db, 'teamMembers'),
              where('email', '==', user.email),
              where('teamId', '==', userData.teamId),
              where('status', '==', 'active')
            );
            
            const memberSnapshot = await getDocs(membersQuery);
            if (memberSnapshot.empty) {
              // ผู้ใช้ไม่ได้เป็นสมาชิกทีมนี้แล้ว

              validTeamId = null;
              
              // ตรวจสอบว่ามีทีมอื่นหรือไม่
              const allMembersQuery = query(
                collection(db, 'teamMembers'),
                where('email', '==', user.email),
                where('status', '==', 'active')
              );
              
              const allMembersSnapshot = await getDocs(allMembersQuery);
              if (!allMembersSnapshot.empty) {
                // มีทีมอื่น ใช้ทีมแรกที่พบ
                validTeamId = allMembersSnapshot.docs[0].data().teamId;

              }
              
              // อัปเดต user document
              await updateDoc(doc(db, 'users', user.uid), {
                teamId: validTeamId,
                role: validTeamId ? userData.role : 'user'
              });
            }
          } catch (error) {
            // Error checking team membership - silently continue
          }
        }
        
        const profile: CustomUser = {
          uid: user.uid,
          email: user.email || '',
          // ใช้ displayName เป็นหลัก ถ้าไม่มีให้ fallback ตามลำดับ
          displayName: userData.displayName || user.displayName || userData.username || user.email?.split('@')[0] || 'ผู้ใช้',
          username: userData.username || user.email?.split('@')[0] || 'user',
          role: userData.role || 'user', // default เป็น user สำหรับผู้ใช้ใหม่
          permissions: ROLE_PERMISSIONS[(userData.role as keyof typeof ROLE_PERMISSIONS) || 'user'].permissions.map(p => ({
            resource: p.resource,
            actions: [...p.actions]
          })),
          createdAt: userData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          lastLogin: new Date().toISOString(),
          ownerId: userData.ownerId,
          teamId: validTeamId
        };
        

        
        setUserProfile(profile);
      } else {
        // สร้าง profile ใหม่สำหรับ user ใหม่
        const newProfile: CustomUser = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || 'ผู้ใช้',
          role: 'user', // ผู้ใช้ใหม่เริ่มต้นเป็น user (ไม่มีสิทธิ์)
          permissions: ROLE_PERMISSIONS.user.permissions.map(p => ({
            resource: p.resource,
            actions: [...p.actions]
          })),
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString()
        };

        await setDoc(doc(db, 'users', user.uid), {
          ...newProfile,
          createdAt: new Date(),
          lastLogin: new Date()
        });

        setUserProfile(newProfile);
      }
      
      setLastFetch(now);
    } catch (error) {
      // Error loading user profile
      setUserProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshUserProfile = async () => {
    await loadUserProfile(true); // force refresh
  };

  const updateUserRole = async (role: 'admin' | 'manager' | 'user') => {
    if (!user || !userProfile) return;

    try {
      const updatedProfile = {
        ...userProfile,
        role,
        permissions: ROLE_PERMISSIONS[role].permissions.map(p => ({
          resource: p.resource,
          actions: [...p.actions]
        }))
      };

      await setDoc(doc(db, 'users', user.uid), {
        ...updatedProfile,
        lastLogin: new Date()
      }, { merge: true });

      setUserProfile(updatedProfile);
      setLastFetch(Date.now()); // อัพเดท cache timestamp
    } catch (error) {
      // Error updating user role
      throw error;
    }
  };

  useEffect(() => {
    if (user) {
      loadUserProfile();
    } else {
      // ถ้าไม่มี user ให้ clear profile และ set loading เป็น false
      setUserProfile(null);
      setLoading(false);
    }
  }, [user?.uid]); // ใช้ user.uid แทน user object เพื่อลด re-render

  const value = {
    userProfile,
    loading,
    refreshUserProfile,
    updateUserRole
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
} 