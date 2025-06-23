'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { 
  ArrowTrendingDownIcon,
  CalendarDaysIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  ClockIcon,
  UserIcon,
  XCircleIcon,
  UserGroupIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import { useUserProfile } from '../../contexts/UserContext';
import { usePermission } from '../../hooks/usePermission';
import { useMultiTeam } from '../../hooks/useMultiTeam';
import { collection, getDocs, onSnapshot, query, orderBy, limit, startAfter, where, Query, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import toast from 'react-hot-toast';

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

export default function WithdrawHistory() {
  const { user } = useAuth();
  const { userProfile } = useUserProfile();
  const { canViewTopup } = usePermission();
  const { teams, loading: teamsLoading, error: teamsError } = useMultiTeam();
  const [withdrawHistory, setWithdrawHistory] = useState<WithdrawRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<'all' | string>('all');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isConnected, setIsConnected] = useState(true);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  
  // Use refs for values that shouldn't trigger re-renders
  const lastDocRef = useRef<any>(null);
  const isLoadingRef = useRef(false);
  const paginationCache = useRef<Map<number, WithdrawRecord[]>>(new Map());
  const cursorCache = useRef<Map<number, any>>(new Map());
  
  // Summary statistics
  const [allTimeStats, setAllTimeStats] = useState({
    totalAmount: 0,
    totalTransactions: 0,
    completedTransactions: 0,
    todayAmount: 0,
    todayTransactions: 0
  });

  // Loading function
  const loadWithdrawHistory = useCallback(async (forceRefresh = false, page = 1) => {
    if (!user || !userProfile || teamsLoading) {
      return;
    }

    if (isLoadingRef.current && !forceRefresh) {
      return;
    }

    if (!forceRefresh && paginationCache.current.has(page)) {
      const cachedData = paginationCache.current.get(page);
      if (cachedData) {
        setWithdrawHistory(cachedData);
        setCurrentPage(page);
        setLoading(false);
        return;
      }
    }

    try {
      isLoadingRef.current = true;
      
      if (forceRefresh) {
        setRefreshing(true);
        setCurrentPage(1);
        lastDocRef.current = null;
        paginationCache.current.clear();
        cursorCache.current.clear();
      } else {
        setLoading(true);
      }

      let withdrawQuery = query(
        collection(db, 'withdrawHistory'),
        orderBy('timestamp', 'desc'),
        limit(itemsPerPage)
      );

      if (page > 1) {
        const prevPageCursor = cursorCache.current.get(page - 1);
        if (prevPageCursor) {
          withdrawQuery = query(
            collection(db, 'withdrawHistory'),
            orderBy('timestamp', 'desc'),
            startAfter(prevPageCursor),
            limit(itemsPerPage)
          );
        }
      }

      const [withdrawSnapshot, teamsSnapshot, usersSnapshot, allStatsSnapshot] = await Promise.all([
        getDocs(withdrawQuery),
        getDocs(collection(db, 'teams')),
        getDocs(collection(db, 'users')),
        page === 1 || forceRefresh ? getDocs(query(
          collection(db, 'withdrawHistory'),
          orderBy('timestamp', 'desc')
        )) : Promise.resolve(null)
      ]);

      const teamsMap = new Map();
      teamsSnapshot.docs.forEach(doc => {
        teamsMap.set(doc.id, doc.data());
      });

      const usersMap = new Map();
      usersSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        usersMap.set(doc.id, userData);
      });

      const userTeamIds = teams.map(team => team.id);
      const allWithdrawRecords = withdrawSnapshot.docs.map(doc => {
        const data = doc.data();
        
        let teamName = 'ไม่ระบุทีม';
        if (data.teamId && teamsMap.has(data.teamId)) {
          const teamData = teamsMap.get(data.teamId);
          teamName = teamData.name || `ทีม ${data.teamId.substring(0, 8)}`;
        } else if (data.teamId) {
          teamName = `ทีม ${data.teamId.substring(0, 8)}`;
        }

        let withdrawByEmail = '';
        let withdrawByUsername = '';
        if (data.withdrawByUid && usersMap.has(data.withdrawByUid)) {
          const userData = usersMap.get(data.withdrawByUid);
          withdrawByEmail = userData.email || '';
          withdrawByUsername = userData.username || userData.email?.split('@')[0] || '';
        }
        
        return {
          id: doc.id,
          ...data,
          teamName,
          withdrawByEmail,
          withdrawByUsername
        } as WithdrawRecord;
      });

      let filteredRecords: WithdrawRecord[];
      
      if (userProfile.role === 'admin') {
        filteredRecords = allWithdrawRecords.filter(record => 
          record.teamId && userTeamIds.includes(record.teamId)
        );
      } else if (userProfile.role === 'manager') {
        filteredRecords = allWithdrawRecords.filter(record => 
          record.teamId && userTeamIds.includes(record.teamId)
        );
      } else {
        filteredRecords = allWithdrawRecords.filter(record => 
          record.teamId && userTeamIds.includes(record.teamId)
        );
      }
      
      setHasMore(withdrawSnapshot.docs.length === itemsPerPage);
      if (withdrawSnapshot.docs.length > 0) {
        const lastVisible = withdrawSnapshot.docs[withdrawSnapshot.docs.length - 1];
        cursorCache.current.set(page, lastVisible);
      }

      paginationCache.current.set(page, filteredRecords);
      setWithdrawHistory(filteredRecords);
      setCurrentPage(page);

      if (allStatsSnapshot && (page === 1 || forceRefresh)) {
        const allRecords = allStatsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as WithdrawRecord[];

        const userAccessibleRecords = allRecords.filter(record => 
          record.teamId && userTeamIds.includes(record.teamId)
        );

        const totalAmount = userAccessibleRecords.reduce((sum, record) => sum + (record.amount || 0), 0);
        const completedRecords = userAccessibleRecords.filter(record => record.status === 'completed');
        const completedAmount = completedRecords.reduce((sum, record) => sum + (record.amount || 0), 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayRecords = userAccessibleRecords.filter(record => {
          const recordDate = new Date(record.timestamp);
          return recordDate >= today;
        });
        const todayAmount = todayRecords.reduce((sum, record) => sum + (record.amount || 0), 0);

        setAllTimeStats({
          totalAmount: completedAmount,
          totalTransactions: userAccessibleRecords.length,
          completedTransactions: completedRecords.length,
          todayAmount: todayAmount,
          todayTransactions: todayRecords.length
        });

        setTotalItems(userAccessibleRecords.length);
        setTotalPages(Math.ceil(userAccessibleRecords.length / itemsPerPage));
      }

      setLastUpdated(new Date());
      
    } catch (error) {
      console.error('Error loading withdraw history:', error);
      toast.error('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
      setRefreshing(false);
      isLoadingRef.current = false;
      setLastUpdated(new Date()); // อัพเดทเวลาหลังจากโหลดเสร็จ
    }
  }, [user, userProfile, teamsLoading, teams, itemsPerPage]);

  // Utility functions
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      loadWithdrawHistory(false, page);
    }
  };

  const handleRefresh = () => {
    loadWithdrawHistory(true, 1);
  };

  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const showPages = 5;
    
    if (totalPages <= showPages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  const getFilteredHistory = () => {
    let filtered = [...withdrawHistory]; // สร้าง copy เพื่อไม่ให้ mutate original array

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(record =>
        record.websiteName?.toLowerCase().includes(searchLower) ||
        record.withdrawBy?.toLowerCase().includes(searchLower) ||
        record.note?.toLowerCase().includes(searchLower) ||
        record.teamName?.toLowerCase().includes(searchLower)
      );
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(record => record.status === filterStatus);
    }

    if (filterPeriod !== 'all') {
      const now = new Date();
      const filterDate = new Date();
      
      switch (filterPeriod) {
        case 'today':
          filterDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          filterDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          filterDate.setDate(now.getDate() - 30);
          break;
      }
      
      filtered = filtered.filter(record => new Date(record.timestamp) >= filterDate);
    }

    // เรียงลำดับตาม timestamp ล่าสุดก่อน (real-time sorting)
    return filtered.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateB - dateA; // เรียงจากล่าสุดไปเก่าสุด
    });
  };

  const getHistoryByTeam = () => {
    const filtered = getFilteredHistory();
    
    if (selectedTeamFilter === 'all') {
      return filtered;
    }
    
    return filtered.filter(record => record.teamId === selectedTeamFilter);
  };

  const getTeamCounts = () => {
    const teamCounts: { [key: string]: number } = {};
    
    withdrawHistory.forEach(record => {
      const teamId = record.teamId || 'no-team';
      teamCounts[teamId] = (teamCounts[teamId] || 0) + 1;
    });
    
    return teams.map(team => ({
      teamId: team.id,
      teamName: team.name,
      count: teamCounts[team.id] || 0
    }));
  };

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

  // Effects
  useEffect(() => {
    if (user && userProfile && !teamsLoading) {
      loadWithdrawHistory(true, 1);
    }
  }, [user?.uid, userProfile?.role, teamsLoading, loadWithdrawHistory]);

  // Real-time listener for new withdraw records
  useEffect(() => {
    if (!user || !userProfile || teamsLoading) return;

    let unsubscribe: (() => void) | null = null;
    let isInitialLoad = true;

    // Set up real-time listener for withdrawHistory collection
    unsubscribe = onSnapshot(
      collection(db, 'withdrawHistory'), 
      (snapshot) => {
        setIsConnected(true);
        // Skip initial load to avoid duplicate data
        if (isInitialLoad) {
          isInitialLoad = false;
          return;
        }

        // Check for new records only
        const newRecords = snapshot.docChanges().filter(change => change.type === 'added');
        
        if (newRecords.length > 0) {
          // Check if any new records are relevant to current user
          const userTeamIds = teams.map(team => team.id);
          const relevantNewRecords = newRecords.filter(change => {
            const data = change.doc.data();
            
            if (userProfile.role === 'admin') {
              return data.teamId && userTeamIds.includes(data.teamId);
            }
            
            return data.teamId && userTeamIds.includes(data.teamId);
          });

          if (relevantNewRecords.length > 0) {
            // Reload data to get the new records
            loadWithdrawHistory(true, 1);
            
            // Show notification
            toast.success(
              `มีรายการถอนเงินใหม่ ${relevantNewRecords.length} รายการ`,
              {
                duration: 4000,
                position: 'top-right',
              }
            );
          }
        }

        // Also check for updates to existing records
        const updatedRecords = snapshot.docChanges().filter(change => change.type === 'modified');
        if (updatedRecords.length > 0) {
          const userTeamIds = teams.map(team => team.id);
          const relevantUpdatedRecords = updatedRecords.filter(change => {
            const data = change.doc.data();
            return data.teamId && userTeamIds.includes(data.teamId);
          });

          if (relevantUpdatedRecords.length > 0) {
            // Reload data to get the updated records
            loadWithdrawHistory(true, currentPage);
            setLastUpdated(new Date());
          }
        }
      },
      (error) => {
        console.error('Real-time listener error:', error);
        setIsConnected(false);
        toast.error('การเชื่อมต่อ Real-time ขัดข้อง');
      }
    );

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user, userProfile, teamsLoading, teams, loadWithdrawHistory, currentPage]);

  // Auto refresh every 30 seconds
  useEffect(() => {
    if (!user || !userProfile || teamsLoading) return;

    const interval = setInterval(() => {
      if (!loading && !refreshing) {
        setLastUpdated(new Date());
        // Silently refresh data without showing loading state
        loadWithdrawHistory(false, currentPage);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [user, userProfile, teamsLoading, loading, refreshing, loadWithdrawHistory, currentPage]);

  // Check permissions
  if (!canViewTopup()) {
    return (
      <DashboardLayout title="ประวัติถอนเงิน" subtitle="คุณไม่มีสิทธิ์เข้าถึงหน้านี้">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <XCircleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              ไม่มีสิทธิ์เข้าถึง
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              คุณไม่มีสิทธิ์ในการดูประวัติถอนเงิน
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="ประวัติถอนเงิน" 
      subtitle="ดูประวัติการถอนเงินทั้งหมด"
    >
      <div className="space-y-6">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-gradient-to-r from-red-500 to-pink-600 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-100 text-sm font-medium">ถอนเงินทั้งหมด</p>
                <p className="text-2xl font-bold">
                  ฿{allTimeStats.totalAmount.toLocaleString('th-TH', { 
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
                  ฿{allTimeStats.todayAmount.toLocaleString('th-TH', { 
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
                <p className="text-2xl font-bold">{allTimeStats.totalTransactions.toLocaleString()}</p>
              </div>
              <ClockIcon className="h-8 w-8 text-blue-200" />
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">รายการวันนี้</p>
                <p className="text-2xl font-bold">{allTimeStats.todayTransactions.toLocaleString()}</p>
              </div>
              <svg className="h-8 w-8 text-purple-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Filters */}
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
                  onChange={(e) => setSearchTerm(e.target.value)}
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
                  onChange={(e) => {
                    const newItemsPerPage = parseInt(e.target.value);
                    setItemsPerPage(newItemsPerPage);
                    setCurrentPage(1);
                    paginationCache.current.clear();
                    cursorCache.current.clear();
                    loadWithdrawHistory(true, 1);
                  }}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[100px]"
                >
                  <option value={25}>25 รายการ</option>
                  <option value={50}>50 รายการ</option>
                  <option value={100}>100 รายการ</option>
                  <option value={200}>200 รายการ</option>
                </select>
              </div>

              {/* Team Filter */}
              {getTeamCounts().length > 0 && (
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    ทีม:
                  </label>
                  <select
                    value={selectedTeamFilter}
                    onChange={(e) => setSelectedTeamFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[150px]"
                  >
                    <option value="all">ทุกทีม ({withdrawHistory.length})</option> 
                    {getTeamCounts().map(({ teamId, teamName, count }) => (
                      <option key={teamId} value={teamId}>
                        {teamName} ({count})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="all">สถานะทั้งหมด</option>
                <option value="completed">สำเร็จ</option>
                <option value="pending">รอดำเนินการ</option>
                <option value="failed">ล้มเหลว</option>
              </select>

              <select
                value={filterPeriod}
                onChange={(e) => setFilterPeriod(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="all">ช่วงเวลาทั้งหมด</option>
                <option value="today">วันนี้</option>
                <option value="week">7 วันที่ผ่านมา</option>
                <option value="month">30 วันที่ผ่านมา</option>
              </select>
            </div>
          </div>
        </div>

        {/* History Table */}
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
                    {selectedTeamFilter === 'all' 
                      ? 'รายการธุรกรรมการถอนเงินทุกทีม' 
                      : `รายการธุรกรรมการถอนเงิน: ${getTeamCounts().find(t => t.teamId === selectedTeamFilter)?.teamName || 'ทีมที่เลือก'}`
                    }
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
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/40 text-orange-600 dark:text-orange-400 rounded-lg transition-colors disabled:opacity-50"
              >
                <ArrowPathIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
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
                ) : getHistoryByTeam().length === 0 ? (
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
                  getHistoryByTeam().map((record) => (
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

          {/* Advanced Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                แสดงรายการ {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalItems)} จาก {totalItems.toLocaleString()} รายการ
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1 || loading || refreshing}
                  className="flex items-center gap-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ← ก่อนหน้า
                </button>

                <div className="flex items-center gap-1">
                  {getPageNumbers().map((page, index) => (
                    <React.Fragment key={index}>
                      {page === '...' ? (
                        <span className="px-3 py-2 text-gray-500">...</span>
                      ) : (
                        <button
                          onClick={() => goToPage(page as number)}
                          disabled={loading || refreshing}
                          className={`px-3 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 ${
                            currentPage === page
                              ? 'bg-orange-500 text-white font-medium'
                              : 'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {page}
                        </button>
                      )}
                    </React.Fragment>
                  ))}
                </div>

                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages || loading || refreshing}
                  className="flex items-center gap-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ถัดไป →
                </button>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <label className="text-gray-600 dark:text-gray-400">แสดง:</label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    const newItemsPerPage = parseInt(e.target.value);
                    setItemsPerPage(newItemsPerPage);
                    setCurrentPage(1);
                    paginationCache.current.clear();
                    cursorCache.current.clear();
                    loadWithdrawHistory(true, 1);
                  }}
                  className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
                <span className="text-gray-600 dark:text-gray-400">รายการ/หน้า</span>
              </div>
            </div>
          )}

          {(loading || refreshing) && (
            <div className="mt-4 text-center">
              <div className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-500"></div>
                {refreshing ? 'กำลังรีเฟรชข้อมูล...' : 'กำลังโหลดหน้าถัดไป...'}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
} 