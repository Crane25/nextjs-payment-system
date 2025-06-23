'use client';

import React, { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/contexts/UserContext';
import { getUserDisplayName, getUserAvatarInitial } from '@/utils/userDisplay';
import { useRouter } from 'next/navigation';
import { 
  UserGroupIcon, 
  EnvelopeIcon, 
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

export default function NoTeamPage() {
  const { user, logout } = useAuth();
  const { userProfile, loading, refreshUserProfile } = useUserProfile();
  const router = useRouter();

  // ตรวจสอบว่าผู้ใช้มีทีมแล้วหรือไม่
  useEffect(() => {
    if (!loading && userProfile?.teamId) {
      router.push('/dashboard');
    }
  }, [userProfile, loading, router]);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('ออกจากระบบสำเร็จ');
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการออกจากระบบ');
    }
  };

  const handleRefresh = async () => {
    try {
      await refreshUserProfile();
      toast.success('รีเฟรชข้อมูลแล้ว');
    } catch (error) {
      // Error refreshing profile
      toast.error('ไม่สามารถรีเฟรชข้อมูลได้');
    }
  };

  // แสดง loading ขณะที่กำลังตรวจสอบข้อมูลผู้ใช้
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">กำลังตรวจสอบสถานะ...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {/* Icon */}
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <UserGroupIcon className="h-10 w-10 text-white" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            ยินดีต้อนรับ!
          </h1>
          <p className="text-gray-600 mb-6">
            คุณยังไม่ได้เข้าร่วมทีมใด ๆ
          </p>

          {/* User Info */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <span className="text-white text-lg font-bold">
                  {getUserAvatarInitial(userProfile || {})}
                </span>
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900">
                  {getUserDisplayName(userProfile || {})}
                </p>
                <p className="text-sm text-gray-500">
                  {user?.email}
                </p>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-center space-x-2 mb-6">
            <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
            <span className="text-sm text-yellow-600 font-medium">
              รอการเชิญเข้าร่วมทีม
            </span>
          </div>

          {/* Instructions */}
          <div className="space-y-4 mb-8">
            <div className="flex items-start space-x-3 text-left">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-blue-600 text-sm font-bold">1</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">รอคำเชิญจากทีม</p>
                <p className="text-xs text-gray-500">ผู้ดูแลทีมจะส่งคำเชิญมาที่อีเมลของคุณ</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 text-left">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-blue-600 text-sm font-bold">2</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">ตรวจสอบอีเมล</p>
                <p className="text-xs text-gray-500">คลิกลิงก์ในอีเมลเพื่อเข้าร่วมทีม</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 text-left">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-blue-600 text-sm font-bold">3</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">เริ่มใช้งาน</p>
                <p className="text-xs text-gray-500">เข้าถึงระบบจัดการเงินได้เต็มรูปแบบ</p>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-center space-x-2">
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />
              <p className="text-sm text-yellow-800">
                <span className="font-medium">หมายเหตุ:</span> คุณจะไม่สามารถใช้งานระบบได้จนกว่าจะเข้าร่วมทีม
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleRefresh}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 px-4 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-300 font-medium"
            >
              <ClockIcon className="h-5 w-5 inline-block mr-2" />
              รีเฟรชสถานะ
            </button>

            <button
              onClick={handleLogout}
              className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5 inline-block mr-2" />
              ออกจากระบบ
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-500">
            หากมีปัญหา กรุณาติดต่อผู้ดูแลระบบ
          </p>
        </div>
      </div>
    </div>
  );
} 