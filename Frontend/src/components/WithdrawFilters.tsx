import React, { memo } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface Team {
  id: string;
  name: string;
}

interface WithdrawFiltersProps {
  searchTerm: string;
  filterStatus: 'all' | 'completed' | 'pending' | 'failed';
  filterPeriod: 'all' | 'today' | 'week' | 'month' | 'custom';
  selectedTeamFilter: 'all' | string;
  startDate: string;
  endDate: string;
  itemsPerPage: number;
  teams: Team[];
  teamCounts: Array<{
    teamId: string;
    teamName: string;
    count: number;
  }>;
  totalItems: number;
  onSearchChange: (term: string) => void;
  onStatusChange: (status: 'all' | 'completed' | 'pending' | 'failed') => void;
  onPeriodChange: (period: 'all' | 'today' | 'week' | 'month' | 'custom') => void;
  onTeamChange: (teamId: 'all' | string) => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onItemsPerPageChange: (count: number) => void;
  onResetDateRange: () => void;
  onLoadData: () => void;
}

const WithdrawFilters = memo(({
  searchTerm,
  filterStatus,
  filterPeriod,
  selectedTeamFilter,
  startDate,
  endDate,
  itemsPerPage,
  teams,
  teamCounts,
  totalItems,
  onSearchChange,
  onStatusChange,
  onPeriodChange,
  onTeamChange,
  onStartDateChange,
  onEndDateChange,
  onItemsPerPageChange,
  onResetDateRange,
  onLoadData
}: WithdrawFiltersProps) => {
  return (
    <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/30 dark:border-gray-700/30 p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
        {/* Search */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="ค้นหาเว็บไซต์, ผู้ถอน, หมายเหตุ..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              แสดง:
            </label>
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[100px]"
            >
              <option value={25}>25 รายการ</option>
              <option value={50}>50 รายการ</option>
              <option value={100}>100 รายการ</option>
              <option value={200}>200 รายการ</option>
            </select>
          </div>

          {/* Team Filter */}
          {teamCounts.length > 0 && (
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                ทีม:
              </label>
              <select
                value={selectedTeamFilter}
                onChange={(e) => onTeamChange(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[150px]"
              >
                <option value="all">ทุกทีม ({totalItems})</option> 
                {teamCounts.map(({ teamId, teamName, count }) => (
                  <option key={teamId} value={teamId}>
                    {teamName} ({count})
                  </option>
                ))}
              </select>
            </div>
          )}

          <select
            value={filterStatus}
            onChange={(e) => onStatusChange(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="all">สถานะทั้งหมด</option>
            <option value="completed">สำเร็จ</option>
            <option value="pending">รอดำเนินการ</option>
            <option value="failed">ล้มเหลว</option>
          </select>

          <select
            value={filterPeriod}
            onChange={(e) => onPeriodChange(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="all">ช่วงเวลาทั้งหมด</option>
            <option value="today">วันนี้</option>
            <option value="week">7 วันที่ผ่านมา</option>
            <option value="month">30 วันที่ผ่านมา</option>
            <option value="custom">กำหนดเอง</option>
          </select>

          {/* Custom Date Range */}
          {filterPeriod === 'custom' && (
            <div className="flex items-center space-x-2 bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-orange-700 dark:text-orange-300">
                  จาก:
                </label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  onBlur={(e) => {
                    const value = e.target.value;
                    if (value && value.length >= 10) {
                      const date = value.split('T')[0];
                      const time = value.split('T')[1];
                      if (!time || time === '' || time.length < 5) {
                        onStartDateChange(`${date}T00:00`);
                      }
                    }
                  }}
                  onFocus={(e) => {
                    if (!e.target.value) {
                      const today = new Date().toISOString().split('T')[0];
                      onStartDateChange(`${today}T00:00`);
                    }
                  }}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
                <button
                  onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    onStartDateChange(`${today}T00:00`);
                  }}
                  className="px-2 py-1 text-xs bg-orange-100 hover:bg-orange-200 dark:bg-orange-800 dark:hover:bg-orange-700 text-orange-600 dark:text-orange-300 rounded"
                >
                  00:00
                </button>
              </div>
              
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-orange-700 dark:text-orange-300">
                  ถึง:
                </label>
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  onBlur={(e) => {
                    const value = e.target.value;
                    if (value && value.length >= 10) {
                      const date = value.split('T')[0];
                      const time = value.split('T')[1];
                      if (!time || time === '' || time.length < 5) {
                        onEndDateChange(`${date}T23:59`);
                      }
                    }
                  }}
                  onFocus={(e) => {
                    if (!e.target.value) {
                      const today = new Date().toISOString().split('T')[0];
                      onEndDateChange(`${today}T23:59`);
                    }
                  }}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
                <button
                  onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    onEndDateChange(`${today}T23:59`);
                  }}
                  className="px-2 py-1 text-xs bg-orange-100 hover:bg-orange-200 dark:bg-orange-800 dark:hover:bg-orange-700 text-orange-600 dark:text-orange-300 rounded"
                >
                  23:59
                </button>
              </div>
              
              <button
                onClick={onResetDateRange}
                className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 rounded-lg transition-colors"
              >
                ล้าง
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

WithdrawFilters.displayName = 'WithdrawFilters';

export default WithdrawFilters; 