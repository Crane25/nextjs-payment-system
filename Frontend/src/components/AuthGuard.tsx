'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/contexts/UserContext';
import { usePermission } from '@/hooks/usePermission';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { userProfile, loading: profileLoading } = useUserProfile();
  const { isValidTeamMember, managerHasTeam } = usePermission();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // รอให้ auth และ profile โหลดเสร็จ
    if (authLoading || profileLoading) {
      return;
    }

    // ตรวจสอบว่าเป็นหน้า public หรือไม่
    const isPublicPage = pathname === '/login' || pathname === '/register';
    const isNoTeamPage = pathname === '/no-team';
    const isJoinTeamPage = pathname === '/join-team';
    const isAdminOnlyPage = pathname.startsWith('/admin');

    // ถ้าไม่ได้ login และไม่ใช่หน้า public ให้ redirect ไปหน้า login
    if (!user && !isPublicPage) {
      router.push('/login');
      return;
    }

    // ถ้า login แล้วแต่อยู่ในหน้า public
    if (user && isPublicPage) {
      router.push('/dashboard');
      return;
    }

    // ถ้า login แล้วและมี userProfile
    if (user && userProfile) {
      // ตรวจสอบหน้าที่เฉพาะ Admin เท่านั้น
      if (isAdminOnlyPage && userProfile.role !== 'admin') {
        router.push('/dashboard');
        return;
      }

      // เอาการรีโหลดหน้าเว็บอัตโนมัติออก - ให้ผู้ใช้ใช้งานได้เลย
      // const isNewUser = user.metadata?.creationTime && 
      //   (Date.now() - new Date(user.metadata.creationTime).getTime()) < 10000; // 10 วินาที

      // if (isNewUser && !isNoTeamPage && !isJoinTeamPage) {
      //   console.log('🔄 New user detected, allowing time for data to sync...');
      //   // รอให้ข้อมูลอัพเดทก่อนตัดสินใจ redirect
      //   // หลังจากนั้นจะตัดสินใจว่าจะส่งไป dashboard หรือ no-team ตามข้อมูลจริง
      //   setTimeout(() => {
      //     window.location.reload();
      //   }, 3000);
      //   return;
      // }

      // ผู้ใช้สามารถใช้งานระบบได้ปกติแม้ไม่มีทีม
      // เอาการ redirect ไป /no-team ออก เพื่อให้ผู้ใช้สามารถเข้าใช้งานได้ปกติ
      // if (userProfile.role === 'user' && !isValidTeamMember && !isNoTeamPage && !isJoinTeamPage) {
      //   router.push('/no-team');
      //   return;
      // }
      
      // ถ้าอยู่ในหน้า /no-team แต่เป็นสมาชิกทีมที่ถูกต้องแล้ว หรือเป็น admin/manager ให้ไปหน้า dashboard
      if (isNoTeamPage && (userProfile.role === 'admin' || userProfile.role === 'manager' || isValidTeamMember)) {
        router.push('/dashboard');
        return;
      }
      
      // สำหรับ Manager ที่ไม่มีทีม - แสดง banner แจ้งเตือน (ไม่ redirect)
      // สามารถเข้าใช้งานได้ปกติเพื่อสร้างทีมใหม่
    }
  }, [user, userProfile, authLoading, profileLoading, pathname, router, isValidTeamMember]);

  // แสดง loading ขณะที่กำลังตรวจสอบ auth
  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  // ให้ผู้ใช้ทุกคนสามารถใช้งานระบบได้ปกติ ไม่ว่าจะมีทีมหรือไม่
  // เอา warning banner ออกเพื่อให้ใช้งานได้อย่างปกติ

  return <>{children}</>;
} 