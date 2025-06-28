'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useUserProfile } from '../../contexts/UserContext';
import { usePermission } from '../../hooks/usePermission';

import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { logDisplayNameChange } from '../../utils/logger';
import { getUserDisplayName, getUserAvatarInitial } from '../../utils/userDisplay';
import {
  UserIcon,
  ShieldCheckIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user } = useAuth();
  const { userProfile, refreshUserProfile } = useUserProfile();
  const { canViewSettings } = usePermission();
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const [profileData, setProfileData] = useState({
    displayName: '',
    username: '',
    email: '',
    phone: '',
    bio: '',
    location: ''
  });

  // Load user profile data
  useEffect(() => {
    if (userProfile) {
      // Extract username from email (part before @)
      const username = userProfile.email?.split('@')[0] || 'user';
      // ใช้ utility function เพื่อได้ชื่อแสดงผลที่สม่ำเสมอ
      const displayName = getUserDisplayName(userProfile, username);
      
      setProfileData({
        displayName: displayName,
        username: username,
        email: userProfile.email || '',
        phone: '',
        bio: '',
        location: ''
      });
    }
  }, [userProfile]);

  const tabs = [
    { id: 'profile', name: 'ข้อมูลส่วนตัว', icon: UserIcon },
    { id: 'security', name: 'ความปลอดภัย', icon: ShieldCheckIcon }
  ];

  const handleSaveProfile = async () => {
    if (!user || !userProfile) {
      toast.error('ไม่พบข้อมูลผู้ใช้');
      return;
    }

    try {
      setSaving(true);

      // Get old display name for logging
      const oldDisplayName = userProfile.displayName || userProfile.username || 'ไม่ระบุ';

      // Update display name in Firestore
      // If displayName is empty, use username as fallback
      const finalDisplayName = profileData.displayName.trim() || profileData.username;
      
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: finalDisplayName,
        lastLogin: new Date()
      });

      // Log the display name change if it actually changed
      if (oldDisplayName !== finalDisplayName) {
        await logDisplayNameChange(
          user.uid,
          userProfile.email || user.email || '',
          userProfile.username || profileData.username,
          oldDisplayName,
          finalDisplayName
        );
      }

      // Refresh user profile to get updated data
      await refreshUserProfile();
      
      toast.success('บันทึกข้อมูลเรียบร้อยแล้ว');
      setIsEditing(false);
    } catch (error) {
      // Error updating profile
      toast.error('ไม่สามารถบันทึกข้อมูลได้');
    } finally {
      setSaving(false);
    }
  };

  // ผู้ใช้ทุกคนสามารถเข้าหน้าตั้งค่าได้
  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <UserIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">กรุณาเข้าสู่ระบบ</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">กรุณาเข้าสู่ระบบเพื่อเข้าถึงการตั้งค่า</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-6">
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl p-6 border border-white/30 dark:border-gray-700/30">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">ข้อมูลส่วนตัว</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    disabled={saving}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isEditing ? (
                      <>
                        <XMarkIcon className="h-4 w-4" />
                        <span>ยกเลิก</span>
                      </>
                    ) : (
                      <>
                        <PencilIcon className="h-4 w-4" />
                        <span>แก้ไข</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-6 mb-8">
                <div className="w-24 h-24 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-white text-3xl font-bold">
                    {getUserAvatarInitial(profileData)}
                  </span>
                </div>
                <div>
                  <h4 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {getUserDisplayName(profileData)}
                  </h4>
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">@{profileData.username}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    ชื่อที่ใช้แสดง <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={profileData.displayName}
                    onChange={(e) => setProfileData(prev => ({ ...prev, displayName: e.target.value }))}
                    disabled={!isEditing || saving}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    placeholder="ชื่อที่จะแสดงในระบบ"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    ชื่อนี้จะแสดงในระบบ หากไม่ระบุจะใช้ชื่อผู้ใช้แทน
                  </p>
                </div>
              </div>



              {isEditing && (
                <div className="mt-6 flex justify-end space-x-4">
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      // Reset form to original values
                      if (userProfile) {
                        const username = userProfile.email?.split('@')[0] || 'user';
                        const displayName = userProfile.displayName && userProfile.displayName.trim() !== '' 
                          ? userProfile.displayName 
                          : username;
                        setProfileData({
                          displayName: displayName,
                          username: username,
                          email: userProfile.email || '',
                          phone: '',
                          bio: '',
                          location: ''
                        });
                      }
                    }}
                    disabled={saving}
                    className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="flex items-center space-x-2 px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>กำลังบันทึก...</span>
                      </>
                    ) : (
                      <>
                        <CheckIcon className="h-4 w-4" />
                        <span>บันทึก</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        );

      case 'security':
        return (
          <div className="space-y-6">
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl p-6 border border-white/30 dark:border-gray-700/30">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">ความปลอดภัย</h3>
              
              <div className="space-y-6">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-4">เปลี่ยนรหัสผ่าน</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รหัสผ่านปัจจุบัน</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          placeholder="กรอกรหัสผ่านปัจจุบัน"
                        />
                        <button
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          {showPassword ? <EyeSlashIcon className="h-6 w-6" /> : <EyeIcon className="h-6 w-6" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รหัสผ่านใหม่</label>
                      <input
                        type="password"
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        placeholder="กรอกรหัสผ่านใหม่"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ยืนยันรหัสผ่านใหม่</label>
                      <input
                        type="password"
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        placeholder="ยืนยันรหัสผ่านใหม่"
                      />
                    </div>
                    <button className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                      อัปเดตรหัสผ่าน
                    </button>
                  </div>
                </div>

                <div className="border-t dark:border-gray-600 pt-6">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-4">การเข้าสู่ระบบ</h4>
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <div className="flex items-center">
                      <ShieldCheckIcon className="h-6 w-6 text-green-600 dark:text-green-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-green-800 dark:text-green-300">บัญชีของคุณปลอดภัย</p>
                        <p className="text-xs text-green-600 dark:text-green-400">เข้าสู่ระบบครั้งล่าสุด: วันนี้ เวลา 14:30</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <DashboardLayout 
      title="ตั้งค่า" 
      subtitle="จัดการบัญชีและการตั้งค่าของคุณ"
    >
      <div className="flex flex-col xl:flex-row gap-6 lg:gap-8">
        {/* Sidebar */}
        <div className="xl:w-1/4">
          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/30 dark:border-gray-700/30 p-4 lg:p-6">
            <nav className="space-y-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 text-left rounded-xl transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-700/60 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                >
                  <tab.icon className="h-5 w-5" />
                  <span className="font-medium">{tab.name}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="xl:w-3/4">
          {renderTabContent()}
        </div>
      </div>
    </DashboardLayout>
  );
} 