'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import WithdrawStats from '../../components/WithdrawStats';
import WithdrawFilters from '../../components/WithdrawFilters';
import WithdrawTable from '../../components/WithdrawTable';
import WithdrawPagination from '../../components/WithdrawPagination';
import { XCircleIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import { useUserProfile } from '../../contexts/UserContext';
import { usePermission } from '../../hooks/usePermission';
import { useMultiTeam } from '../../hooks/useMultiTeam';
import { collection, getDocs, onSnapshot, query, orderBy, limit, startAfter } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { getWithdrawStatistics, isAggregationSupported } from '../../utils/aggregation';
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
  const { teams, loading: teamsLoading } = useMultiTeam();
  
  // Main data states
  const [withdrawHistory, setWithdrawHistory] = useState<WithdrawRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isConnected, setIsConnected] = useState(true);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<'all' | string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  // Statistics states
  const [allTimeStats, setAllTimeStats] = useState({
    totalAmount: 0,
    totalTransactions: 0,
    completedTransactions: 0,
    todayAmount: 0,
    todayTransactions: 0,
    averageAmount: 0,
    isPartialStats: false
  });
  const [statsLoading, setStatsLoading] = useState(false);

  // Refs and cache
  const isLoadingRef = useRef(false);
  const paginationCache = useRef<Map<number, WithdrawRecord[]>>(new Map());
  const cursorCache = useRef<Map<number, any>>(new Map());

  // Load statistics
  const loadWithdrawStatistics = useCallback(async (userTeamIds: string[]) => {
    try {
      setStatsLoading(true);
      
      // Get all withdraw records for statistics
      const statsQuery = query(
        collection(db, 'withdrawHistory'),
        orderBy('timestamp', 'desc'),
        limit(5000) // Limit to prevent exceeding Firestore limits
      );
      
      const statsSnapshot = await getDocs(statsQuery);
      const allRecords = statsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WithdrawRecord[];
      
      // Filter records accessible to current user
      const userAccessibleRecords = allRecords.filter(record => 
        record.teamId && userTeamIds.includes(record.teamId)
      );
      
      // Calculate statistics
      const totalAmount = userAccessibleRecords.reduce((sum, record) => sum + (record.amount || 0), 0);
      const completedRecords = userAccessibleRecords.filter(record => record.status === 'completed');
      const completedAmount = completedRecords.reduce((sum, record) => sum + (record.amount || 0), 0);
      
      // Today's statistics
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayRecords = userAccessibleRecords.filter(record => {
        const recordDate = new Date(record.timestamp);
        return recordDate >= today;
      });
      const todayAmount = todayRecords.reduce((sum, record) => sum + (record.amount || 0), 0);
      
      const newStats = {
        totalAmount: completedAmount,
        totalTransactions: userAccessibleRecords.length,
        completedTransactions: completedRecords.length,
        todayAmount: todayAmount,
        todayTransactions: todayRecords.length,
        averageAmount: userAccessibleRecords.length > 0 ? totalAmount / userAccessibleRecords.length : 0,
        isPartialStats: statsSnapshot.docs.length >= 5000
      };
      
      setAllTimeStats(newStats);
      
    } catch (error) {
      console.error('Error loading withdraw statistics:', error);
      toast.error('ไม่สามารถโหลดสถิติได้');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Data loading
  const loadWithdrawHistory = useCallback(async (forceRefresh = false, page = 1) => {
    if (!user || !userProfile || teamsLoading || isLoadingRef.current) {
      return;
    }

    try {
      isLoadingRef.current = true;
      setLoading(true);
      if (forceRefresh) setRefreshing(true);

      const userTeamIds = teams.map(team => team.id);
      
      // Load withdraw records with proper data
      const withdrawQuery = query(
        collection(db, 'withdrawHistory'),
        orderBy('timestamp', 'desc'),
        limit(itemsPerPage * page) // Load more data for proper pagination
      );

      const [withdrawSnapshot, teamsSnapshot, usersSnapshot] = await Promise.all([
        getDocs(withdrawQuery),
        getDocs(collection(db, 'teams')),
        getDocs(collection(db, 'users'))
      ]);

      // Create maps for team and user data
      const teamsMap = new Map();
      teamsSnapshot.docs.forEach(doc => {
        teamsMap.set(doc.id, doc.data());
      });

      const usersMap = new Map();
      usersSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        usersMap.set(doc.id, userData);
      });

      // Process withdraw records with proper team and user mapping
      const allRecords = withdrawSnapshot.docs.map(doc => {
        const data = doc.data();
        
        // Get team name
        let teamName = 'ไม่ระบุทีม';
        if (data.teamId && teamsMap.has(data.teamId)) {
          const teamData = teamsMap.get(data.teamId);
          teamName = teamData.name || `ทีม ${data.teamId.substring(0, 8)}`;
        } else if (data.teamId) {
          teamName = `ทีม ${data.teamId.substring(0, 8)}`;
        }

        // Get user information
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

      // Filter records accessible to current user
      const filteredRecords = allRecords.filter(record => 
        record.teamId && userTeamIds.includes(record.teamId)
      );

      setWithdrawHistory(filteredRecords);
      setTotalItems(filteredRecords.length);
      setTotalPages(Math.ceil(filteredRecords.length / itemsPerPage));
      setLastUpdated(new Date());

      // Load statistics on first page or refresh
      if (page === 1 || forceRefresh) {
        await loadWithdrawStatistics(userTeamIds);
      }
      
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
      setRefreshing(false);
      isLoadingRef.current = false;
    }
  }, [user, userProfile, teamsLoading, teams, itemsPerPage, loadWithdrawStatistics]);

  // Helper functions
  const getFilteredHistory = () => {
    return withdrawHistory.filter(record => {
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matches = 
          record.websiteName?.toLowerCase().includes(searchLower) ||
          record.withdrawBy?.toLowerCase().includes(searchLower) ||
          record.note?.toLowerCase().includes(searchLower) ||
          record.teamName?.toLowerCase().includes(searchLower);
        if (!matches) return false;
      }

      if (filterStatus !== 'all' && record.status !== filterStatus) {
        return false;
      }

      if (selectedTeamFilter !== 'all' && record.teamId !== selectedTeamFilter) {
        return false;
      }

      return true;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
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

  // Event handlers
  const handleRefresh = () => {
    loadWithdrawHistory(true, 1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    loadWithdrawHistory(false, page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
    loadWithdrawHistory(true, 1);
  };

  const handleDateRangeReset = () => {
    setStartDate('');
    setEndDate('');
    setFilterPeriod('all');
  };

  // Effects
  useEffect(() => {
    if (user && userProfile && !teamsLoading) {
      loadWithdrawHistory(true, 1);
    }
  }, [user?.uid, userProfile?.role, teamsLoading, loadWithdrawHistory]);

  // Permission check
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
        <WithdrawStats 
          stats={allTimeStats}
          loading={statsLoading}
        />

        {/* Filters */}
        <WithdrawFilters
          searchTerm={searchTerm}
          filterStatus={filterStatus}
          filterPeriod={filterPeriod}
          selectedTeamFilter={selectedTeamFilter}
          startDate={startDate}
          endDate={endDate}
          itemsPerPage={itemsPerPage}
          teams={teams}
          teamCounts={getTeamCounts()}
          totalItems={withdrawHistory.length}
          onSearchChange={setSearchTerm}
          onStatusChange={setFilterStatus}
          onPeriodChange={setFilterPeriod}
          onTeamChange={setSelectedTeamFilter}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onItemsPerPageChange={handleItemsPerPageChange}
          onResetDateRange={handleDateRangeReset}
          onLoadData={() => loadWithdrawHistory(true, 1)}
        />

        {/* Table */}
        <WithdrawTable
          data={getFilteredHistory()}
          loading={loading}
          teamsLoading={teamsLoading}
          teams={teams}
          lastUpdated={lastUpdated}
          isConnected={isConnected}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        />

        {/* Pagination */}
        <WithdrawPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          loading={loading}
          refreshing={refreshing}
          onPageChange={handlePageChange}
          onItemsPerPageChange={handleItemsPerPageChange}
        />
      </div>
    </DashboardLayout>
  );
} 