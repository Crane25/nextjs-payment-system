'use client';

import React from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { BoltIcon } from '@heroicons/react/24/outline';
import { usePermission } from '../../hooks/usePermission';

export default function BotTransactions() {
  const { canViewTopup } = usePermission();

  // Permission check
  if (!canViewTopup()) {
    return (
      <DashboardLayout title="บอททำรายการ" subtitle="คุณไม่มีสิทธิ์เข้าถึงหน้านี้">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <BoltIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              ไม่มีสิทธิ์เข้าถึง
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              คุณไม่มีสิทธิ์ในการดูหน้าบอททำรายการ
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="บอททำรายการ" 
      subtitle="จัดการบอทอัตโนมัติสำหรับทำรายการ"
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-2">
          <BoltIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            บอททำรายการ
          </h2>
        </div>

        {/* Empty State */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-8">
          <div className="text-center">
            <BoltIcon className="h-24 w-24 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              หน้าบอททำรายการ
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              หน้านี้พร้อมสำหรับการพัฒนาฟีเจอร์บอททำรายการในอนาคต
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}