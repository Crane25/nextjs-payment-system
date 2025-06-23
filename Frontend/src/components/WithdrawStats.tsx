import React, { memo } from 'react';
import { 
  ArrowTrendingDownIcon,
  CalendarDaysIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

interface WithdrawStatsProps {
  stats: {
    totalAmount: number;
    totalTransactions: number;
    completedTransactions: number;
    todayAmount: number;
    todayTransactions: number;
    averageAmount: number;
    isPartialStats: boolean;
  };
  loading: boolean;
}

const WithdrawStats = memo(({ stats, loading }: WithdrawStatsProps) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="bg-gradient-to-r from-gray-200 to-gray-300 rounded-2xl p-6 animate-pulse">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-4 bg-gray-300 rounded w-24 mb-2"></div>
                <div className="h-8 bg-gray-300 rounded w-32"></div>
              </div>
              <div className="h-8 w-8 bg-gray-300 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div className="bg-gradient-to-r from-red-500 to-pink-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-red-100 text-sm font-medium">ถอนเงินทั้งหมด</p>
            <p className="text-2xl font-bold">
              ฿{stats.totalAmount.toLocaleString('th-TH', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })}
            </p>
          </div>
          <ArrowTrendingDownIcon className="h-8 w-8 text-red-200" />
        </div>
      </div>

      <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-orange-100 text-sm font-medium">วันนี้</p>
            <p className="text-2xl font-bold">
              ฿{stats.todayAmount.toLocaleString('th-TH', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })}
            </p>
          </div>
          <CalendarDaysIcon className="h-8 w-8 text-orange-200" />
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-500 to-cyan-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-sm font-medium">รายการทั้งหมด</p>
            <p className="text-2xl font-bold">{stats.totalTransactions.toLocaleString()}</p>
          </div>
          <ClockIcon className="h-8 w-8 text-blue-200" />
        </div>
      </div>

      <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-purple-100 text-sm font-medium">รายการวันนี้</p>
            <p className="text-2xl font-bold">{stats.todayTransactions.toLocaleString()}</p>
          </div>
          <svg className="h-8 w-8 text-purple-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
      </div>
    </div>
  );
});

WithdrawStats.displayName = 'WithdrawStats';

export default WithdrawStats; 