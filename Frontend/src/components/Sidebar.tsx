'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../hooks/usePermission';
import {
  HomeIcon,
  CogIcon,
  UserIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
  BellIcon,
  UserGroupIcon,
  ShieldCheckIcon,
  BoltIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';
import {
  HomeIcon as HomeIconSolid,
  CogIcon as CogIconSolid,
  UserIcon as UserIconSolid,
  DocumentTextIcon as DocumentTextIconSolid,
  BellIcon as BellIconSolid,
  UserGroupIcon as UserGroupIconSolid,
  ShieldCheckIcon as ShieldCheckIconSolid,
  ArrowDownTrayIcon as ArrowDownTrayIconSolid
} from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen }) => {
  const { user, logout } = useAuth();
  const { canViewTeams, canAccessAdminPanel, canViewWebsites, canViewTopup, isUser } = usePermission();
  const pathname = usePathname();

  // Regular user navigation items - General section
  const generalNavigation = [
    // แดชบอร์ดสำหรับผู้ใช้ที่มีสิทธิ์ดูเว็บไซต์
    ...(canViewWebsites() ? [{
      name: 'แดชบอร์ด',
      href: '/dashboard',
      icon: HomeIcon,
      iconSolid: HomeIconSolid,
      current: pathname === '/dashboard'
    }] : []),
    // ประวัติเติมเงินสำหรับผู้ใช้ที่มีสิทธิ์ดู topup
    ...(canViewTopup() ? [{
      name: 'ประวัติเติมเงิน',
      href: '/topup-history',
      icon: DocumentTextIcon,
      iconSolid: DocumentTextIconSolid,
      current: pathname === '/topup-history'
    }] : []),
    // บอทกำลังทำรายการ - สำหรับผู้ใช้ที่มีสิทธิ์ดู topup
    ...(canViewTopup() ? [{
      name: 'บอทกำลังทำรายการ',
      href: '/bot-transactions',
      icon: BoltIcon,
      iconSolid: BoltIcon,
      current: pathname === '/bot-transactions'
    }] : []),
    // บอททำรายการ (ทั้งหมด) - สำหรับผู้ใช้ที่มีสิทธิ์ดู topup
    ...(canViewTopup() ? [{
      name: 'ประวัติบอททำรายการ',
      href: '/all-transactions',
      icon: BoltIcon,
      iconSolid: BoltIcon,
      current: pathname === '/all-transactions'
    }] : []),
    // จัดการทีมสำหรับผู้ใช้ที่มีสิทธิ์
    ...(canViewTeams() ? [{
      name: 'จัดการทีม',
      href: '/team',
      icon: UserGroupIcon,
      iconSolid: UserGroupIconSolid,
      current: pathname === '/team'
    }] : []),
  ];

  // Admin navigation items
  const adminNavigation = [
    // จัดการสิทธิ์สำหรับ admin เท่านั้น
    ...(canAccessAdminPanel() ? [{
      name: 'จัดการสิทธิ์',
      href: '/admin',
      icon: ShieldCheckIcon,
      iconSolid: ShieldCheckIconSolid,
      current: pathname === '/admin'
    }] : []),
    // ประวัติการถอนเงินสำหรับ admin เท่านั้น
    ...(canAccessAdminPanel() ? [{
      name: 'ประวัติการถอนเงิน',
      href: '/withdraw-history',
      icon: ArrowDownTrayIcon,
      iconSolid: ArrowDownTrayIconSolid,
      current: pathname === '/withdraw-history'
    }] : []),
    // จัดการทีมทั้งหมดสำหรับ admin เท่านั้น
    ...(canAccessAdminPanel() ? [{
      name: 'จัดการทีมทั้งหมด',
      href: '/admin-teams',
      icon: UserGroupIcon,
      iconSolid: UserGroupIconSolid,
      current: pathname === '/admin-teams'
    }] : []),
    // Audit Logs สำหรับ admin เท่านั้น
    ...(canAccessAdminPanel() ? [{
      name: 'Audit Logs',
      href: '/audit-logs',
      icon: DocumentTextIcon,
      iconSolid: DocumentTextIconSolid,
      current: pathname === '/audit-logs'
    }] : []),
    // System Logs สำหรับ admin เท่านั้น
    ...(canAccessAdminPanel() ? [{
      name: 'System Logs',
      href: '/logs',
      icon: DocumentTextIcon,
      iconSolid: DocumentTextIconSolid,
      current: pathname === '/logs'
    }] : []),
  ];

  // Settings navigation (always visible)
  const settingsNavigation = [
    {
      name: 'ตั้งค่า',
      href: '/settings',
      icon: CogIcon,
      iconSolid: CogIconSolid,
      current: pathname === '/settings'
    }
  ];

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('ออกจากระบบสำเร็จ');
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการออกจากระบบ');
    }
  };

  // Render navigation item
  const renderNavItem = (item: any, index: number) => {
    const IconComponent = item.current ? item.iconSolid : item.icon;
    return (
      <Link
        key={item.name}
        href={item.href}
        onClick={() => setIsOpen(false)}
        className={`group relative flex items-center px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-300 transform hover:scale-[1.02] ${
          item.current
            ? 'bg-gradient-to-r from-blue-500 via-purple-600 to-pink-500 text-white shadow-xl ring-2 ring-blue-200/50 dark:ring-blue-400/30'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gradient-to-r hover:from-blue-50 hover:via-purple-50 hover:to-pink-50 dark:hover:from-blue-900/30 dark:hover:via-purple-900/30 dark:hover:to-pink-900/30 hover:text-blue-600 dark:hover:text-blue-400 hover:shadow-md'
        }`}
        style={{
          animationDelay: `${index * 50}ms`
        }}
      >
        <div className={`absolute inset-0 rounded-xl transition-all duration-300 ${
          item.current 
            ? 'bg-gradient-to-r from-blue-500/20 via-purple-600/20 to-pink-500/20' 
            : 'bg-gradient-to-r from-transparent to-transparent group-hover:from-blue-500/5 group-hover:to-purple-500/5'
        }`}></div>
        
        <IconComponent
          className={`relative mr-3 h-5 w-5 transition-all duration-300 ${
            item.current 
              ? 'text-white transform scale-110' 
              : 'text-gray-400 dark:text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:scale-110 group-hover:rotate-3'
          }`}
        />
        <span className="relative truncate font-bold">{item.name}</span>
        
        {item.current && (
          <div className="relative ml-auto flex items-center space-x-1">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <div className="w-1 h-1 bg-white/70 rounded-full animate-ping" />
          </div>
        )}
        
        {!item.current && (
          <div className="relative ml-auto w-0 group-hover:w-2 h-2 bg-blue-400 rounded-full transition-all duration-300 opacity-0 group-hover:opacity-100"></div>
        )}
      </Link>
    );
  };

  // Render separator
  const renderSeparator = (title: string) => (
    <div className="relative flex items-center my-4 px-4">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300/60 to-transparent dark:via-gray-600/60"></div>
      <div className="px-3">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 bg-white/90 dark:bg-gray-800/90 px-2 py-1 rounded-full border border-gray-200/60 dark:border-gray-600/60">
          {title}
        </span>
      </div>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300/60 to-transparent dark:via-gray-600/60"></div>
    </div>
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-gradient-to-b from-white/95 via-white/90 to-white/95 dark:from-gray-900/95 dark:via-gray-800/90 dark:to-gray-900/95 backdrop-blur-xl border-r border-gray-200/40 dark:border-gray-600/30 shadow-2xl transform transition-all duration-500 ease-out lg:relative lg:translate-x-0 lg:z-auto lg:shadow-xl ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-screen">
          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto">
            {/* Header */}
            <div className="relative border-b border-gray-200/50 dark:border-gray-600/40 flex-shrink-0 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 via-purple-50/30 to-pink-50/50 dark:from-gray-800/30 dark:via-gray-700/20 dark:to-gray-800/30"></div>
              <div className="relative flex items-center justify-between px-4 h-16">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 rounded-xl flex items-center justify-center shadow-lg transform hover:scale-110 transition-all duration-300">
                      <CurrencyDollarIcon className="h-6 w-6 text-white" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 dark:bg-green-500/70 rounded-full animate-pulse"></div>
                  </div>
                  <div>
                    <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-300 dark:via-purple-300 dark:to-pink-300 bg-clip-text text-transparent">
                      GGGGG
                    </h1>
                    <p className="text-xs text-gray-500 dark:text-gray-500 font-medium">Money Management</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="lg:hidden p-2 rounded-xl hover:bg-white/60 dark:hover:bg-gray-700/40 transition-all duration-300 group"
                >
                  <XMarkIcon className="h-5 w-5 text-gray-500 dark:text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300 group-hover:rotate-90 transition-all duration-300" />
                </button>
              </div>
            </div>

            {/* Navigation */}
            <nav className="p-3 space-y-2">
              {/* General Navigation */}
              {generalNavigation.length > 0 && (
                <>
                  {renderSeparator('ทั่วไป')}
                  {generalNavigation.map((item, index) => renderNavItem(item, index))}
                </>
              )}
              
                             {/* Admin Separator & Navigation */}
               {adminNavigation.length > 0 && (
                 <>
                   {renderSeparator('แอดมิน')}
                  {adminNavigation.map((item, index) => renderNavItem(item, generalNavigation.length + index))}
                </>
              )}
              
                             {/* Settings Separator & Navigation */}
               {(generalNavigation.length > 0 || adminNavigation.length > 0) && renderSeparator('ตั้งค่า')}
              {settingsNavigation.map((item, index) => renderNavItem(item, generalNavigation.length + adminNavigation.length + index))}
            </nav>
          </div>

          {/* Footer - Fixed at bottom */}
          <div className="relative border-t border-gray-200/50 dark:border-gray-600/40 flex-shrink-0 bg-gradient-to-r from-gray-50/80 via-blue-50/40 to-purple-50/80 dark:from-gray-800/60 dark:via-gray-700/40 dark:to-gray-800/60 backdrop-blur-sm overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5 dark:from-blue-500/3 dark:via-purple-500/3 dark:to-pink-500/3"></div>
            
            {/* Logout Button */}
            <div className="relative p-3 border-b border-gray-200/50 dark:border-gray-600/40">
              <button
                onClick={handleLogout}
                className="group relative flex items-center w-full px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-300 rounded-xl hover:text-white transition-all duration-300 border border-red-200/50 dark:border-red-400/20 hover:border-red-400 dark:hover:border-red-300 bg-gradient-to-r from-red-50 to-pink-50 hover:from-red-500 hover:to-pink-500 dark:from-red-900/20 dark:to-pink-900/20 dark:hover:from-red-500/80 dark:hover:to-pink-500/80 shadow-md hover:shadow-lg transform hover:scale-[1.02] overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                <ArrowRightOnRectangleIcon className="relative mr-3 h-5 w-5 text-red-500 dark:text-red-300 group-hover:text-white transition-all duration-300 group-hover:rotate-12" />
                <span className="relative font-bold">ออกจากระบบ</span>
                <div className="relative ml-auto w-2 h-2 bg-red-400 dark:bg-red-300 rounded-full group-hover:bg-white animate-pulse"></div>
              </button>
            </div>
            
            <div className="relative p-3 text-center">
              <div className="flex items-center justify-center space-x-2 mb-1">
                <div className="w-1.5 h-1.5 bg-green-400 dark:bg-green-500/60 rounded-full animate-pulse"></div>
                <p className="text-xs font-semibold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-300 dark:to-purple-300 bg-clip-text text-transparent">
                  GGGGG
                </p>
                <div className="w-1.5 h-1.5 bg-blue-400 dark:bg-blue-500/60 rounded-full animate-pulse"></div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-500 font-medium">
                v1.0.0 © 2024 • Made with ❤️
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar; 