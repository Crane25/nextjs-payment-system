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

      // ตรวจสอบว่าผู้ใช้ที่ไม่ใช่ admin หรือ manager ยังเป็นสมาชิกทีมอยู่หรือไม่
      // ยกเว้นหน้า /no-team และ /join-team และยกเว้น Manager ที่สามารถสร้างทีมเองได้
      if (userProfile.role === 'user' && !isValidTeamMember && !isNoTeamPage && !isJoinTeamPage) {
        router.push('/no-team');
        return;
      }
      
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

  // แสดง banner แจ้งเตือนสำหรับ Manager ที่ไม่มีทีม
  if (userProfile?.role === 'manager' && !managerHasTeam) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Warning Banner */}
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="py-3">
              <div className="flex items-center justify-between flex-wrap">
                <div className="flex items-center">
                  <span className="flex p-2 rounded-lg bg-yellow-400 dark:bg-yellow-600">
                    <svg className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                  </span>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      คุณไม่ได้เป็นสมาชิกของทีมใดในขณะนี้
                    </p>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                      กรุณาสร้างทีมใหม่หรือรอการเชิญเข้าร่วมทีม เพื่อเข้าถึงข้อมูลทีมและเว็บไซต์
                    </p>
                  </div>
                </div>
                <div className="mt-2 sm:mt-0">
                  <button
                    onClick={() => window.location.href = '/team'}
                    className="text-sm font-medium text-yellow-800 dark:text-yellow-200 underline hover:text-yellow-900 dark:hover:text-yellow-100"
                  >
                    สร้างทีมใหม่
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        {children}
      </div>
    );
  }

  return <>{children}</>;
} 