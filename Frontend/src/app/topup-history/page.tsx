'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { 
  CurrencyDollarIcon,
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
import { getTopupStatistics, isAggregationSupported } from '../../utils/aggregation';
import toast from 'react-hot-toast';

interface TopupRecord {
  id: string;
  websiteId: string;
  websiteName: string;
  amount: number;
  balanceAfter?: number;
  timestamp: string;
  status: 'completed' | 'pending' | 'failed';
  topupBy?: string;
  topupByUid?: string;
  topupByEmail?: string;
  topupByUsername?: string;
  teamId?: string;
  teamName?: string;
  note?: string;
}



export default function TopupHistory() {
  const { user } = useAuth();
  const { userProfile } = useUserProfile();
  const { canViewTopup } = usePermission();
  const { teams, loading: teamsLoading, error: teamsError } = useMultiTeam();
  
  // Debug teams data
  useEffect(() => {
    console.log('topup-history: teams data', { 
      teams: teams.map(t => ({ id: t.id, name: t.name })), 
      teamsLoading, 
      teamsError 
    });
  }, [teams, teamsLoading, teamsError]);
  const [topupHistory, setTopupHistory] = useState<TopupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<'all' | string>('all');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  // Date range filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);

  // Helper functions for date filtering
  const setDateRange = (range: 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth') => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (range) {
      case 'today':
        // วันนี้ 00:00 ถึง 23:59
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);
        setStartDate(todayStart.toISOString().slice(0, 16));
        setEndDate(todayEnd.toISOString().slice(0, 16));
        break;
      case 'yesterday':
        // เมื่อวาน 00:00 ถึง 23:59
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStart = new Date(yesterday);
        yesterdayStart.setHours(0, 0, 0, 0);
        const yesterdayEnd = new Date(yesterday);
        yesterdayEnd.setHours(23, 59, 59, 999);
        setStartDate(yesterdayStart.toISOString().slice(0, 16));
        setEndDate(yesterdayEnd.toISOString().slice(0, 16));
        break;
      case 'thisWeek':
        // สัปดาห์นี้ (วันอาทิตย์ 00:00 ถึงปัจจุบัน)
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        const nowTime = new Date();
        setStartDate(startOfWeek.toISOString().slice(0, 16));
        setEndDate(nowTime.toISOString().slice(0, 16));
        break;
      case 'lastWeek':
        // สัปดาห์ที่แล้ว (วันอาทิตย์ 00:00 ถึงวันเสาร์ 23:59)
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
        lastWeekStart.setHours(0, 0, 0, 0);
        const lastWeekEnd = new Date(lastWeekStart);
        lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
        lastWeekEnd.setHours(23, 59, 59, 999);
        setStartDate(lastWeekStart.toISOString().slice(0, 16));
        setEndDate(lastWeekEnd.toISOString().slice(0, 16));
        break;
      case 'thisMonth':
        // เดือนนี้ (วันที่ 1 00:00 ถึงปัจจุบัน)
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        startOfMonth.setHours(0, 0, 0, 0);
        const nowMonth = new Date();
        setStartDate(startOfMonth.toISOString().slice(0, 16));
        setEndDate(nowMonth.toISOString().slice(0, 16));
        break;
      case 'lastMonth':
        // เดือนที่แล้ว (วันที่ 1 00:00 ถึงวันสุดท้าย 23:59)
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        lastMonthStart.setHours(0, 0, 0, 0);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        lastMonthEnd.setHours(23, 59, 59, 999);
        setStartDate(lastMonthStart.toISOString().slice(0, 16));
        setEndDate(lastMonthEnd.toISOString().slice(0, 16));
        break;
    }
  };
  
  // Pagination states - Improved for large datasets
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50); // เริ่มต้น 50 รายการต่อหน้า
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  
  // Use refs for values that shouldn't trigger re-renders
  const lastDocRef = useRef<any>(null);
  const isLoadingRef = useRef(false);
  const paginationCache = useRef<Map<number, TopupRecord[]>>(new Map()); // Cache for pagination
  const cursorCache = useRef<Map<number, any>>(new Map()); // Cache for cursors (last documents)
  
  // Summary statistics (for all data, not just displayed)
  const [allTimeStats, setAllTimeStats] = useState({
    totalAmount: 0,
    totalTransactions: 0,
    completedTransactions: 0,
    todayAmount: 0,
    todayTransactions: 0,
    averageAmount: 0,
    isPartialStats: false
  });

  // Performance optimizations - Statistics caching
  const statsCache = useRef<{
    data: typeof allTimeStats | null;
    expiry: number;
    userTeamIds: string[];
  }>({ 
    data: null, 
    expiry: 0, 
    userTeamIds: [] 
  });
  
  // Performance monitoring
  const performanceRef = useRef<{
    loadStartTime: number;
    totalQueryTime: number;
    cacheHits: number;
    cacheMisses: number;
  }>({
    loadStartTime: 0,
    totalQueryTime: 0,
    cacheHits: 0,
    cacheMisses: 0
  });


  // Optimized loading function with improved pagination for large datasets
  const loadTopupHistory = useCallback(async (forceRefresh = false, page = 1) => {
    if (!user || !userProfile || teamsLoading) {
      return;
    }

    // Prevent multiple concurrent requests
    if (isLoadingRef.current && !forceRefresh) {
      return;
    }

    // Check cache first for non-refresh requests
    if (!forceRefresh && paginationCache.current.has(page)) {
      const cachedData = paginationCache.current.get(page);
      if (cachedData) {
        setTopupHistory(cachedData);
        setCurrentPage(page);
        setLoading(false);
        return;
      }
    }

    try {
      isLoadingRef.current = true;
      performanceRef.current.loadStartTime = performance.now();
      
      if (forceRefresh) {
        setRefreshing(true);
        setCurrentPage(1);
        lastDocRef.current = null;
        paginationCache.current.clear(); // Clear cache on refresh
        cursorCache.current.clear(); // Clear cursor cache on refresh
        // Clear stats cache on force refresh
        statsCache.current = { data: null, expiry: 0, userTeamIds: [] };
      } else {
        setLoading(true);
      }

      // Create optimized cursor-based pagination query
      let topupQuery = query(
        collection(db, 'topupHistory'),
        orderBy('timestamp', 'desc'),
        limit(itemsPerPage)
      );

      // For pagination beyond first page, use cached cursor
      if (page > 1) {
        const prevPageCursor = cursorCache.current.get(page - 1);
        if (prevPageCursor) {
          topupQuery = query(
            collection(db, 'topupHistory'),
            orderBy('timestamp', 'desc'),
            startAfter(prevPageCursor),
            limit(itemsPerPage)
          );
        } else {
          // If cursor not found, we need to build the path sequentially
          // This is a fallback for direct page navigation
          
          let currentCursor = null;
          
          for (let i = 1; i < page; i++) {
            if (cursorCache.current.has(i)) {
              currentCursor = cursorCache.current.get(i);
            } else {
                             // Build missing cursor by querying the previous page
               const buildQuery: Query<DocumentData> = currentCursor 
                 ? query(collection(db, 'topupHistory'), orderBy('timestamp', 'desc'), startAfter(currentCursor), limit(itemsPerPage))
                 : query(collection(db, 'topupHistory'), orderBy('timestamp', 'desc'), limit(itemsPerPage));
               
               const buildSnapshot: QuerySnapshot<DocumentData> = await getDocs(buildQuery);
              if (buildSnapshot.docs.length > 0) {
                currentCursor = buildSnapshot.docs[buildSnapshot.docs.length - 1];
                cursorCache.current.set(i, currentCursor);
              } else {
                break;
              }
            }
          }
          
          if (currentCursor) {
            topupQuery = query(
              collection(db, 'topupHistory'),
              orderBy('timestamp', 'desc'),
              startAfter(currentCursor),
              limit(itemsPerPage)
            );
          }
        }
      }

      // Check if we can use cached statistics
      const currentUserTeamIds = teams.map(team => team.id);
      const now = Date.now();
      const STATS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
      
      let shouldLoadStats = false;
      let cachedStats = null;
      
      if (page === 1 || forceRefresh) {
        const cacheValid = statsCache.current.expiry > now && 
                          JSON.stringify(statsCache.current.userTeamIds) === JSON.stringify(currentUserTeamIds);
        
        if (cacheValid && statsCache.current.data && !forceRefresh) {
          cachedStats = statsCache.current.data;
          performanceRef.current.cacheHits++;
        } else {
          shouldLoadStats = true;
          performanceRef.current.cacheMisses++;
        }
      }

      // Execute queries in parallel - optimize for performance
      const queryStartTime = performance.now();
      const [topupSnapshot, teamsSnapshot, usersSnapshot, allStatsSnapshot] = await Promise.all([
        getDocs(topupQuery), // For pagination
        getDocs(collection(db, 'teams')),
        getDocs(collection(db, 'users')),
        // Get limited records for accurate statistics (with performance optimization)
        shouldLoadStats ? getDocs(query(
          collection(db, 'topupHistory'),
          orderBy('timestamp', 'desc'),
          limit(10000) // Maximum allowed by Firestore
        )) : Promise.resolve(null)
      ]);
      
      performanceRef.current.totalQueryTime += performance.now() - queryStartTime;

      // Create efficient lookup maps
      const teamsMap = new Map();
      teamsSnapshot.docs.forEach(doc => {
        teamsMap.set(doc.id, doc.data());
      });

      const usersMap = new Map();
      usersSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        usersMap.set(doc.id, userData);
      });

      // Process topup records with efficient lookups
      const userTeamIds = teams.map(team => team.id);
      const allTopupRecords = topupSnapshot.docs.map(doc => {
        const data = doc.data();
        
        // Get team info from map (O(1) lookup)
        let teamName = 'ไม่ระบุทีม';
        if (data.teamId && teamsMap.has(data.teamId)) {
          const teamData = teamsMap.get(data.teamId);
          teamName = teamData.name || `ทีม ${data.teamId.substring(0, 8)}`;
        } else if (data.teamId) {
          teamName = `ทีม ${data.teamId.substring(0, 8)}`;
        }

        // Get user info from map (O(1) lookup)
        let topupByEmail = '';
        let topupByUsername = '';
        if (data.topupByUid && usersMap.has(data.topupByUid)) {
          const userData = usersMap.get(data.topupByUid);
          topupByEmail = userData.email || '';
          topupByUsername = userData.username || userData.email?.split('@')[0] || '';
        }
        
        return {
          id: doc.id,
          ...data,
          teamName,
          topupByEmail,
          topupByUsername
        } as TopupRecord;
      });

      // Filter based on user role and permissions
      let filteredRecords: TopupRecord[];
      
      if (userProfile.role === 'admin') {
        // Admin: เห็นเฉพาะข้อมูลทีมที่ตัวเองเป็นสมาชิก (เหมือน Manager)
        filteredRecords = allTopupRecords.filter(record => 
          record.teamId && userTeamIds.includes(record.teamId)
        );
      } else if (userProfile.role === 'manager') {
        filteredRecords = allTopupRecords.filter(record => 
          record.teamId && userTeamIds.includes(record.teamId)
        );
      } else {
        filteredRecords = allTopupRecords.filter(record => 
          record.teamId && userTeamIds.includes(record.teamId)
        );
      }
      
      // Data is already sorted by Firestore query (orderBy timestamp desc)
      // No need to sort again
      
      // Update pagination info
      setHasMore(topupSnapshot.docs.length === itemsPerPage);
      if (topupSnapshot.docs.length > 0) {
        lastDocRef.current = topupSnapshot.docs[topupSnapshot.docs.length - 1];
      }
      
      // Always replace data for specific page (not append)
      setTopupHistory(filteredRecords);
      setCurrentPage(page);
      
      // Cache the current page data and cursor
      paginationCache.current.set(page, filteredRecords);
      
      // Store cursor for next page navigation
      if (topupSnapshot.docs.length > 0) {
        const lastDoc = topupSnapshot.docs[topupSnapshot.docs.length - 1];
        cursorCache.current.set(page, lastDoc);
      }
      
      // Update total items count and pagination info
      if (page === 1 || forceRefresh) {
        // On first page, get total count from all stats data for pagination
        if (allStatsSnapshot) {
          const userTeamIds = teams.map(team => team.id);
          let totalCount = 0;
          
          if (userProfile.role === 'admin') {
            // Admin: นับเฉพาะข้อมูลทีมที่ตัวเองเป็นสมาชิก (เหมือน Manager)
            totalCount = allStatsSnapshot.docs.filter((doc: any) => {
              const data = doc.data();
              return data.teamId && userTeamIds.includes(data.teamId);
            }).length;
          } else {
            totalCount = allStatsSnapshot.docs.filter((doc: any) => {
              const data = doc.data();
              return data.teamId && userTeamIds.includes(data.teamId);
            }).length;
          }
          
          setTotalItems(totalCount);
          setTotalPages(Math.ceil(totalCount / itemsPerPage));
        }
      }
      
      setLastUpdated(new Date());
      
      // Use cached statistics or calculate new ones
      if (page === 1 || forceRefresh) {
        if (cachedStats) {
          // Use cached statistics
          setAllTimeStats(cachedStats);
        } else {
          // Try Firestore Aggregation API first, fallback to manual calculation
          try {
            if (isAggregationSupported()) {
              const aggregatedStats = await getTopupStatistics(currentUserTeamIds);
              
              setAllTimeStats(aggregatedStats);
              
              // Cache the aggregated statistics
              statsCache.current = {
                data: aggregatedStats,
                expiry: now + STATS_CACHE_DURATION,
                userTeamIds: currentUserTeamIds
              };
            } else {
              throw new Error('Aggregation API not supported');
            }
          } catch (aggregationError) {
            
            // Fallback to manual calculation if aggregation fails
            if (allStatsSnapshot) {
          // Calculate new statistics with performance optimization
          const userTeamIds = teams.map(team => team.id);
          const today = new Date().toDateString();
          
          // Process limited records for statistics (still accurate for recent data)
          const allRecords = allStatsSnapshot.docs.map((doc: any) => {
            const data = doc.data();
            
            // Get team info from map (O(1) lookup)
            let teamName = 'ไม่ระบุทีม';
            if (data.teamId && teamsMap.has(data.teamId)) {
              const teamData = teamsMap.get(data.teamId);
              teamName = teamData.name || `ทีม ${data.teamId.substring(0, 8)}`;
            } else if (data.teamId) {
              teamName = `ทีม ${data.teamId.substring(0, 8)}`;
            }
            
            return {
              ...data,
              teamName,
              timestamp: data.timestamp,
              amount: data.amount || 0,
              status: data.status || 'pending',
              teamId: data.teamId
            };
          });
          
          // Filter records based on user permissions
          let relevantRecords;
          if (userProfile.role === 'admin') {
            // Admin: เห็นเฉพาะข้อมูลทีมที่ตัวเองเป็นสมาชิก (เหมือน Manager)
            relevantRecords = allRecords.filter((record: any) => 
              record.teamId && userTeamIds.includes(record.teamId)
            );
          } else {
            relevantRecords = allRecords.filter((record: any) => 
              record.teamId && userTeamIds.includes(record.teamId)
            );
          }
          
          // Calculate statistics from relevant data (limited to 10,000 most recent records)
          // Note: For datasets > 10,000 records, this shows statistics for the most recent 10,000 records
          const totalAmount = relevantRecords.reduce((sum: number, record: any) => sum + (record.amount || 0), 0);
          const totalTransactions = relevantRecords.length;
          const completedTransactions = relevantRecords.filter((record: any) => record.status === 'completed').length;
          
          // Add indicator if we're likely showing partial statistics
          const isPartialStats = allStatsSnapshot.docs.length >= 10000;
          
          // Calculate today's statistics
          const todayRecords = relevantRecords.filter((record: any) => {
            const recordDate = new Date(record.timestamp);
            return recordDate.toDateString() === today;
          });
          
          const todayAmount = todayRecords.reduce((sum: number, record: any) => sum + (record.amount || 0), 0);
          const todayTransactions = todayRecords.length;
          
          const newStats = {
            totalAmount,
            totalTransactions,
            completedTransactions,
            todayAmount,
            todayTransactions,
            averageAmount: totalTransactions > 0 ? totalAmount / totalTransactions : 0,
            isPartialStats // เพิ่ม flag บอกว่าเป็นข้อมูลบางส่วน
          };
          
          setAllTimeStats(newStats);
          
          // Cache the statistics for 5 minutes
          statsCache.current = {
            data: newStats,
            expiry: now + STATS_CACHE_DURATION,
            userTeamIds: currentUserTeamIds
          };
            }
          }
        }
      }
      
    } catch (error) {
      // Error loading topup history
      console.error('Error loading topup history:', error);
      toast.error('ไม่สามารถโหลดประวัติการเติมเงินได้');
    } finally {
      setLoading(false);
      setRefreshing(false);
      isLoadingRef.current = false;
      
    }
  }, [user, userProfile, teams, teamsLoading, itemsPerPage]);

  // Navigate to specific page
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      loadTopupHistory(false, page);
    }
  };

  // Force refresh function
  const handleRefresh = () => {
    loadTopupHistory(true);
  };

  // Generate page numbers for pagination
  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const totalPagesToShow = 7; // Show max 7 page numbers
    const halfRange = Math.floor(totalPagesToShow / 2);

    if (totalPages <= totalPagesToShow) {
      // Show all pages if total pages is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show first page
      pages.push(1);

      // Calculate range around current page
      let startPage = Math.max(2, currentPage - halfRange);
      let endPage = Math.min(totalPages - 1, currentPage + halfRange);

      // Adjust range if needed
      if (currentPage - halfRange <= 2) {
        endPage = Math.min(totalPages - 1, totalPagesToShow - 2);
      }
      if (currentPage + halfRange >= totalPages - 1) {
        startPage = Math.max(2, totalPages - totalPagesToShow + 2);
      }

      // Add ellipsis if needed
      if (startPage > 2) {
        pages.push('...');
      }

      // Add middle pages
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }

      // Add ellipsis if needed
      if (endPage < totalPages - 1) {
        pages.push('...');
      }

      // Show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  // Load data when component mounts and dependencies are ready
  useEffect(() => {
    if (user && userProfile && !teamsLoading) {
      loadTopupHistory();
    }
  }, [user?.uid, userProfile?.role, teamsLoading, loadTopupHistory]);



  // Optimized real-time listener for new topup records (ทำงานตลอดเวลา)
  useEffect(() => {
    if (!user || !userProfile || teamsLoading) return;

    let unsubscribe: (() => void) | null = null;
    let isInitialLoad = true;

    // Set up real-time listener for topupHistory records (simple version for compatibility)
    unsubscribe = onSnapshot(
      collection(db, 'topupHistory'), 
      (snapshot) => {
        // Skip initial load to avoid duplicate data
        if (isInitialLoad) {
          isInitialLoad = false;
          return;
        }

        // Check for new records only
        const newRecords = snapshot.docChanges().filter(change => change.type === 'added');
        
        if (newRecords.length > 0) {
          // Check if any new records are relevant to current user and recent
          const userTeamIds = teams.map(team => team.id);
          const twentyFourHoursAgo = new Date();
          twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
          
          const relevantNewRecords = newRecords.filter(change => {
            const data = change.doc.data();
            
            // Check if record is recent (within 24 hours)
            const recordTime = new Date(data.timestamp);
            if (recordTime < twentyFourHoursAgo) {
              return false;
            }
            
            if (userProfile.role === 'admin') {
              // Admin: เห็นเฉพาะข้อมูลทีมที่ตัวเองเป็นสมาชิก
              return data.teamId && userTeamIds.includes(data.teamId);
            }
            
            return data.teamId && userTeamIds.includes(data.teamId);
          });

          if (relevantNewRecords.length > 0) {
            // Invalidate stats cache when new records arrive
            statsCache.current = { data: null, expiry: 0, userTeamIds: [] };
            
            // Reload data to get the new records
            loadTopupHistory(true);
            
            // Show notification
            toast.success(
              `มีรายการเติมเงินใหม่ ${relevantNewRecords.length} รายการ`,
              {
                duration: 4000,
                position: 'top-right',
              }
            );
          }
        }
      },
      (error) => {
        // Real-time listener error - log only in development
        if (process.env.NODE_ENV === 'development') {
          console.error('Real-time listener error:', error);
        }
      }
    );

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user, userProfile, teamsLoading, teams, loadTopupHistory]);

  // Get filtered history based on search, status, period, and team
  const getFilteredHistory = () => {
    return topupHistory.filter(record => {
      // Search filter
      const matchesSearch = record.websiteName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (record.teamName && record.teamName.toLowerCase().includes(searchTerm.toLowerCase()));
      
      // Status filter
      const matchesStatus = filterStatus === 'all' || record.status === filterStatus;
      
      // Team filter
      const matchesTeam = selectedTeamFilter === 'all' || record.teamId === selectedTeamFilter;
      
      // Period filter
      let matchesPeriod = true;
      if (filterPeriod !== 'all') {
        const recordDate = new Date(record.timestamp);
        const now = new Date();
        
        switch (filterPeriod) {
          case 'today':
            matchesPeriod = recordDate.toDateString() === now.toDateString();
            break;
          case 'week':
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            matchesPeriod = recordDate >= weekAgo;
            break;
          case 'month':
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            matchesPeriod = recordDate >= monthAgo;
            break;
          case 'custom':
            // Custom date range filter with time support
            if (startDate && endDate) {
              const start = new Date(startDate);
              const end = new Date(endDate);
              matchesPeriod = recordDate >= start && recordDate <= end;
            } else if (startDate) {
              const start = new Date(startDate);
              matchesPeriod = recordDate >= start;
            } else if (endDate) {
              const end = new Date(endDate);
              matchesPeriod = recordDate <= end;
            }
            break;
        }
      }
      
      return matchesSearch && matchesStatus && matchesPeriod && matchesTeam;
    });
  };

  const filteredHistory = getFilteredHistory();

  // Get history grouped by team
  const getHistoryByTeam = () => {
    const grouped = filteredHistory.reduce((acc, record) => {
      const teamId = record.teamId || 'no-team';
      const teamName = record.teamName || 'ไม่ระบุทีม';
      
      if (!acc[teamId]) {
        acc[teamId] = {
          teamId,
          teamName,
          records: []
        };
      }
      
      acc[teamId].records.push(record);
      return acc;
    }, {} as Record<string, { teamId: string, teamName: string, records: TopupRecord[] }>);

    return Object.values(grouped).sort((a, b) => a.teamName.localeCompare(b.teamName));
  };

  // Calculate summary statistics for filtered data (for display info only)
  const filteredTotalAmount = filteredHistory.reduce((sum, record) => sum + record.amount, 0);
  const filteredCompletedTransactions = filteredHistory.filter(record => record.status === 'completed').length;

  // Get team counts for filter dropdown
  const getTeamCounts = () => {
    const counts = topupHistory.reduce((acc, record) => {
      const teamId = record.teamId || 'no-team';
      const teamName = record.teamName || 'ไม่ระบุทีม';
      
      if (!acc[teamId]) {
        acc[teamId] = { teamName, count: 0 };
      }
      acc[teamId].count++;
      return acc;
    }, {} as Record<string, { teamName: string, count: number }>);

    return Object.entries(counts).map(([teamId, data]) => ({
      teamId,
      teamName: data.teamName,
      count: data.count
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
        return 'ไม่ทราบสถานะ';
    }
  };

  const getTeamColor = (teamId: string) => {
    const colors = [
      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
    ];
    
    const index = teamId ? teamId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length : 0;
    return colors[index];
  };

  // ตรวจสอบสิทธิ์การเข้าถึง
  if (!canViewTopup()) {
    return (
      <DashboardLayout 
        title="ไม่มีสิทธิ์เข้าถึง" 
        subtitle="คุณไม่มีสิทธิ์ดูประวัติเติมเงิน"
      >
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <XCircleIcon className="mx-auto h-12 w-12 text-red-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">ไม่มีสิทธิ์เข้าถึง</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">คุณไม่มีสิทธิ์ดูประวัติเติมเงิน</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="ประวัติเติมเงิน" 
      subtitle={userProfile?.role === 'admin' ? "รายการและประวัติการเติมเงินทุกทีม" : "รายการและประวัติการเติมเงินของทีม"}
    >
      <div className="space-y-6 lg:space-y-8">

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium">
                  เติมเงินทั้งหมด{allTimeStats.isPartialStats ? ' (10K รายการล่าสุด)' : ''}
                </p>
                <p className="text-2xl font-bold">
                  {allTimeStats.isPartialStats && <span className="text-lg">~</span>}
                  ฿{allTimeStats.totalAmount.toLocaleString('th-TH', { 
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: 2 
                  })}
                </p>
              </div>
              <CurrencyDollarIcon className="h-8 w-8 text-green-200" />
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
                <p className="text-blue-100 text-sm font-medium">
                  รายการทั้งหมด{allTimeStats.isPartialStats ? ' (10K ล่าสุด)' : ''}
                </p>
                <p className="text-2xl font-bold">
                  {allTimeStats.isPartialStats && <span className="text-lg">~</span>}
                  {allTimeStats.totalTransactions.toLocaleString()}
                </p>
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

        {/* Filters and Search */}
        <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/30 dark:border-gray-700/30 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="ค้นหาชื่อเว็บไซต์หรือทีม..."
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              {/* Items per page */}
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  แสดง:
                </label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                    lastDocRef.current = null;
                    loadTopupHistory(true, 1);
                  }}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value={25}>25 รายการ</option>
                  <option value={50}>50 รายการ</option>
                  <option value={100}>100 รายการ</option>
                  <option value={200}>200 รายการ</option>
                </select>
              </div>

              {/* Team Filter - แสดงเมื่อมีทีม (ทุก role ที่มีสิทธิ์) */}
              {getTeamCounts().length > 0 && (
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    ทีม:
                  </label>
                  <select
                    value={selectedTeamFilter}
                    onChange={(e) => setSelectedTeamFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[150px]"
                  >
                    <option value="all">ทุกทีม ({topupHistory.length})</option> 
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
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="all">สถานะทั้งหมด</option>
                <option value="completed">สำเร็จ</option>
                <option value="pending">รอดำเนินการ</option>
                <option value="failed">ล้มเหลว</option>
              </select>

              <select
                value={filterPeriod}
                onChange={(e) => {
                  const value = e.target.value as any;
                  setFilterPeriod(value);
                  setShowDateFilter(value === 'custom');
                  if (value !== 'custom') {
                    setStartDate('');
                    setEndDate('');
                  }
                }}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="all">ช่วงเวลาทั้งหมด</option>
                <option value="today">วันนี้</option>
                <option value="week">7 วันที่ผ่านมา</option>
                <option value="month">30 วันที่ผ่านมา</option>
                <option value="custom">กำหนดเอง</option>
              </select>

              {/* Date Range Filter - Compact & Clean */}
              {showDateFilter && (
                <>
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      จาก:
                    </label>
                    <input
                      type="datetime-local"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      onBlur={(e) => {
                        const value = e.target.value;
                        if (value && value.length >= 10) {
                          const date = value.split('T')[0];
                          const time = value.split('T')[1];
                          // ถ้าไม่มีเวลาหรือเวลาไม่ครบ ให้ตั้งเป็น 00:00
                          if (!time || time === '' || time.length < 5) {
                            setStartDate(`${date}T00:00`);
                          }
                        }
                      }}
                      onFocus={(e) => {
                        // เมื่อ focus ถ้ายังไม่มีค่า ให้ตั้งเป็นวันนี้ 00:00
                        if (!e.target.value) {
                          const today = new Date().toISOString().split('T')[0];
                          setStartDate(`${today}T00:00`);
                        }
                      }}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      ถึง:
                    </label>
                    <input
                      type="datetime-local"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      onBlur={(e) => {
                        const value = e.target.value;
                        if (value && value.length >= 10) {
                          const date = value.split('T')[0];
                          const time = value.split('T')[1];
                          // ถ้าไม่มีเวลาหรือเวลาไม่ครบ ให้ตั้งเป็น 23:59
                          if (!time || time === '' || time.length < 5) {
                            setEndDate(`${date}T23:59`);
                          }
                        }
                      }}
                      onFocus={(e) => {
                        // เมื่อ focus ถ้ายังไม่มีค่า ให้ตั้งเป็นวันนี้ 23:59
                        if (!e.target.value) {
                          const today = new Date().toISOString().split('T')[0];
                          setEndDate(`${today}T23:59`);
                        }
                      }}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>

                  <button
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                    }}
                    className="px-3 py-2 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  >
                    ล้าง
                  </button>
                </>
              )}
            </div>


          </div>
        </div>

        {/* History Table */}
        <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/30 dark:border-gray-700/30 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                <CurrencyDollarIcon className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">ประวัติการเติมเงิน</h3>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedTeamFilter === 'all' 
                      ? 'รายการธุรกรรมการเติมเงินทุกทีม' 
                      : `รายการธุรกรรมการเติมเงิน: ${getTeamCounts().find(t => t.teamId === selectedTeamFilter)?.teamName || 'ทีมที่เลือก'}`
                    }
                  </p>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs text-green-600 dark:text-green-400">อัพเดทแบบ Real-time</span>
                  </div>
                </div>

              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Performance indicator and last updated */}
              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                <div>อัพเดทล่าสุด: {lastUpdated.toLocaleTimeString('th-TH')}</div>
                {process.env.NODE_ENV === 'development' && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span>Cache: {performanceRef.current.cacheHits}H/{performanceRef.current.cacheMisses}M</span>
                  </div>
                )}
              </div>

              {/* Manual refresh button */}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg transition-colors disabled:opacity-50"
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
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">ผู้เติมเงิน</th>
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
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                        <span className="ml-2 text-gray-500 dark:text-gray-400">
                          {teamsLoading ? 'กำลังโหลดข้อมูลทีม...' : 'กำลังโหลดประวัติการเติมเงิน...'}
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
                ) : getFilteredHistory().length === 0 ? (
                  <tr>
                    <td colSpan={teams.length > 1 ? 7 : 6} className="py-8 text-center">
                      <div className="text-gray-500 dark:text-gray-400">
                        <CurrencyDollarIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>ไม่พบประวัติการเติมเงิน</p>
                        <p className="text-sm">ยังไม่มีการเติมเงินในระบบ</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  getFilteredHistory().map((record) => (
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
                          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                            <span className="text-white text-xs font-bold">
                              {(record.topupBy || 'ผู้ใช้').charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {record.topupBy || 'ผู้ใช้ไม่ระบุ'}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              @{record.topupByUsername || record.topupByEmail?.split('@')[0] || (record.topupByUid ? record.topupByUid.substring(0, 8) : 'user')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="space-y-1">
                          <div className="font-bold text-green-600 dark:text-green-400">
                            +฿{record.amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                              <svg className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              {/* Pagination Info */}
              <div className="text-sm text-gray-600 dark:text-gray-400">
                แสดงรายการ {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalItems)} จาก {totalItems.toLocaleString()} รายการ
              </div>

              {/* Pagination Controls */}
              <div className="flex items-center gap-2">
                {/* Previous Button */}
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1 || loading || refreshing}
                  className="flex items-center gap-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ← ก่อนหน้า
                </button>

                {/* Page Numbers */}
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
                              ? 'bg-blue-500 text-white font-medium'
                              : 'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {page}
                        </button>
                      )}
                    </React.Fragment>
                  ))}
                </div>

                {/* Next Button */}
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages || loading || refreshing}
                  className="flex items-center gap-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ถัดไป →
                </button>
              </div>

              {/* Items per page selector */}
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
                    loadTopupHistory(true, 1);
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

          {/* Loading indicator for pagination */}
          {(loading || refreshing) && (
            <div className="mt-4 text-center">
              <div className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                {refreshing ? 'กำลังรีเฟรชข้อมูล...' : 'กำลังโหลดหน้าถัดไป...'}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
} 