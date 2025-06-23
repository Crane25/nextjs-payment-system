import React, { memo } from 'react';
import { 
  ArrowTrendingDownIcon,
  UserGroupIcon,
  UserIcon
} from '@heroicons/react/24/outline';

interface WithdrawRecord {
  id: string;
  websiteId: string;
  websiteName: string;
  amount: number;
  balanceAfter?: number;
  timestamp: string;
  status: 'completed' | 'pending' | 'failed';
  withdrawBy?: string;
  withdrawByUid?: string;
  withdrawByEmail?: string;
  withdrawByUsername?: string;
  teamId?: string;
  teamName?: string;
  note?: string;
}

interface Team {
  id: string;
  name: string;
}

interface WithdrawTableProps {
  data: WithdrawRecord[];
  loading: boolean;
  teamsLoading: boolean;
  teams: Team[];
  lastUpdated: Date;
  isConnected: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}

const WithdrawTable = memo(({
  data,
  loading,
  teamsLoading,
  teams,
  lastUpdated,
  isConnected,
  onRefresh,
  refreshing
}: WithdrawTableProps) => {
  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'สำเร็จ';
      case 'pending':
        return 'รอดำเนินการ';
      case 'failed':
        return 'ล้มเหลว';
      default:
        return 'ไม่ทราบ';
    }
  };

  const getTeamColor = (teamId: string) => {
    const colors = [
      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
      'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    ];
    
    if (!teamId || teamId === 'no-team') {
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
    
    const index = teamId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  return (
    <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/30 dark:border-gray-700/30 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
            <ArrowTrendingDownIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">ประวัติการถอนเงิน</h3>
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                รายการธุรกรรมการถอนเงินทุกทีม
              </p>
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-orange-500 animate-pulse' : 'bg-gray-400'}`}></div>
                <span className={`text-xs ${isConnected ? 'text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  {isConnected ? 'อัพเดทแบบ Real-time' : 'ออฟไลน์'}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            อัพเดทล่าสุด: {lastUpdated.toLocaleTimeString('th-TH')}
          </div>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/40 text-orange-600 dark:text-orange-400 rounded-lg transition-colors disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            รีเฟรช
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">วันที่/เวลา</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">เว็บไซต์</th>
              {teams.length > 1 && (
                <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">ทีม</th>
              )}
              <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">ผู้ถอนเงิน</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-900 dark:text-white">จำนวนเงิน</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">หมายเหตุ</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-900 dark:text-white">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {(loading || teamsLoading) ? (
              <tr>
                <td colSpan={teams.length > 1 ? 7 : 6} className="py-8 text-center">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                    <span className="ml-2 text-gray-500 dark:text-gray-400">
                      {teamsLoading ? 'กำลังโหลดข้อมูลทีม...' : 'กำลังโหลดประวัติการถอนเงิน...'}
                    </span>
                  </div>
                </td>
              </tr>
            ) : teams.length === 0 && !teamsLoading ? (
              <tr>
                <td colSpan={teams.length > 1 ? 7 : 6} className="py-8 text-center">
                  <div className="text-gray-500 dark:text-gray-400">
                    <UserGroupIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>ไม่พบทีมที่เข้าร่วม</p>
                    <p className="text-sm">คุณยังไม่ได้เป็นสมาชิกของทีมใดๆ</p>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={teams.length > 1 ? 7 : 6} className="py-8 text-center">
                  <div className="text-gray-500 dark:text-gray-400">
                    <ArrowTrendingDownIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>ไม่พบประวัติการถอนเงิน</p>
                    <p className="text-sm">ยังไม่มีการถอนเงินในระบบ</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((record) => (
                <tr key={record.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200">
                  <td className="py-4 px-4">
                    <div className="text-sm text-gray-900 dark:text-white font-medium">
                      {formatDate(record.timestamp)}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="font-semibold text-gray-900 dark:text-white">{record.websiteName}</div>
                  </td>
                  {teams.length > 1 && (
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTeamColor(record.teamId || 'no-team')}`}>
                        <UserGroupIcon className="h-3 w-3 mr-1" />
                        {record.teamName || 'ไม่ระบุทีม'}
                      </span>
                    </td>
                  )}
                  <td className="py-4 px-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">
                          {(record.withdrawBy || 'ผู้ใช้').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {record.withdrawBy || 'ผู้ใช้ไม่ระบุ'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          @{record.withdrawByUsername || record.withdrawByEmail?.split('@')[0] || (record.withdrawByUid ? record.withdrawByUid.substring(0, 8) : 'user')}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <div className="space-y-1">
                      <div className="font-bold text-red-600 dark:text-red-400">
                        -฿{record.amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {record.balanceAfter !== undefined && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          คงเหลือ: ฿{record.balanceAfter.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    {record.note ? (
                      <div className="max-w-xs">
                        <div className="flex items-start space-x-2">
                          <svg className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <div className="text-sm text-gray-700 dark:text-gray-300 break-words">
                            {record.note.length > 50 ? (
                              <div className="relative group">
                                <span className="cursor-help">
                                  {record.note.substring(0, 50)}...
                                </span>
                                <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-normal max-w-sm z-20 shadow-lg">
                                  <div className="font-medium mb-1">หมายเหตุเต็ม:</div>
                                  <div className="text-gray-200 dark:text-gray-300">
                                    {record.note}
                                  </div>
                                  <div className="absolute top-full left-4 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                                </div>
                              </div>
                            ) : (
                              record.note
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 text-sm italic">-</span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(record.status)}`}>
                      {getStatusText(record.status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {(loading || refreshing) && (
        <div className="mt-4 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-500"></div>
            {refreshing ? 'กำลังรีเฟรชข้อมูล...' : 'กำลังโหลดหน้าถัดไป...'}
          </div>
        </div>
      )}
    </div>
  );
});

WithdrawTable.displayName = 'WithdrawTable';

export default WithdrawTable; 