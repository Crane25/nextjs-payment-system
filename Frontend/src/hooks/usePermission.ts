import { useUserProfile } from '../contexts/UserContext';
import { ROLE_PERMISSIONS } from '../types/user';
import type { Permission } from '../types/user';
import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const usePermission = () => {
  const { userProfile: user, loading: userProfileLoading } = useUserProfile();
  
  // All useState calls must be at the top
  const [isValidTeamMember, setIsValidTeamMember] = useState<boolean>(true);
  const [userTeamMemberships, setUserTeamMemberships] = useState<string[]>([]);
  const [managerHasTeam, setManagerHasTeam] = useState<boolean>(false);
  
  // ตรวจสอบว่าผู้ใช้ยังเป็นสมาชิกทีมอยู่หรือไม่
  useEffect(() => {
    const checkTeamMembership = async () => {
      // Wait for userProfile to load
      if (userProfileLoading) return;
      
      if (!user || !user.email) {
        setIsValidTeamMember(false);
        return;
      }

      // Admin มีสิทธิ์เข้าถึงทุกอย่างเสมอ
      if (user.role === 'admin') {
        setIsValidTeamMember(true);
        return;
      }

      try {
        // ตรวจสอบว่ายังมีใน teamMembers collection หรือไม่ (ทุกทีม)
        const membersQuery = query(
          collection(db, 'teamMembers'),
          where('email', '==', user.email),
          where('status', '==', 'active')
        );
        
        const snapshot = await getDocs(membersQuery);
        const hasActiveTeamMembership = !snapshot.empty;
        
        setIsValidTeamMember(hasActiveTeamMembership);
        
        // สำหรับ Manager: ตรวจสอบเพิ่มเติมว่ามีทีมหรือไม่
        if (user.role === 'manager') {
          setManagerHasTeam(hasActiveTeamMembership);
        } else {
          setManagerHasTeam(false);
        }
        
        // ถ้าไม่เป็นสมาชิกทีมใดเลย ให้ log warning
        if (!hasActiveTeamMembership && user.role !== 'user') {

        }
      } catch (error) {
        // Error checking team membership
        setIsValidTeamMember(false);
        setManagerHasTeam(false);
      }
    };

    checkTeamMembership();
  }, [user?.email, user?.role, userProfileLoading]);

  // Fetch user team memberships
  useEffect(() => {
    const fetchUserTeamMemberships = async () => {
      // Wait for userProfile to load
      if (userProfileLoading) return;
      
      if (!user || !user.email || user.role === 'admin') {
        setUserTeamMemberships([]);
        return;
      }
      
      try {
        const membersQuery = query(
          collection(db, 'teamMembers'),
          where('email', '==', user.email),
          where('status', '==', 'active')
        );
        
        const snapshot = await getDocs(membersQuery);
        const teamIds = snapshot.docs.map(doc => doc.data().teamId);
        setUserTeamMemberships(teamIds);
      } catch (error) {
        // Error fetching user team memberships
        setUserTeamMemberships([]);
      }
    };

    fetchUserTeamMemberships();
  }, [user?.email, user?.role, userProfileLoading]);

  const hasPermission = useCallback((resource: string, action: string): boolean => {
    if (!user) return false;
    
    // Admin มีสิทธิ์ทุกอย่าง (สิทธิ์สูงสุด)
    if (user.role === 'admin') return true;
    
    // Manager มีสิทธิ์พื้นฐาน แต่บางสิทธิ์ต้องมีทีม
    if (user.role === 'manager') {
      // สิทธิ์ที่ Manager สามารถใช้ได้แม้ไม่มีทีม
      const basicManagerPermissions = ['teams', 'settings', 'websites', 'topup', 'apiKeys'];
      if (basicManagerPermissions.includes(resource)) return true;
      
      // สิทธิ์อื่นๆ ต้องมีทีม
      return managerHasTeam;
    }

    // ตรวจสอบว่าเป็นสมาชิกทีมที่ถูกต้องหรือไม่ (เฉพาะ user เท่านั้น)
    if (!isValidTeamMember) {
      return false;
    }

    // ตรวจสอบสิทธิ์จาก role
    const rolePermissions = ROLE_PERMISSIONS[user.role as keyof typeof ROLE_PERMISSIONS];
    if (!rolePermissions) return false;

    return rolePermissions.permissions.some((permission) => 
      permission.resource === resource &&
      permission.actions.some(a => a === action)
    );
  }, [user?.role, isValidTeamMember]);

  const canViewWebsites = () => hasPermission('websites', 'read');
  const canCreateWebsites = () => hasPermission('websites', 'create');
  const canEditWebsites = () => hasPermission('websites', 'update');
  const canDeleteWebsites = () => hasPermission('websites', 'delete');

  const canViewTopup = () => hasPermission('topup', 'read');
  const canCreateTopup = () => hasPermission('topup', 'create');

  const canViewUsers = () => hasPermission('users', 'read');
  const canManageUsers = () => hasPermission('users', 'update');

  const canViewSettings = () => hasPermission('settings', 'read');
  const canEditSettings = () => hasPermission('settings', 'update');

  // เฉพาะ Admin และ Manager เท่านั้นที่สามารถดูหน้าจัดการทีมได้
  const canViewTeams = () => {
    if (user?.role === 'admin') return true; // Admin ดูได้ทุกทีม
    if (user?.role === 'manager') return true; // Manager ดูได้เสมอ (สร้างทีมเองได้)
    return false; // User ไม่สามารถเข้าหน้าจัดการทีมได้
  };

  // ฟังก์ชันสำหรับ multi-team support (ใช้ใน dashboard และ topup-history)
  const canAccessTeamData = () => {
    if (user?.role === 'admin') return true; // Admin เข้าถึงได้ทุกทีม
    if (user?.role === 'manager') return true; // Manager เข้าถึงได้เสมอ (แม้ไม่มีทีม)
    if (user?.role === 'user' && user?.teamId && isValidTeamMember) return true; // User เข้าถึงข้อมูลทีมได้
    return false; // User ที่ไม่มีทีมไม่สามารถเข้าถึงข้อมูลทีมได้
  };

  const canManageTeams = () => {
    if (user?.role === 'admin') return true; // Admin จัดการได้ทุกทีม
    if (user?.role === 'manager') return true; // Manager จัดการได้เสมอ (สร้างทีมเองได้)
    return false; // User ไม่สามารถจัดการทีมได้
  };

  const canCreateTeams = () => {
    if (user?.role === 'admin') return true; // Admin สร้างได้
    if (user?.role === 'manager') return true; // Manager สร้างได้
    return false; // User ไม่สามารถสร้างทีมได้
  };

  // ฟังก์ชันใหม่: ตรวจสอบว่าสามารถจัดการทีมที่ระบุได้หรือไม่
  const canManageSpecificTeam = (teamId: string) => {
    if (!user) return false;
    if (user.role === 'admin') return true; // Admin จัดการได้ทุกทีม
    if (user.role === 'manager') {
      // Manager จัดการได้เฉพาะทีมที่ตัวเองเป็นเจ้าของหรือสมาชิก
      return user.teamId === teamId || user.uid === teamId; // ตรวจสอบว่าเป็นทีมของตัวเองหรือไม่
    }
    return false;
  };

  // ฟังก์ชันใหม่: ตรวจสอบว่าสามารถดูสมาชิกในทีมที่ระบุได้หรือไม่
  const canViewTeamMembers = (teamId: string) => {
    if (!user) return false;
    if (user.role === 'admin') return true; // Admin ดูได้ทุกทีม
    if (user.role === 'manager') {
      // Manager ดูได้เฉพาะทีมของตัวเอง
      return user.teamId === teamId || user.uid === teamId;
    }
    return false;
  };

  // ฟังก์ชันตรวจสอบว่าผู้ใช้เป็นสมาชิกของทีมที่ระบุหรือไม่
  const isMemberOfTeam = useCallback((teamId: string) => {
    if (!user) return false;
    if (user.role === 'admin') return true; // Admin เข้าถึงได้ทุกทีม
    return userTeamMemberships.includes(teamId);
  }, [user?.role, userTeamMemberships]);

  // ฟังก์ชันตรวจสอบสิทธิ์เฉพาะทีม
  const hasTeamPermission = useCallback((teamId: string, resource: string, action: string) => {
    if (!user) return false;
    if (user.role === 'admin') return true; // Admin มีสิทธิ์ทุกอย่าง
    
    // ตรวจสอบว่าเป็นสมาชิกของทีมนั้นหรือไม่
    if (!isMemberOfTeam(teamId)) return false;
    
    // ตรวจสอบสิทธิ์ตาม role
    return hasPermission(resource, action);
  }, [user?.role, isMemberOfTeam, hasPermission]);
  
  const canViewApiKeys = () => hasPermission('apiKeys', 'read');
  
  // Admin มีสิทธิ์สูงสุด
  const canAccessAdminPanel = () => user?.role === 'admin';
  
  // เฉพาะ Admin เท่านั้นที่ดูได้หลายทีม Manager ดูได้เฉพาะทีมตัวเอง
  const canViewMultipleTeams = () => user?.role === 'admin';

  const getUserRole = () => user?.role || 'user';
  const isAdmin = () => user?.role === 'admin';
  const isManager = () => user?.role === 'manager';
  const isUser = () => user?.role === 'user';

  return {
    hasPermission,
    canViewWebsites,
    canCreateWebsites,
    canEditWebsites,
    canDeleteWebsites,
    canViewTopup,
    canCreateTopup,
    canViewUsers,
    canManageUsers,
    canViewSettings,
    canEditSettings,
    canViewTeams,
    canAccessTeamData,
    canManageTeams,
    canCreateTeams,
    canManageSpecificTeam,
    canViewTeamMembers,
    canViewApiKeys,
    canAccessAdminPanel,
    canViewMultipleTeams,
    getUserRole,
    isAdmin,
    isManager,
    isUser,
    isValidTeamMember,
    managerHasTeam,
    // ฟังก์ชันใหม่สำหรับ multi-team
    isMemberOfTeam,
    hasTeamPermission,
    userTeamMemberships
  };
}; 