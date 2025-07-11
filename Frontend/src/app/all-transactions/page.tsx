'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useUserProfile } from '../../contexts/UserContext';
import { usePermission } from '../../hooks/usePermission';
import { useMultiTeam } from '../../hooks/useMultiTeam';
import { collection, query, where, orderBy, getDocs, limit, startAfter, Query, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import DashboardLayout from '../../components/DashboardLayout';
// Removed VirtualScrollTable import - now using regular HTML table
import { toast } from 'react-hot-toast';

interface BotTransaction {
  id: string;
  transactionId: string;
  customerUsername: string;
  websiteName: string;
  websiteId?: string;
  bankName: string;
  accountNumber: string;
  realName: string;
  amount: number;
  status: string;
  type: string;
  teamId: string;
  teamName: string;
  balanceBefore?: number;
  balanceAfter?: number;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  note?: string;
  lastModifiedBy?: string;
  lastModifiedByEmail?: string;
  lastModifiedAt?: any;
}

// Enhanced status configuration with better organization
const statusConfig: { [key: string]: {
  label: string;
  color: string;
  icon: string;
  priority: number;
  group: string;
} } = {
  'รอโอน': {
    label: 'รอโอน',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    icon: '⏳',
    priority: 1,
    group: 'pending'
  },
  'กำลังโอน': {
    label: 'กำลังโอน',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    icon: '🔄',
    priority: 2,
    group: 'processing'
  },
  'สำเร็จ': {
    label: 'สำเร็จ',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    icon: '✅',
    priority: 3,
    group: 'completed'
  },
  'ยกเลิก': {
    label: 'ยกเลิก',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    icon: '❌',
    priority: 4,
    group: 'cancelled'
  },
  'ล้มเหลว': {
    label: 'ล้มเหลว',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    icon: '⚠️',
    priority: 5,
    group: 'failed'
  }
};

// Legacy status colors for backward compatibility
const statusColors: { [key: string]: string } = Object.fromEntries(
  Object.entries(statusConfig).map(([key, config]) => [key, config.color])
);

// Helper function to get local date string (avoiding timezone issues)
const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function BotTransactionsPage() {
  const { user } = useAuth();
  const { userProfile } = useUserProfile();
  const { hasPermission, isUser } = usePermission();
  const { teams, loading: teamsLoading, error: teamsError } = useMultiTeam();
  
  // Teams data loaded - removed debug logging

  const [transactions, setTransactions] = useState<BotTransaction[]>([]);
  const [loading, setLoading] = useState(false); // เปลี่ยนจาก true เป็น false
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<'all' | string>('all');
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString()); // YYYY-MM-DD format
  const [showModifiedOnly, setShowModifiedOnly] = useState(false); // เพิ่ม state สำหรับกรองรายการที่ถูกแก้ไขสถานะ
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [showAllData, setShowAllData] = useState(true);
  const [isDataLoaded, setIsDataLoaded] = useState(false); // เพิ่ม state เพื่อเช็คว่าข้อมูลถูกโหลดแล้วหรือไม่

  // Pagination states - Traditional pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  
  // Load more functionality
  const [hasMoreData, setHasMoreData] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // Progress tracking
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
  
  // Use refs for values that shouldn't trigger re-renders
  const isLoadingRef = useRef(false);
  
  // Performance monitoring
  const performanceRef = useRef<{
    loadStartTime: number;
    totalQueryTime: number;
    cacheHits: number;
    cacheMisses: number;
    loadEndTime?: number;
  }>({
    loadStartTime: 0,
    totalQueryTime: 0,
    cacheHits: 0,
    cacheMisses: 0
  });

  // ลบ Real-time listener ref ที่ไม่ใช้แล้ว
  // const unsubscribeRef = useRef<(() => void) | null>(null);

  // Optimized loading function with proper server-side pagination
  const loadTransactions = useCallback(async (forceRefresh = false) => {
    if (!user || !userProfile || teamsLoading) {
      return;
    }

    // Prevent multiple concurrent requests
    if (isLoadingRef.current && !forceRefresh) {
      return;
    }

    try {
      isLoadingRef.current = true;
      performanceRef.current.loadStartTime = performance.now();
      
      if (forceRefresh) {
        setRefreshing(true);
        setTransactions([]);
        setCurrentPage(1);
        setHasMoreData(false); // No need for load more since we show all data
        setLoadingProgress({ current: 0, total: 0 });
      } else {
        setLoading(true);
        setLoadingProgress({ current: 0, total: 0 });
      }

      const userTeamIds = teams.map(team => team.id);
      
      // If no teams, return early
      if (userTeamIds.length === 0) {
        setTransactions([]);
        setLoading(false);
        setRefreshing(false);
        setIsDataLoaded(true); // เซ็ตว่าข้อมูลถูกโหลดแล้ว
        isLoadingRef.current = false;
        return;
      }

      // Get selected date range (00:00:00 to 23:59:59)
      const selectedDateObj = new Date(selectedDate);
      const startOfDay = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate(), 0, 0, 0);
      const endOfDay = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate(), 23, 59, 59);

      setError(null);

      // ดึงเว็บไซต์ที่ isActive = true ของทีมที่ user เป็นสมาชิก
      const activeWebsitesQuery = query(
        collection(db, 'websites'),
        where('teamId', 'in', userTeamIds),
        where('isActive', '==', true)
      );
      const activeWebsitesSnapshot = await getDocs(activeWebsitesQuery);
      const activeWebsiteIds = activeWebsitesSnapshot.docs.map(doc => doc.id);

      // Use optimized query to fetch bot transactions specifically
      const queryStartTime = performance.now();
      
            let allTransactionDocs: any[] = [];
      setLoadingProgress({ current: 0, total: userTeamIds.length });
      
      for (let teamIndex = 0; teamIndex < userTeamIds.length; teamIndex++) {
        const teamId = userTeamIds[teamIndex];
        setLoadingProgress({ current: teamIndex, total: userTeamIds.length });
        let teamDocs: any[] = [];
        let hasMore = true;
        let lastDoc: any = null;
        let batchCount = 0;
        const maxBatches = showAllData ? 10 : 1; // Load up to 10 batches for all data (100,000 docs max)
        
        while (hasMore && batchCount < maxBatches) {
          try {
            // Try compound query with composite index first - filtered by selected date
            let teamQuery = query(
              collection(db, 'transactions'),
              where('teamId', '==', teamId),
              where('createdAt', '>=', startOfDay),
              where('createdAt', '<=', endOfDay),
              orderBy('createdAt', 'desc'),
              limit(10000) // Always use max limit per batch
            );

            // Add cursor for pagination if we have a last document
            if (lastDoc) {
              teamQuery = query(
                collection(db, 'transactions'),
                where('teamId', '==', teamId),
                where('createdAt', '>=', startOfDay),
                where('createdAt', '<=', endOfDay),
                orderBy('createdAt', 'desc'),
                startAfter(lastDoc),
                limit(10000)
              );
            }

            const teamSnapshot = await getDocs(teamQuery);
            const docs = teamSnapshot.docs;
            
            if (docs.length === 0) {
              hasMore = false;
            } else {
              teamDocs.push(...docs);
              lastDoc = docs[docs.length - 1];
              batchCount++;
              
              // If we got less than the limit, we've reached the end
              if (docs.length < 10000) {
                hasMore = false;
              }
              
              // For limited mode, stop after first batch
              if (!showAllData) {
                hasMore = false;
              }
            }
          } catch (error) {
            console.warn(`Compound query failed for team ${teamId} batch ${batchCount}, trying fallback:`, error);
            
            // Fallback: Use simple query without orderBy if compound query fails - filtered by selected date
            try {
              let fallbackQuery = query(
                collection(db, 'transactions'),
                where('teamId', '==', teamId),
                where('createdAt', '>=', startOfDay),
                where('createdAt', '<=', endOfDay),
                limit(10000)
              );

              const fallbackSnapshot = await getDocs(fallbackQuery);
              teamDocs.push(...fallbackSnapshot.docs);
              console.log(`✅ Fallback query succeeded for team ${teamId}`);
              hasMore = false; // Don't try more batches for fallback
            } catch (fallbackError) {
              console.error(`Both queries failed for team ${teamId}:`, fallbackError);
              hasMore = false;
            }
          }
        }
        
        allTransactionDocs.push(...teamDocs);
        console.log(`📊 Loaded ${teamDocs.length} documents for team ${teamId} in ${batchCount} batches`);
      }

      // Data is already sorted by createdAt desc from query
      const teamsSnapshot = await getDocs(collection(db, 'teams'));
      
      performanceRef.current.totalQueryTime += performance.now() - queryStartTime;

      // Create efficient lookup maps
      const teamsMap = new Map();
      teamsSnapshot.docs.forEach(doc => {
        teamsMap.set(doc.id, doc.data());
      });

      // Process all documents and filter for bot transactions
      const allTransactions = allTransactionDocs
        .filter(doc => {
          const data = doc.data();
          // กรองเฉพาะธุรกรรมที่ websiteId อยู่ในเว็บไซต์ที่ isActive = true
          return data.type === 'withdraw' && 
                 data.createdBy === 'api' && 
                 data.websiteId && 
                 activeWebsiteIds.includes(data.websiteId);
        })
        .map(doc => {
          const data = doc.data() as any;
          
          // Get team info from map
          let teamName = 'ไม่ระบุทีม';
          if (data.teamId && teamsMap.has(data.teamId)) {
            const teamData = teamsMap.get(data.teamId);
            teamName = teamData.name || `ทีม ${data.teamId.substring(0, 8)}`;
          } else if (data.teamId) {
            teamName = `ทีม ${data.teamId.substring(0, 8)}`;
          }
          
          return {
            id: doc.id,
            ...data,
            teamName
          } as BotTransaction;
        });

      // Sort all transactions by createdAt desc (newest first)
      allTransactions.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt);
        const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt);
        return bTime.getTime() - aTime.getTime();
      });

      // Filter based on user role and permissions
      let filteredRecords: BotTransaction[];
      
      if (userProfile.role === 'admin') {
        filteredRecords = allTransactions.filter(record => 
          record.teamId && userTeamIds.includes(record.teamId)
        );
      } else if (userProfile.role === 'manager') {
        filteredRecords = allTransactions.filter(record => 
          record.teamId && userTeamIds.includes(record.teamId)
        );
      } else {
        filteredRecords = allTransactions.filter(record => 
          record.teamId && userTeamIds.includes(record.teamId)
        );
      }

      // Store all filtered records for client-side pagination
      setTransactions(filteredRecords);

      // Reset loading progress
      setLoadingProgress({ current: userTeamIds.length, total: userTeamIds.length });

      // Since we're loading all available data in batches, no need for "load more"
      setHasMoreData(false);

      setLastUpdated(new Date());
      setIsDataLoaded(true); // เซ็ตว่าข้อมูลถูกโหลดแล้ว
      
      // Performance logging
      performanceRef.current.loadEndTime = performance.now();
      const totalTime = performanceRef.current.loadEndTime - performanceRef.current.loadStartTime;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('📊 Transaction Loading Stats:');
        console.log(`⏱️  Total time: ${totalTime.toFixed(2)}ms`);
        console.log(`🔥 Query time: ${performanceRef.current.totalQueryTime.toFixed(2)}ms`);
        console.log(`📦 Final results: ${filteredRecords.length} bot transactions`);
      }
      
    } catch (err) {
      console.error('Error loading bot transactions:', err);
      setError('ไม่สามารถโหลดข้อมูลธุรกรรมได้');
      toast.error('ไม่สามารถโหลดข้อมูลธุรกรรมได้');
    } finally {
      setLoading(false);
      setRefreshing(false);
      isLoadingRef.current = false;
    }
  }, [user, userProfile, teams, teamsLoading, selectedDate, showAllData]);

  // Removed loadMoreTransactions - now using pagination

  // Initial load and team changes - comment out to disable auto-loading
  // useEffect(() => {
  //   if (!teamsLoading && user && userProfile && teams.length > 0) {
  //     loadTransactions(true);
  //   }
  // }, [loadTransactions, teamsLoading, user, userProfile, teams]);

  // ลบ Real-time listener ออกทั้งหมด
  // useEffect(() => {
  //   // Real-time listener for new bot transactions
  //   if (!user || !userProfile || teamsLoading || !isDataLoaded) return;
  //   ...
  // }, [user, userProfile, teamsLoading, teams, loadTransactions, selectedDate, isDataLoaded]);

  // ลบ cleanup useEffect ที่เกี่ยวข้อง
  // useEffect(() => {
  //   return () => {
  //     if (unsubscribeRef.current) {
  //       unsubscribeRef.current();
  //     }
  //   };
  // }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, selectedTeamFilter]);

  const handleRefresh = () => {
    loadTransactions(true);
  };

  // เพิ่มฟังก์ชันสำหรับการค้นหา
  const handleSearch = () => {
    loadTransactions(true);
  };

  // Load more data function
  const loadMoreData = useCallback(async () => {
    if (!user || !userProfile || teamsLoading || loadingMore || !hasMoreData) {
      return;
    }

    try {
      setLoadingMore(true);
      const userTeamIds = teams.map(team => team.id);
      
      // Get selected date range (00:00:00 to 23:59:59)
      const selectedDateObj = new Date(selectedDate);
      const startOfDay = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate(), 0, 0, 0);
      const endOfDay = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate(), 23, 59, 59);
      
      let additionalDocs: any[] = [];
      
      // Get the last transaction's timestamp for cursor-based pagination
      const lastTransaction = transactions[transactions.length - 1];
      const lastTimestamp = lastTransaction?.createdAt;

      for (const teamId of userTeamIds) {
        try {
          // Try compound query with composite index first - filtered by selected date
          let teamQuery = query(
            collection(db, 'transactions'),
            where('teamId', '==', teamId),
            where('createdAt', '>=', startOfDay),
            where('createdAt', '<=', endOfDay),
            orderBy('createdAt', 'desc'),
            startAfter(lastTimestamp),
            limit(1000)
          );

          const teamSnapshot = await getDocs(teamQuery);
          additionalDocs.push(...teamSnapshot.docs);
        } catch (error) {
          console.warn(`Compound query failed for team ${teamId} loadMore, trying fallback:`, error);
          
          // Fallback: Use simple query without orderBy and startAfter - filtered by selected date
          try {
            let fallbackQuery = query(
              collection(db, 'transactions'),
              where('teamId', '==', teamId),
              where('createdAt', '>=', startOfDay),
              where('createdAt', '<=', endOfDay),
              limit(1000)
            );

            const fallbackSnapshot = await getDocs(fallbackQuery);
            // Filter out documents we already have (basic deduplication)
            const newDocs = fallbackSnapshot.docs.filter(doc => 
              !transactions.some(existing => existing.id === doc.id)
            );
            additionalDocs.push(...newDocs);
            console.log(`✅ Fallback loadMore query succeeded for team ${teamId}`);
          } catch (fallbackError) {
            console.error(`Both loadMore queries failed for team ${teamId}:`, fallbackError);
          }
        }
      }

      // Filter and process additional data
      const additionalTransactions = additionalDocs
        .filter(doc => {
          const data = doc.data();
          return data.type === 'withdraw' && data.createdBy === 'api';
        })
        .map(doc => {
          const data = doc.data() as any;
          
          // Get team name
          const team = teams.find(t => t.id === data.teamId);
          const teamName = team?.name || `ทีม ${data.teamId?.substring(0, 8) || 'ไม่ระบุ'}`;
          
          return {
            id: doc.id,
            ...data,
            teamName
          } as BotTransaction;
        });

      // Sort new data
      additionalTransactions.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt);
        const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt);
        return bTime.getTime() - aTime.getTime();
      });

      // Filter based on user permissions
      const filteredAdditionalRecords = additionalTransactions.filter(record => 
        record.teamId && userTeamIds.includes(record.teamId)
      );

      // Append to existing transactions
      setTransactions(prev => [...prev, ...filteredAdditionalRecords]);
      
      // Check if we have more data (if we got less than requested, we've reached the end)
      setHasMoreData(additionalDocs.length >= userTeamIds.length * 1000);

    } catch (error) {
      console.error('Error loading more data:', error);
      toast.error('ไม่สามารถโหลดข้อมูลเพิ่มเติมได้');
    } finally {
      setLoadingMore(false);
    }
  }, [user, userProfile, teams, teamsLoading, transactions, loadingMore, hasMoreData, selectedDate]);

  // Remove load all data function since we always show all data



  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    
    let date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      date = new Date(timestamp);
    }
    
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Bank name mapping function
  const getBankDisplayName = (bankCode: string) => {
    const bankMapping: { [key: string]: string } = {
      'kbank': 'กสิกร',
      'scb': 'ไทยพานิชย์',
      'bbl': 'กรุงเทพ',
      'ktb': 'กรุงไทย',
      'ttb': 'ทหารไทยธนชาต',
      'bay': 'กรุงศรีอยุธยา',
      'gsb': 'ออมสิน',
      'uob': 'ยูโอบี',
      'baac': 'ธกส',
      'cimb': 'ซีไอเอ็มบี',
      'gh': 'อาคารสงเคราะห์',
      'kkp': 'เกียรตินาคิน',
      'lh': 'แลนด์แอนด์เฮ้าส์'
    };
    
    return bankMapping[bankCode.toLowerCase()] || bankCode;
  };

  // Filter and sort transactions for display (client-side filtering for search/status)
  const getFilteredTransactions = () => {
    let filtered = transactions.filter(transaction => {
      // Search filter
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        transaction.transactionId.toLowerCase().includes(searchLower) ||
        transaction.customerUsername.toLowerCase().includes(searchLower) ||
        transaction.websiteName.toLowerCase().includes(searchLower) ||
        transaction.bankName.toLowerCase().includes(searchLower) ||
        getBankDisplayName(transaction.bankName).toLowerCase().includes(searchLower) ||
        transaction.realName.toLowerCase().includes(searchLower);

      // Status filter
      const matchesStatus = statusFilter === 'all' || transaction.status === statusFilter;

      // Team filter
      const matchesTeam = selectedTeamFilter === 'all' || transaction.teamId === selectedTeamFilter;

      // Modified filter - แสดงเฉพาะรายการที่ถูกแก้ไขสถานะ
      const matchesModified = !showModifiedOnly || 
        (transaction.lastModifiedBy && transaction.lastModifiedBy.trim() !== '') ||
        (transaction.lastModifiedByEmail && transaction.lastModifiedByEmail.trim() !== '') ||
        (transaction.lastModifiedAt && transaction.lastModifiedAt !== null);

      return matchesSearch && matchesStatus && matchesTeam && matchesModified;
    });

    // Sort by created date (newest first) - รายการที่สร้างล่าสุดอยู่ด้านบน
    filtered.sort((a, b) => {
      const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt);
      const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt);
      return bTime.getTime() - aTime.getTime();
    });

    return filtered;
  };

  const filteredTransactions = getFilteredTransactions();

  if (teamsLoading) {
    return (
      <DashboardLayout title="ธุรกรรม Bot API" subtitle="กำลังโหลด...">
        <div className="flex justify-center items-center h-64 animate-fade-in">
          <div className="text-center">
            <div className="relative mb-4">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 dark:border-gray-600 dark:border-t-blue-400 mx-auto"></div>
              <div className="absolute inset-0 rounded-full border-4 border-blue-400 opacity-20 animate-ping"></div>
            </div>
            <p className="text-gray-500 dark:text-gray-400 animate-fade-in-delay">กำลังโหลดข้อมูลทีม...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout title="ธุรกรรม Bot API" subtitle="กรุณาเข้าสู่ระบบ">
        <div className="text-center text-red-600 animate-fade-in">
          <div className="py-16">
            <svg className="h-12 w-12 mx-auto mb-4 opacity-50 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="text-lg font-semibold animate-fade-in-delay">กรุณาเข้าสู่ระบบเพื่อใช้งาน</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (teams.length === 0 && !teamsLoading) {
    return (
      <DashboardLayout title="ธุรกรรม Bot API" subtitle="ไม่พบทีม">
        <div className="text-center text-gray-500 animate-fade-in">
          <div className="py-16">
            <svg className="h-12 w-12 mx-auto mb-4 opacity-50 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 715.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-lg font-semibold animate-fade-in-delay">ไม่พบทีมที่เข้าร่วม</p>
            <p className="text-sm animate-fade-in-delay-2">คุณยังไม่ได้เป็นสมาชิกของทีมใดๆ</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="ธุรกรรม Bot API" 
      subtitle="รายการธุรกรรมการถอนเงินที่สร้างผ่าน API"
    >
      <div className="space-y-6 lg:space-y-8">

        {/* Enhanced Stats Cards with Status Groups */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4 mb-8">
          {/* Pending Status */}
          <div className="bg-gradient-to-r from-yellow-500 to-orange-500 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-lg">⏳</span>
                  <p className="text-yellow-100 text-sm font-medium">รอโอน</p>
                </div>
                <p className="text-2xl font-bold">
                  {transactions.filter(t => t.status === 'รอโอน').length}
                </p>
              </div>
            </div>
          </div>

          {/* Processing Status */}
          <div className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-lg">🔄</span>
                  <p className="text-blue-100 text-sm font-medium">กำลังโอน</p>
                </div>
                <p className="text-2xl font-bold">
                  {transactions.filter(t => t.status === 'กำลังโอน').length}
                </p>
              </div>
            </div>
          </div>

          {/* Success Status */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-lg">✅</span>
                  <p className="text-green-100 text-sm font-medium">สำเร็จ</p>
                </div>
                <p className="text-2xl font-bold">
                  {transactions.filter(t => t.status === 'สำเร็จ').length}
                </p>
              </div>
            </div>
          </div>

          {/* Failed/Cancelled Status */}
          <div className="bg-gradient-to-r from-gray-500 to-gray-600 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-lg">❌</span>
                  <p className="text-gray-100 text-sm font-medium">ยกเลิก/ล้มเหลว</p>
                </div>
                <p className="text-2xl font-bold">
                  {transactions.filter(t => ['ยกเลิก', 'ล้มเหลว'].includes(t.status)).length}
                </p>
              </div>
            </div>
          </div>

          {/* Modified Status Card */}
          <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-lg">🔧</span>
                  <p className="text-orange-100 text-sm font-medium">ถูกแก้ไขสถานะ</p>
                </div>
                <p className="text-2xl font-bold">
                  {transactions.filter(t => 
                    (t.lastModifiedBy && t.lastModifiedBy.trim() !== '') ||
                    (t.lastModifiedByEmail && t.lastModifiedByEmail.trim() !== '') ||
                    (t.lastModifiedAt && t.lastModifiedAt !== null)
                  ).length}
                </p>
              </div>
            </div>
          </div>

          {/* Total */}
          <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-lg">💰</span>
                  <p className="text-purple-100 text-sm font-medium">
                    ยอดรวมทั้งหมด
                  </p>
                </div>
                                  <p className="text-xl font-bold">
                    ฿{formatAmount(transactions.reduce((sum, t) => sum + t.amount, 0))}
                  </p>
                  <p className="text-xs text-purple-200 mt-1">
                    จาก {transactions.length} รายการ
                  </p>
              </div>
            </div>
          </div>

          {/* Cancelled/Failed Amount */}
          <div className="bg-gradient-to-r from-red-500 to-pink-600 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-lg">💸</span>
                  <p className="text-red-100 text-sm font-medium">
                    ยอดยกเลิก/ล้มเหลว
                  </p>
                </div>
                <p className="text-xl font-bold">
                  ฿{formatAmount(transactions.filter(t => ['ยกเลิก', 'ล้มเหลว'].includes(t.status)).reduce((sum, t) => sum + t.amount, 0))}
                </p>
                <p className="text-xs text-red-200 mt-1">
                  {transactions.filter(t => ['ยกเลิก', 'ล้มเหลว'].includes(t.status)).length} รายการ
                </p>
              </div>
            </div>
          </div>

          {/* Total Transactions */}
          <div className="bg-gradient-to-r from-teal-500 to-cyan-600 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-lg">📊</span>
                  <p className="text-teal-100 text-sm font-medium">
                    รายการทั้งหมด
                  </p>
                </div>
                <p className="text-2xl font-bold">
                  {transactions.length}
                </p>
                <p className="text-xs text-teal-200 mt-1">
                  ธุรกรรม Bot API
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/30 dark:border-gray-700/30 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="ค้นหา Transaction ID, Customer, เว็บไซต์..."
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              {/* Date picker */}
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  วันที่:
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                {selectedDate !== getLocalDateString() && (
                  <button
                    onClick={() => setSelectedDate(getLocalDateString())}
                    className="px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded transition-colors"
                    title="กลับไปวันนี้"
                  >
                    วันนี้
                  </button>
                )}
              </div>

              {/* Items per page */}
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  แสดง:
                </label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value={25}>25 รายการ</option>
                  <option value={50}>50 รายการ</option>
                  <option value={100}>100 รายการ</option>
                  <option value={200}>200 รายการ</option>
                </select>
              </div>

              {/* Team Filter */}
              {teams.length > 1 && (
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    ทีม:
                  </label>
                  <select
                    value={selectedTeamFilter}
                    onChange={(e) => setSelectedTeamFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="all">ทุกทีม ({teams.length})</option>
                    {teams.map(team => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({transactions.filter(t => t.teamId === team.id).length})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Status Filter with organized groups */}
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  สถานะ:
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="all">สถานะทั้งหมด</option>
                  <optgroup label="🔄 รอดำเนินการ">
                    <option value="รอโอน">⏳ รอโอน ({transactions.filter(t => t.status === 'รอโอน').length})</option>
                    <option value="กำลังโอน">🔄 กำลังโอน ({transactions.filter(t => t.status === 'กำลังโอน').length})</option>
                  </optgroup>
                  <optgroup label="✅ เสร็จสิ้น">
                    <option value="สำเร็จ">✅ สำเร็จ ({transactions.filter(t => t.status === 'สำเร็จ').length})</option>
                  </optgroup>
                  <optgroup label="❌ ยกเลิก/ล้มเหลว">
                    <option value="ยกเลิก">❌ ยกเลิก ({transactions.filter(t => t.status === 'ยกเลิก').length})</option>
                    <option value="ล้มเหลว">⚠️ ล้มเหลว ({transactions.filter(t => t.status === 'ล้มเหลว').length})</option>
                  </optgroup>
                </select>
              </div>

              {/* Modified Filter - แสดงเฉพาะรายการที่ถูกแก้ไขสถานะ */}
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  รายการที่แก้ไข:
                </label>
                <div className="relative">
                  <select
                    value={showModifiedOnly ? 'modified' : 'all'}
                    onChange={(e) => setShowModifiedOnly(e.target.value === 'modified')}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="all">ทั้งหมด</option>
                    <option value="modified">🔧 ที่ถูกแก้ไขสถานะ ({transactions.filter(t => 
                      (t.lastModifiedBy && t.lastModifiedBy.trim() !== '') ||
                      (t.lastModifiedByEmail && t.lastModifiedByEmail.trim() !== '') ||
                      (t.lastModifiedAt && t.lastModifiedAt !== null)
                    ).length})</option>
                  </select>
                  {showModifiedOnly && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div>
                  )}
                </div>
              </div>

              {/* Enhanced Clear Filters Button */}
              {(searchTerm || statusFilter !== 'all' || selectedTeamFilter !== 'all' || selectedDate !== getLocalDateString() || showModifiedOnly) && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setSelectedTeamFilter('all');
                    setSelectedDate(getLocalDateString());
                    setShowModifiedOnly(false);
                    setCurrentPage(1);
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  ล้างตัวกรอง
                </button>
              )}

              {/* เพิ่มปุ่มค้นหา */}
              <button
                onClick={handleSearch}
                disabled={loading || refreshing}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className={`w-4 h-4 ${loading || refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {loading || refreshing ? (
                    <circle cx="12" cy="12" r="10" strokeWidth={2} className="opacity-25" />
                  ) : null}
                  {loading || refreshing ? (
                    <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" strokeWidth={2} />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  )}
                </svg>
                <span className={loading || refreshing ? 'animate-pulse' : ''}>
                  {loading || refreshing ? 'กำลังค้นหา...' : 'ค้นหา'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/30 dark:border-gray-700/30 p-6">
          {loading || refreshing ? (
            <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
              <div className="relative mb-6">
                {/* นาฬิกาทรายหมุน */}
                <div className="animate-spin text-6xl text-blue-600 dark:text-blue-400">
                  ⏳
                </div>
                {/* เพิ่ม pulse effect รอบ */}
                <div className="absolute inset-0 rounded-full border-4 border-blue-400 opacity-20 animate-ping"></div>
                <div className="absolute inset-2 rounded-full border-2 border-blue-500 opacity-10 animate-ping" style={{ animationDelay: '0.5s' }}></div>
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-lg font-medium animate-fade-in-delay">
                กำลังโหลดข้อมูลธุรกรรม...
              </p>
              {/* เพิ่มข้อความเพิ่มเติมเมื่อมี progress */}
              {loadingProgress.total > 0 && (
                <div className="mt-4 text-center animate-fade-in-delay-2">
                  <div className="text-sm text-gray-400 dark:text-gray-500 mb-2">
                    โหลดทีม {loadingProgress.current + 1} จาก {loadingProgress.total} ทีม
                  </div>
                  {/* Progress bar */}
                  <div className="w-64 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mx-auto">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${((loadingProgress.current + 1) / loadingProgress.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
              {transactions.length > 0 && (
                <div className="mt-3 text-sm text-blue-600 dark:text-blue-400 animate-pulse">
                  พบข้อมูลแล้ว {transactions.length} รายการ
                </div>
              )}
            </div>
          ) : error ? (
            <div className="text-center py-16 animate-fade-in">
              <div className="text-red-500 mb-4">
                <svg className="h-12 w-12 mx-auto mb-2 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-lg font-semibold animate-fade-in-delay">เกิดข้อผิดพลาด</p>
                <p className="text-sm animate-fade-in-delay-2">{error}</p>
              </div>
              <button
                onClick={() => loadTransactions(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors animate-fade-in-delay-2"
              >
                ลองใหม่
              </button>
            </div>
          ) : !isDataLoaded ? (
            // แสดงข้อความเมื่อยังไม่ได้ค้นหาข้อมูล พร้อมอนิเมชั่น
            <div className="text-center py-16 animate-fade-in">
              <div className="text-gray-500 dark:text-gray-400">
                <div className="relative inline-block mb-6">
                  <svg className="h-16 w-16 mx-auto opacity-50 animate-search-icon-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {/* เพิ่ม ripple effect */}
                  <div className="absolute inset-0 rounded-full animate-ping bg-blue-400 opacity-20"></div>
                  <div className="absolute inset-2 rounded-full animate-ping bg-blue-500 opacity-10" style={{ animationDelay: '0.5s' }}></div>
                </div>
                <p className="text-xl font-semibold mb-3 animate-fade-in-delay text-gray-700 dark:text-gray-300">
                  ยังไม่มีข้อมูลที่แสดง
                </p>
                <p className="text-sm mb-6 animate-fade-in-delay text-gray-600 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
                  กรุณาตั้งค่าตัวกรองข้อมูล และกดปุ่ม <span className="font-medium text-blue-600 dark:text-blue-400">"ค้นหา"</span> เพื่อโหลดข้อมูลธุรกรรม
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-blue-600 dark:text-blue-400 animate-fade-in-delay-2 bg-blue-50 dark:bg-blue-900/20 px-4 py-2 rounded-full max-w-sm mx-auto">
                  <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>ใช้ตัวกรองเพื่อจำกัดผลการค้นหา</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      ธุรกรรม Bot API - วันที่ {new Date(selectedDate).toLocaleDateString('th-TH', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </h3>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        รายการธุรกรรมการถอนเงินที่สร้างผ่าน API ในวันที่เลือกเท่านั้น
                      </p>
                      {/* ลบข้อความ Real-time */}
                      {/* <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs text-green-600 dark:text-green-400">อัพเดทแบบ Real-time</span>
                      </div> */}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Last updated info */}
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <div>อัพเดทล่าสุด: {lastUpdated.toLocaleTimeString('th-TH')}</div>
                    {process.env.NODE_ENV === 'development' && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span>Cache: {performanceRef.current.cacheHits}H/{performanceRef.current.cacheMisses}M</span>
                      </div>
                    )}
                  </div>

                  {/* Removed Show All Data Toggle - always show all data */}

                  {/* Manual refresh button */}
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {refreshing ? (
                        <>
                          <circle cx="12" cy="12" r="10" strokeWidth={2} className="opacity-25" />
                          <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" strokeWidth={2} />
                        </>
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      )}
                    </svg>
                    <span className={refreshing ? 'animate-pulse' : ''}>
                      {refreshing ? 'กำลังรีเฟรช...' : 'รีเฟรช'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">อัพเดทล่าสุด*</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">ID</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Customer</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">เว็บไซต์</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">ธนาคาร</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">เลขบัญชี</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white w-40 max-w-40">ชื่อจริง</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-900 dark:text-white">จำนวนเงิน</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(loading || refreshing) && transactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-16 text-center">
                          <div className="flex flex-col items-center justify-center animate-fade-in">
                            <div className="relative mb-4">
                              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 dark:border-gray-600 dark:border-t-blue-400"></div>
                              {/* เพิ่ม pulse effect รอบ spinner */}
                              <div className="absolute inset-0 rounded-full border-2 border-blue-400 opacity-20 animate-ping"></div>
                            </div>
                            <span className="text-gray-500 dark:text-gray-400 text-center font-medium animate-fade-in-delay">
                              กำลังโหลดข้อมูลธุรกรรม...
                            </span>
                            {loadingProgress.total > 0 && (
                              <div className="mt-3 text-xs text-gray-400 animate-fade-in-delay-2">
                                โหลดทีม {loadingProgress.current + 1} จาก {loadingProgress.total} ทีม
                              </div>
                            )}
                            {transactions.length > 0 && (
                              <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 animate-pulse">
                                พบข้อมูลแล้ว {transactions.length} รายการ
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : teams.length === 0 && !teamsLoading ? (
                      <tr>
                        <td colSpan={9} className="py-16 text-center">
                          <div className="text-gray-500 dark:text-gray-400 animate-fade-in">
                            <svg className="h-12 w-12 mx-auto mb-2 opacity-50 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 715.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <p className="animate-fade-in-delay">ไม่พบทีมที่เข้าร่วม</p>
                            <p className="text-sm animate-fade-in-delay-2">คุณยังไม่ได้เป็นสมาชิกของทีมใดๆ</p>
                          </div>
                        </td>
                      </tr>
                    ) : filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-16 text-center">
                          <div className="text-gray-500 dark:text-gray-400 animate-fade-in">
                            <svg className="h-12 w-12 mx-auto mb-2 opacity-50 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <p className="animate-fade-in-delay">ไม่พบธุรกรรม Bot API ในวันที่เลือก</p>
                            <p className="text-sm animate-fade-in-delay-2">ไม่มีการสร้างธุรกรรมผ่าน API ในวันที่เลือก</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((transaction, index) => (
                        <tr key={transaction.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200">
                          <td className="py-4 px-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {formatDate(transaction.updatedAt || transaction.createdAt)}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="text-sm font-mono text-blue-600 dark:text-blue-400 font-medium">
                              {transaction.transactionId}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {transaction.customerUsername}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {transaction.websiteName}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="text-sm text-gray-700 dark:text-gray-300">
                              {getBankDisplayName(transaction.bankName)}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="text-sm font-mono text-gray-700 dark:text-gray-300">
                              {transaction.accountNumber}
                            </div>
                          </td>
                          <td className="py-4 px-4 w-40 max-w-40">
                            <div className="text-sm text-gray-900 dark:text-white truncate" title={transaction.realName}>
                              {transaction.realName}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <div className="text-sm font-bold text-red-600 dark:text-red-400">
                              -฿{formatAmount(transaction.amount)}
                            </div>
                            {transaction.balanceAfter !== undefined && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                (฿{formatAmount(transaction.balanceAfter)})
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-4 text-left">
                            <div className="flex items-center gap-2">
                              {/* Enhanced status display with icon and better organization */}
                              <div className="flex items-center gap-1">
                                <span className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-full ${statusConfig[transaction.status]?.color || statusColors[transaction.status] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                                  <span className="text-xs">{statusConfig[transaction.status]?.icon || '📋'}</span>
                                  {statusConfig[transaction.status]?.label || transaction.status}
                                </span>
                              </div>
                              
                                            {/* Notes indicator */}
              {(transaction.note || transaction.lastModifiedBy) && (
                <div className="relative group h-4 w-4 flex-shrink-0 bg-red-500 rounded-full flex items-center justify-center cursor-help">
                  <span className="text-white text-xs font-bold">!</span>
                                  
                                                    {/* Compact tooltip with text wrapping */}
                  <div className={`absolute ${index < 3 ? 'right-full top-0 mr-2' : 'bottom-full right-0 mb-2'} px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none max-w-xs z-30 shadow-lg`}>
                    <div className="space-y-2">
                      <div>
                        <div className="text-yellow-300 font-medium">หมายเหตุ:</div>
                        <div className="text-gray-200 dark:text-gray-300 break-words">
                          {transaction.note && transaction.note.length > 100 
                            ? `${transaction.note.substring(0, 100)}...` 
                            : (transaction.note || 'ไม่มีหมายเหตุ')
                          }
                        </div>
                      </div>
                      {transaction.lastModifiedBy && (
                        <div className="border-t border-gray-600 pt-2">
                          <div className="text-blue-300 font-medium">แก้ไขโดย:</div>
                          <div className="text-gray-200 break-words">
                            {transaction.lastModifiedBy.length > 30 
                              ? `${transaction.lastModifiedBy.substring(0, 30)}...` 
                              : transaction.lastModifiedBy
                            }
                          </div>
                          {transaction.lastModifiedAt && (
                            <div className="text-gray-400 text-xs mt-1">
                              {formatDate(transaction.lastModifiedAt)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
                            </div>
                          </td>

                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Load More Button */}
              {hasMoreData && !(loading || refreshing) && transactions.length > 0 && !showAllData && (
                <div className="mt-6 text-center">
                  <button
                    onClick={loadMoreData}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingMore ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                        <span className="animate-pulse">กำลังโหลดข้อมูลเพิ่มเติม...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        โหลดข้อมูลเพิ่มเติม
                      </>
                    )}
                  </button>
                                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      กำลังแสดง {transactions.length} รายการ (ทั้งหมด)
                    </p>
                </div>
              )}

              {/* Show all data info - removed since we always show all data */}

              {/* Pagination */}
              {Math.ceil(filteredTransactions.length / itemsPerPage) > 1 && (
                <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <div className="flex items-center gap-2">
                      <span>แสดง {((currentPage - 1) * itemsPerPage) + 1} ถึง {Math.min(currentPage * itemsPerPage, filteredTransactions.length)} จาก {filteredTransactions.length} รายการ</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ก่อนหน้า
                    </button>
                    
                    <div className="flex items-center space-x-1">
                      {Array.from({ length: Math.min(Math.ceil(filteredTransactions.length / itemsPerPage), 7) }, (_, i) => {
                        const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
                        let page;
                        if (totalPages <= 7) {
                          page = i + 1;
                        } else if (currentPage <= 4) {
                          page = i + 1;
                        } else if (currentPage >= totalPages - 3) {
                          page = totalPages - 6 + i;
                        } else {
                          page = currentPage - 3 + i;
                        }
                        
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                              currentPage === page
                                ? 'bg-blue-600 text-white border border-blue-600'
                                : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      })}
                    </div>
                    
                    <button
                      onClick={() => setCurrentPage(Math.min(Math.ceil(filteredTransactions.length / itemsPerPage), currentPage + 1))}
                      disabled={currentPage === Math.ceil(filteredTransactions.length / itemsPerPage)}
                      className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>


      </div>
    </DashboardLayout>
  );
}