'use client';

import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfile } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import { Bars3Icon, MoonIcon, SunIcon } from '@heroicons/react/24/outline';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ 
  children, 
  title = 'แดชบอร์ด',
  subtitle = 'ภาพรวมการเงินของคุณ'
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading } = useAuth();
  const { userProfile } = useUserProfile();
  const { isDarkMode, toggleTheme } = useTheme();
  const router = useRouter();

  // Redirect to login if not authenticated
  React.useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Top bar - Fixed */}
        <div className="flex-shrink-0 bg-gradient-to-r from-white/95 via-blue-50/90 to-purple-50/95 dark:from-gray-800/95 dark:via-gray-700/90 dark:to-gray-800/95 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-600/40 shadow-lg relative z-10">
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl hover:bg-white/60 dark:hover:bg-gray-700/60 transition-all duration-300 group"
              >
                <Bars3Icon className="h-6 w-6 text-gray-600 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:scale-110 transition-all duration-300" />
              </button>
              
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent">{title}</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{subtitle}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Theme Toggle Button - แทนที่กระดิ่ง */}
              <button
                onClick={toggleTheme}
                className="group relative p-2 rounded-xl hover:bg-white/60 dark:hover:bg-gray-700/60 transition-all duration-300 ring-1 ring-blue-200/50 dark:ring-gray-600/50 hover:ring-blue-400/60 dark:hover:ring-blue-400/60 hover:shadow-lg transform hover:scale-110"
                title={isDarkMode ? 'เปลี่ยนเป็นโหมดกลางวัน' : 'เปลี่ยนเป็นโหมดกลางคืน'}
              >
                {/* Background gradient */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 dark:from-blue-400/10 dark:via-purple-400/10 dark:to-pink-400/10 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                
                {/* Icon */}
                {isDarkMode ? (
                  <SunIcon className="relative h-6 w-6 text-yellow-600 dark:text-yellow-400 group-hover:text-yellow-500 dark:group-hover:text-yellow-300 group-hover:rotate-12 transition-all duration-300" />
                ) : (
                  <MoonIcon className="relative h-6 w-6 text-blue-600 dark:text-blue-400 group-hover:text-blue-500 dark:group-hover:text-blue-300 group-hover:rotate-12 transition-all duration-300" />
                )}
                
                {/* Subtle glow effect */}
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-400/20 via-purple-400/20 to-pink-400/20 blur-sm opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                
                {/* Active indicator */}
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full animate-pulse ring-2 ring-white dark:ring-gray-800 opacity-80"></div>
              </button>
              
              <div className="flex items-center space-x-3 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/30 dark:border-gray-700/30 shadow-md hover:shadow-lg transition-all duration-300">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    {userProfile?.displayName || user.displayName || 'ผู้ใช้'}
                  </p>
                  <div className="flex items-center justify-end space-x-1">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">ออนไลน์</p>
                  </div>
                </div>
                <div className="relative">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white/50 dark:ring-gray-700/50 hover:scale-110 transition-all duration-300">
                    <span className="text-white text-sm font-bold">
                      {(userProfile?.displayName || user.displayName)?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border-2 border-white dark:border-gray-800 rounded-full animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Page content - Scrollable */}
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 sm:px-6 lg:px-8 py-4 lg:py-8">
            {children}
          </div>
        </main>
      </div>
      

    </div>
  );
};

export default DashboardLayout; 