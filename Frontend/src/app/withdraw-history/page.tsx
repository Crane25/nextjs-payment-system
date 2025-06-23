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
import { collection, getDocs, onSnapshot, query, orderBy, limit, startAfter, where } from 'firebase/firestore';
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
  const paginationCache = useRef<Map<string, WithdrawRecord[]>>(new Map());
  const cursorCache = useRef<Map<string, any>>(new Map());
  const teamsCache = useRef<Map<string, any>>(new Map());
  const usersCache = useRef<Map<string, any>>(new Map());
  const lastCacheTime = useRef<Map<string, number>>(new Map());
  const realTimeUnsubscribe = useRef<(() => void) | null>(null);
  
  // Cache configuration
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  const TEAMS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes  
  const USERS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  // Smart Caching System
  const getCacheKey = useCallback((page: number, filters: any) => {
    return `${page}-${JSON.stringify(filters)}`;
  }, []);

  const isCacheValid = useCallback((cacheKey: string, ttl: number = CACHE_TTL) => {
    const lastTime = lastCacheTime.current.get(cacheKey);
    return lastTime && (Date.now() - lastTime) < ttl;
  }, [CACHE_TTL]);

  const setCacheData = useCallback((cacheKey: string, data: any, cacheMap: Map<string, any>) => {
    cacheMap.set(cacheKey, data);
    lastCacheTime.current.set(cacheKey, Date.now());
  }, []);

  // Build server-side query with filters (optimized to avoid composite indexes)
  const buildWithdrawQuery = useCallback((userTeamIds: string[], page: number) => {
    // Use simple queries to avoid composite index requirements
    // We'll do minimal server-side filtering and more client-side filtering
    
    const constraints: any[] = [];
    
    // Only use the most selective filter to avoid composite index issues
    // Priority: specific team > date range > status
    
    if (selectedTeamFilter !== 'all') {
      // Most selective: filter by specific team
      constraints.push(where('teamId', '==', selectedTeamFilter));
      constraints.push(orderBy('timestamp', 'desc'));
    } else if (filterPeriod === 'custom' && startDate && endDate) {
      // Second priority: custom date range
      constraints.push(where('timestamp', '>=', startDate));
      constraints.push(where('timestamp', '<=', endDate));
      constraints.push(orderBy('timestamp', 'desc'));
    } else if (filterPeriod !== 'all' && filterPeriod !== 'custom') {
      // Third priority: preset date ranges
      const now = new Date();
      let filterDate = new Date();
      
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
      
      constraints.push(where('timestamp', '>=', filterDate.toISOString()));
      constraints.push(orderBy('timestamp', 'desc'));
    } else {
      // Fallback: simple query with just ordering
      constraints.push(orderBy('timestamp', 'desc'));
    }

    // Add pagination
    constraints.push(limit(itemsPerPage * page));

    return query(collection(db, 'withdrawHistory'), ...constraints);
  }, [selectedTeamFilter, filterStatus, filterPeriod, startDate, endDate, itemsPerPage]);

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

  // Data loading with Smart Caching and Server-side Filtering
  const loadWithdrawHistory = useCallback(async (forceRefresh = false, page = 1) => {
    if (!user || !userProfile || teamsLoading || isLoadingRef.current) {
      return;
    }

    const userTeamIds = teams.map(team => team.id);
    const filters = { 
      selectedTeamFilter, 
      filterStatus, 
      filterPeriod, 
      startDate, 
      endDate,
      userTeamIds: userTeamIds.join(',')
    };
    const cacheKey = getCacheKey(page, filters);

    // Check cache first (unless force refresh)
    if (!forceRefresh && isCacheValid(cacheKey)) {
      const cachedData = paginationCache.current.get(cacheKey);
      if (cachedData) {
        setWithdrawHistory(cachedData);
        setLoading(false);
        return;
      }
    }

    try {
      isLoadingRef.current = true;
      setLoading(true);
      if (forceRefresh) {
        setRefreshing(true);
        // Clear all caches on force refresh
        paginationCache.current.clear();
        lastCacheTime.current.clear();
      }

      // Build optimized query with server-side filtering
      const withdrawQuery = buildWithdrawQuery(userTeamIds, page);

      // Check teams/users cache
      const teamsNeedReload = !isCacheValid('teams', TEAMS_CACHE_TTL) || forceRefresh;
      const usersNeedReload = !isCacheValid('users', USERS_CACHE_TTL) || forceRefresh;

      const promises: Promise<any>[] = [getDocs(withdrawQuery)];
      
      if (teamsNeedReload) {
        promises.push(getDocs(collection(db, 'teams')));
      }
      
      if (usersNeedReload) {
        promises.push(getDocs(collection(db, 'users')));
      }

      const results = await Promise.all(promises);
      const withdrawSnapshot = results[0];
      
      // Handle teams data
      let teamsMap = teamsCache.current;
      if (teamsNeedReload && results[1]) {
        teamsMap = new Map();
        results[1].docs.forEach((doc: any) => {
          teamsMap.set(doc.id, doc.data());
        });
        teamsCache.current = teamsMap;
        setCacheData('teams', teamsMap, new Map());
      }

      // Handle users data  
      let usersMap = usersCache.current;
      if (usersNeedReload) {
        const userSnapshotIndex = teamsNeedReload ? 2 : 1;
        if (results[userSnapshotIndex]) {
          usersMap = new Map();
          results[userSnapshotIndex].docs.forEach((doc: any) => {
            const userData = doc.data();
            usersMap.set(doc.id, userData);
          });
          usersCache.current = usersMap;
          setCacheData('users', usersMap, new Map());
        }
      }

      // Process withdraw records with cached team and user mapping
      const allProcessedRecords = withdrawSnapshot.docs.map((doc: any) => {
        const data = doc.data();
        
        // Get team name from cache
        let teamName = 'ไม่ระบุทีม';
        if (data.teamId && teamsMap.has(data.teamId)) {
          const teamData = teamsMap.get(data.teamId);
          teamName = teamData.name || `ทีม ${data.teamId.substring(0, 8)}`;
        } else if (data.teamId) {
          teamName = `ทีม ${data.teamId.substring(0, 8)}`;
        }

        // Get user information from cache
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

      // Apply additional client-side filtering that we removed from server-side
      const processedRecords = allProcessedRecords.filter((record: WithdrawRecord) => {
        // Filter by user accessible teams
        if (!record.teamId || !userTeamIds.includes(record.teamId)) {
          return false;
        }

        // Filter by status (if not already filtered by server)
        if (filterStatus !== 'all' && record.status !== filterStatus) {
          return false;
        }

        // Additional date filtering for cases not handled by server
        if (filterPeriod === 'custom' && (startDate || endDate)) {
          const recordTime = new Date(record.timestamp).getTime();
          
          if (startDate && recordTime < new Date(startDate).getTime()) {
            return false;
          }
          
          if (endDate && recordTime > new Date(endDate).getTime()) {
            return false;
          }
        }

        return true;
      });

      // Cache the processed data
      setCacheData(cacheKey, processedRecords, paginationCache.current);
      
      setWithdrawHistory(processedRecords);
      setTotalItems(processedRecords.length);
      setTotalPages(Math.ceil(processedRecords.length / itemsPerPage));
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
  }, [user, userProfile, teamsLoading, teams, itemsPerPage, selectedTeamFilter, filterStatus, filterPeriod, startDate, endDate, getCacheKey, isCacheValid, setCacheData, buildWithdrawQuery, loadWithdrawStatistics, TEAMS_CACHE_TTL, USERS_CACHE_TTL]);

  // Real-time Updates Setup
  const setupRealTimeUpdates = useCallback(() => {
    if (!user || !userProfile || teamsLoading) return;

    // Clean up existing listener
    if (realTimeUnsubscribe.current) {
      realTimeUnsubscribe.current();
    }

    const userTeamIds = teams.map(team => team.id);
    if (userTeamIds.length === 0) return;

    // Listen only for new records (selective real-time) - simplified to avoid composite index
    const lastUpdateTime = lastUpdated.toISOString();
    const realtimeQuery = query(
      collection(db, 'withdrawHistory'),
      where('timestamp', '>', lastUpdateTime),
      orderBy('timestamp', 'desc'),
      limit(10) // Listen for more records since we'll filter client-side
    );

    realTimeUnsubscribe.current = onSnapshot(
      realtimeQuery,
      (snapshot) => {
        // Use setTimeout to defer setState to avoid render conflicts
        setTimeout(() => {
          setIsConnected(true);
        }, 0);
        
        if (!snapshot.empty) {
          const newRecords = snapshot.docs
            .map(doc => {
              const data = doc.data();
              
              // Use cached team/user data for real-time updates
              let teamName = 'ไม่ระบุทีม';
              if (data.teamId && teamsCache.current.has(data.teamId)) {
                const teamData = teamsCache.current.get(data.teamId);
                teamName = teamData.name || `ทีม ${data.teamId.substring(0, 8)}`;
              }

              let withdrawByEmail = '';
              let withdrawByUsername = '';
              if (data.withdrawByUid && usersCache.current.has(data.withdrawByUid)) {
                const userData = usersCache.current.get(data.withdrawByUid);
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
            })
            .filter((record: WithdrawRecord) => {
              // Filter to only include records from user's teams
              return record.teamId && userTeamIds.includes(record.teamId);
            });

          // Add new records to the beginning of current data (defer to avoid render conflicts)
          setTimeout(() => {
            setWithdrawHistory(prev => {
              const existingIds = new Set(prev.map(r => r.id));
              const uniqueNewRecords = newRecords.filter(r => !existingIds.has(r.id));
              
              if (uniqueNewRecords.length > 0) {
                // Clear cache to force reload on next page change
                paginationCache.current.clear();
                lastCacheTime.current.clear();
                
                // Show toast notification
                setTimeout(() => {
                  toast.success(
                    `มีรายการถอนเงินใหม่ ${uniqueNewRecords.length} รายการ`,
                    {
                      duration: 4000,
                      position: 'top-right',
                    }
                  );
                }, 100);
                
                return [...uniqueNewRecords, ...prev];
              }
              
              return prev;
            });
            
            setLastUpdated(new Date());
          }, 0);
        }
      },
      (error) => {
        console.error('Real-time listener error:', error);
        // Use setTimeout to defer setState to avoid render conflicts
        setTimeout(() => {
          setIsConnected(false);
          toast.error('การเชื่อมต่อ Real-time ขัดข้อง');
        }, 0);
      }
    );
  }, [user, userProfile, teamsLoading, teams, lastUpdated]);

  // Helper functions (now with client-side search only since server-side filtering handles the rest)
  const getFilteredHistory = () => {
    return withdrawHistory.filter(record => {
      // Only apply search term filtering on client-side (for better UX)
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matches = 
          record.websiteName?.toLowerCase().includes(searchLower) ||
          record.withdrawBy?.toLowerCase().includes(searchLower) ||
          record.note?.toLowerCase().includes(searchLower) ||
          record.teamName?.toLowerCase().includes(searchLower);
        if (!matches) return false;
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

  // Real-time updates effect (with safer setup)
  useEffect(() => {
    if (user && userProfile && !teamsLoading && withdrawHistory.length > 0 && !loading) {
      // Set up real-time listener after initial data load and loading is complete
      const timer = setTimeout(() => {
        // Double check that component is still mounted and not loading
        if (!loading && !refreshing) {
          setupRealTimeUpdates();
        }
      }, 3000); // Wait 3 seconds after initial load to ensure stable state

      return () => {
        clearTimeout(timer);
        if (realTimeUnsubscribe.current) {
          realTimeUnsubscribe.current();
        }
      };
    }
  }, [user, userProfile, teamsLoading, withdrawHistory.length, loading, refreshing, setupRealTimeUpdates]);

  // Filter change effect - reload data when server-side filters change
  useEffect(() => {
    if (user && userProfile && !teamsLoading) {
      // Clean up real-time listener before filter change
      if (realTimeUnsubscribe.current) {
        realTimeUnsubscribe.current();
        realTimeUnsubscribe.current = null;
      }
      
      // Clear cache and reload when filters change (except search term)
      paginationCache.current.clear();
      lastCacheTime.current.clear();
      setCurrentPage(1);
      loadWithdrawHistory(true, 1);
    }
  }, [selectedTeamFilter, filterStatus, filterPeriod, startDate, endDate, user, userProfile, teamsLoading, loadWithdrawHistory]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (realTimeUnsubscribe.current) {
        realTimeUnsubscribe.current();
      }
    };
  }, []);

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