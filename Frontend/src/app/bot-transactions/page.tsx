'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useUserProfile } from '../../contexts/UserContext';
import { usePermission } from '../../hooks/usePermission';
import { useMultiTeam } from '../../hooks/useMultiTeam';
import { collection, query, where, orderBy, getDocs, onSnapshot, updateDoc, doc, limit, startAfter, Query, QuerySnapshot, DocumentData, addDoc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import DashboardLayout from '../../components/DashboardLayout';
// Removed VirtualScrollTable import - now using regular HTML table
import { toast } from 'react-hot-toast';

// Portal Modal Component
const PortalModal = ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) => {
  if (!isOpen) return null;
  
  return createPortal(
    children,
    document.body
  );
};

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

const statusOptions = [
  'รอโอน',
  'สำเร็จ',
  'ยกเลิก'
];

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
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<'all' | string>('all');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Modal states
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<BotTransaction | null>(null);
  const [modalStatus, setModalStatus] = useState('');
  const [modalNote, setModalNote] = useState('');

  // Pagination states - Traditional pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  
  // Load more functionality
  const [hasMoreData, setHasMoreData] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // Always show all data
  const showAllData = true;
  
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
  }>({
    loadStartTime: 0,
    totalQueryTime: 0,
    cacheHits: 0,
    cacheMisses: 0
  });

  // Real-time listener
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Add initial loading state to show user that data is being loaded
  const [initialLoading, setInitialLoading] = useState(true);

  // Add websites caching to avoid repeated queries
  const websitesCache = useRef<{
    data: { [teamId: string]: string[] };
    timestamp: number;
    ttl: number;
  }>({
    data: {},
    timestamp: 0,
    ttl: 5 * 60 * 1000 // 5 minutes cache
  });

  // Enhanced query batching
  const queryBatchSize = 10; // Process teams in batches for better performance

  // Optimized loading function with proper server-side pagination
  const loadTransactions = useCallback(async (forceRefresh = false) => {
    if (!user || !userProfile || teamsLoading) {
      return;
    }

    // Prevent multiple concurrent requests - stronger protection
    if (isLoadingRef.current && !forceRefresh) {
      console.log('🔄 Skipping load - already loading');
      return;
    }

    console.log('📥 Starting loadTransactions:', { forceRefresh, loading: isLoadingRef.current });

    try {
      isLoadingRef.current = true;
      performanceRef.current.loadStartTime = performance.now();
      
      if (forceRefresh) {
        setRefreshing(true);
        setTransactions([]);
        setCurrentPage(1);
        setHasMoreData(false);
        setLoadingProgress({ current: 0, total: 0 });
        // Clear websites cache on force refresh
        websitesCache.current = { data: {}, timestamp: 0, ttl: 5 * 60 * 1000 };
      } else {
        // Use initialLoading for first load, loading for subsequent loads
        if (transactions.length === 0) {
          setInitialLoading(true);
        } else {
          setLoading(true);
        }
        setLoadingProgress({ current: 0, total: 0 });
      }

      const userTeamIds = teams.map(team => team.id);
      
      // If no teams, return early
      if (userTeamIds.length === 0) {
        setTransactions([]);
        setLoading(false);
        setInitialLoading(false);
        setRefreshing(false);
        isLoadingRef.current = false;
        return;
      }

      // Get selected date range (00:00:00 to 23:59:59)
      const selectedDateObj = new Date(getLocalDateString());
      const startOfDay = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate(), 0, 0, 0);
      const endOfDay = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate(), 23, 59, 59);

      setError(null);

      // Enhanced websites caching with per-team cache
      const getActiveWebsitesForTeams = async (teamIds: string[]): Promise<{ [teamId: string]: string[] }> => {
        const now = Date.now();
        const cache = websitesCache.current;
        
        // Check if cache is still valid and has all teams
        const hasAllTeams = teamIds.every(teamId => cache.data[teamId]);
        if (hasAllTeams && (now - cache.timestamp) < cache.ttl) {
          performanceRef.current.cacheHits++;
          console.log('🎯 Using cached websites data');
          return cache.data;
        }

        // Fetch missing teams only
        const missingTeams = teamIds.filter(teamId => 
          !cache.data[teamId] || (now - cache.timestamp) >= cache.ttl
        );

        if (missingTeams.length > 0) {
          console.log('🔍 Fetching websites for teams:', missingTeams.length);
          
          // Process teams in batches for better performance
          const websiteBatches = [];
          for (let i = 0; i < missingTeams.length; i += queryBatchSize) {
            const batch = missingTeams.slice(i, i + queryBatchSize);
            websiteBatches.push(
              getDocs(query(
                collection(db, 'websites'),
                where('teamId', 'in', batch),
                where('isActive', '==', true)
              ))
            );
          }

          const websiteSnapshots = await Promise.all(websiteBatches);
          
          // Process results and update cache
          const newCacheData = { ...cache.data };
          websiteSnapshots.forEach(snapshot => {
            snapshot.docs.forEach(doc => {
              const data = doc.data();
              if (!newCacheData[data.teamId]) {
                newCacheData[data.teamId] = [];
              }
              newCacheData[data.teamId].push(doc.id);
            });
          });

          // Ensure all teams have at least empty array
          missingTeams.forEach(teamId => {
            if (!newCacheData[teamId]) {
              newCacheData[teamId] = [];
            }
          });

          // Update cache
          websitesCache.current = {
            data: newCacheData,
            timestamp: now,
            ttl: cache.ttl
          };

          performanceRef.current.cacheMisses++;
        }

        return websitesCache.current.data;
      };

      // Get active websites with caching
      setLoadingProgress({ current: 1, total: userTeamIds.length + 2 });
      const activeWebsitesByTeam = await getActiveWebsitesForTeams(userTeamIds);
      
      // Get all active website IDs
      const allActiveWebsiteIds = Object.values(activeWebsitesByTeam).flat();
      
      // Early return if no active websites
      if (allActiveWebsiteIds.length === 0) {
        setTransactions([]);
        setLoading(false);
        setInitialLoading(false);
        setRefreshing(false);
        isLoadingRef.current = false;
        return;
      }

      // Enhanced parallel queries with optimized structure
      const queryStartTime = performance.now();
      setLoadingProgress({ current: 2, total: userTeamIds.length + 2 });
      
      // Create optimized queries with pre-filtering
      const teamQueries = userTeamIds.map(async (teamId, index) => {
        const teamWebsites = activeWebsitesByTeam[teamId] || [];
        
        // Skip teams with no active websites
        if (teamWebsites.length === 0) {
          setLoadingProgress(prev => ({ ...prev, current: prev.current + 1 }));
          return { teamId, docs: [] };
        }

        try {
          // Try optimized compound query first
          const snapshot = await getDocs(query(
            collection(db, 'transactions'),
            where('teamId', '==', teamId),
            where('type', '==', 'withdraw'),
            where('createdBy', '==', 'api'),
            where('createdAt', '>=', startOfDay),
            where('createdAt', '<=', endOfDay),
            orderBy('createdAt', 'desc'),
            limit(500)
          ));
          
          setLoadingProgress(prev => ({ ...prev, current: prev.current + 1 }));
          return { teamId, docs: snapshot.docs };
          
        } catch (error) {
          console.warn(`Optimized query failed for team ${teamId}, using fallback:`, error);
          
          // Fallback to basic query
          const fallbackSnapshot = await getDocs(query(
            collection(db, 'transactions'),
            where('teamId', '==', teamId),
            where('createdAt', '>=', startOfDay),
            where('createdAt', '<=', endOfDay),
            orderBy('createdAt', 'desc'),
            limit(500)
          ));
          
          setLoadingProgress(prev => ({ ...prev, current: prev.current + 1 }));
          return { teamId, docs: fallbackSnapshot.docs };
        }
      });

      // Execute all queries in parallel
      const teamResults = await Promise.all(teamQueries);
      
      performanceRef.current.totalQueryTime += performance.now() - queryStartTime;

      // Create teams lookup map (use existing teams data)
      const teamsMap = new Map();
      teams.forEach(team => {
        teamsMap.set(team.id, team);
      });

      // Enhanced data processing with pre-filtering
      const processStartTime = performance.now();
      const allTransactions: BotTransaction[] = [];

      teamResults.forEach(({ teamId, docs }) => {
        const teamWebsites = activeWebsitesByTeam[teamId] || [];
        const team = teamsMap.get(teamId);
        const teamName = team?.name || `ทีม ${teamId?.substring(0, 8) || 'ไม่ระบุ'}`;

        docs.forEach(doc => {
          const data = doc.data() as any;
          
          // Enhanced filtering with pre-computed data
          if (
            data.type === 'withdraw' && 
            data.createdBy === 'api' && 
            data.websiteId && 
            teamWebsites.includes(data.websiteId)
          ) {
            allTransactions.push({
              id: doc.id,
              ...data,
              teamName
            } as BotTransaction);
          }
        });
      });

      console.log(`⚡ Data processing took: ${performance.now() - processStartTime}ms`);

      // Optimized sorting using native sort with cached time values
      const sortStartTime = performance.now();
      allTransactions.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.()?.getTime() || new Date(a.createdAt).getTime();
        const bTime = b.createdAt?.toDate?.()?.getTime() || new Date(b.createdAt).getTime();
        return bTime - aTime;
      });
      console.log(`🔄 Sorting took: ${performance.now() - sortStartTime}ms`);

      // Set final results
      setTransactions(allTransactions);
      setLoadingProgress({ current: userTeamIds.length + 2, total: userTeamIds.length + 2 });
      setHasMoreData(false);
      setLastUpdated(new Date());
      
      const totalTime = performance.now() - performanceRef.current.loadStartTime;
      console.log(`🚀 Total load time: ${totalTime.toFixed(2)}ms | Transactions: ${allTransactions.length} | Cache: ${performanceRef.current.cacheHits}H/${performanceRef.current.cacheMisses}M`);

    } catch (err) {
      console.error('Error loading bot transactions:', err);
      setError('ไม่สามารถโหลดข้อมูลธุรกรรมได้');
      toast.error('ไม่สามารถโหลดข้อมูลธุรกรรมได้');
    } finally {
      setLoading(false);
      setInitialLoading(false);
      setRefreshing(false);
      isLoadingRef.current = false;
    }
  }, [user, userProfile, teams, teamsLoading, transactions]);

  // Initial load and team changes - ปรับให้ไม่รอ teamsLoading
  useEffect(() => {
    if (user && userProfile && teams.length > 0) {
      // Start loading immediately when data is available
      const doInitialLoad = async () => {
        if (!isLoadingRef.current) {
          await loadTransactions(false); // ใช้ false เพื่อไม่ force refresh
        }
      };
      doInitialLoad();
    }
  }, [teamsLoading, user, userProfile, teams]); // ยังคง teamsLoading เพื่อรอให้ข้อมูล teams โหลดเสร็จ

  // Optimized real-time listener for new bot transactions
  useEffect(() => {
    if (!user || !userProfile || teamsLoading) return;

    let unsubscribe: (() => void) | null = null;
    let isInitialLoad = true;

    // Enhanced real-time listener with caching
    unsubscribe = onSnapshot(
      collection(db, 'transactions'), 
      (snapshot) => {
        // Skip initial load to avoid duplicate data
        if (isInitialLoad) {
          isInitialLoad = false;
          return;
        }

        // Pre-compute frequently used values
        const userTeamIds = teams.map(team => team.id);
        const userTeamIdSet = new Set(userTeamIds); // Use Set for O(1) lookup
        const teamsMap = new Map(teams.map(team => [team.id, team]));
        
        // Get today's date range once
        const selectedDateObj = new Date(getLocalDateString());
        const startOfDay = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate(), 0, 0, 0);
        const endOfDay = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate(), 23, 59, 59);

        // Get cached active websites
        const now = Date.now();
        const cache = websitesCache.current;
        let activeWebsitesByTeam: { [teamId: string]: string[] } = {};
        
        if ((now - cache.timestamp) < cache.ttl) {
          activeWebsitesByTeam = cache.data;
        }

        // Enhanced filtering function
        const isValidBotTransaction = (data: any) => {
          // Quick type and creator check first
          if (data.type !== 'withdraw' || data.createdBy !== 'api') return false;
          
          // Team membership check using Set for O(1) lookup
          if (!data.teamId || !userTeamIdSet.has(data.teamId)) return false;
          
          // Date range check
          const recordTime = data.createdAt?.toDate?.() || new Date(data.createdAt);
          if (recordTime < startOfDay || recordTime > endOfDay) return false;
          
          // Website check (only if we have cached data)
          if (activeWebsitesByTeam[data.teamId]) {
            return data.websiteId && activeWebsitesByTeam[data.teamId].includes(data.websiteId);
          }
          
          // If no cached data, allow through (will be filtered later)
          return true;
        };

        // Process document changes more efficiently
        const changes = snapshot.docChanges();
        let hasNewRecords = false;
        let hasModifiedRecords = false;

        // Batch process new records
        const newTransactions: BotTransaction[] = [];
        const modifiedTransactions: BotTransaction[] = [];

        changes.forEach(change => {
          const data = change.doc.data();
          
          if (change.type === 'added' && isValidBotTransaction(data)) {
            const team = teamsMap.get(data.teamId);
            newTransactions.push({
              id: change.doc.id,
              ...data,
              teamName: team?.name || `ทีม ${data.teamId?.substring(0, 8) || 'ไม่ระบุ'}`
            } as BotTransaction);
            hasNewRecords = true;
          } else if (change.type === 'modified' && isValidBotTransaction(data)) {
            const team = teamsMap.get(data.teamId);
            modifiedTransactions.push({
              id: change.doc.id,
              ...data,
              teamName: team?.name || `ทีม ${data.teamId?.substring(0, 8) || 'ไม่ระบุ'}`
            } as BotTransaction);
            hasModifiedRecords = true;
          }
        });

        // Batch update new records
        if (hasNewRecords && newTransactions.length > 0) {
          setTransactions(prev => {
            const existingIds = new Set(prev.map(tx => tx.id));
            const newUnique = newTransactions.filter(newTx => !existingIds.has(newTx.id));
            
            if (newUnique.length > 0) {
              const combined = [...newUnique, ...prev];
              // Use optimized sorting
              return combined.sort((a, b) => {
                const aTime = a.createdAt?.toDate?.()?.getTime() || new Date(a.createdAt).getTime();
                const bTime = b.createdAt?.toDate?.()?.getTime() || new Date(b.createdAt).getTime();
                return bTime - aTime;
              });
            }
            return prev;
          });
          
          setLastUpdated(new Date());
          toast.success(`มีธุรกรรม Bot ใหม่ ${newTransactions.length} รายการ`, {
            duration: 3000,
            position: 'top-right',
          });
        }

        // Batch update modified records
        if (hasModifiedRecords && modifiedTransactions.length > 0) {
          setTransactions(prev => {
            const updated = [...prev];
            const modifiedMap = new Map(modifiedTransactions.map(tx => [tx.id, tx]));
            
            // Update existing records in place
            for (let i = 0; i < updated.length; i++) {
              const modified = modifiedMap.get(updated[i].id);
              if (modified) {
                updated[i] = modified;
              }
            }
            
            return updated;
          });
          setLastUpdated(new Date());
        }
      },
      (error) => {
        if (process.env.NODE_ENV === 'development') {
          console.error('Real-time listener error:', error);
        }
      }
    );

    unsubscribeRef.current = unsubscribe;
    return () => unsubscribe?.();
  }, [user, userProfile, teamsLoading, teams]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, selectedTeamFilter, itemsPerPage]);

  const handleRefresh = () => {
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
      const selectedDateObj = new Date(getLocalDateString());
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
            limit(500)
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
              limit(500)
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
      setHasMoreData(additionalDocs.length >= userTeamIds.length * 500);

    } catch (error) {
      console.error('Error loading more data:', error);
      toast.error('ไม่สามารถโหลดข้อมูลเพิ่มเติมได้');
    } finally {
      setLoadingMore(false);
    }
  }, [user, userProfile, teams, teamsLoading, transactions, loadingMore, hasMoreData]);

  // Remove load all data function since we always show all data

  const openManageModal = (transaction: BotTransaction) => {
    setSelectedTransaction(transaction);
    setModalStatus(''); // Set to empty string for default "-" option
    setModalNote(transaction.note || '');
    setShowManageModal(true);
  };

  const closeManageModal = () => {
    setShowManageModal(false);
    setSelectedTransaction(null);
    setModalStatus('');
    setModalNote('');
  };

  const updateTransactionStatus = async (transactionId: string, newStatus: string, note?: string) => {
    try {
      setUpdatingStatus(transactionId);

              const updateData: any = {
          status: newStatus,
          updatedAt: new Date(),
          lastModifiedBy: userProfile?.displayName || user?.displayName || 'ไม่ระบุผู้ใช้',
          lastModifiedByEmail: user?.email || '',
          lastModifiedAt: new Date()
        };

        if (note !== undefined) {
          updateData.note = note;
        }

        await updateDoc(doc(db, 'transactions', transactionId), updateData);

        // If status is "ยกเลิก", refund credit to website
        if (newStatus === 'ยกเลิก') {
          try {
            // Find the transaction to get details for credit refund
            const transaction = transactions.find(t => t.id === transactionId);
            
            if (transaction && transaction.websiteId) {
              // Use runTransaction to prevent race conditions with manual topup/withdraw
              const refundResult = await runTransaction(db, async (firestoreTransaction) => {
                // Try to get document directly by ID first
                const websiteDocRef = doc(db, 'websites', transaction.websiteId!);
                const websiteDocSnap = await firestoreTransaction.get(websiteDocRef);
                
                let websiteData = null;
                let websiteDocId = null;
                
                if (websiteDocSnap.exists()) {
                  websiteData = websiteDocSnap.data();
                  websiteDocId = websiteDocSnap.id;
                } else {
                  // If not found by document ID, try finding by id field
                  const websitesQuery = query(
                    collection(db, 'websites'),
                    where('id', '==', transaction.websiteId)
                  );
                  const websitesSnapshot = await getDocs(websitesQuery);
                  
                  if (!websitesSnapshot.empty) {
                    websiteData = websitesSnapshot.docs[0].data();
                    websiteDocId = websitesSnapshot.docs[0].id;
                  }
                }
                
                if (!websiteData || !websiteDocId) {
                  throw new Error(`Website not found: ${transaction.websiteName} (ID: ${transaction.websiteId})`);
                }
                
                const currentBalance = websiteData.balance || 0;
                const refundAmount = transaction.amount;
                const newBalance = currentBalance + refundAmount;

                // Update website balance atomically
                const finalWebsiteRef = doc(db, 'websites', websiteDocId);
                firestoreTransaction.update(finalWebsiteRef, {
                  balance: newBalance,
                  updatedAt: serverTimestamp()
                });

                return {
                  currentBalance,
                  newBalance,
                  refundAmount,
                  websiteName: transaction.websiteName
                };
              });

              // Create refund transaction record (outside of transaction for better performance)
              const refundDoc = await addDoc(collection(db, 'transactions'), {
                transactionId: `REFUND_${Date.now()}`,
                type: 'refund',
                customerUsername: transaction.customerUsername,
                amount: refundResult.refundAmount,
                status: 'สำเร็จ',
                websiteName: transaction.websiteName,
                websiteId: transaction.websiteId,
                teamId: transaction.teamId,
                teamName: transaction.teamName,
                balanceBefore: refundResult.currentBalance,
                balanceAfter: refundResult.newBalance,
                relatedTransactionId: transactionId,
                note: `คืนเครดิตให้เว็บไซต์จากการยกเลิกธุรกรรม ${transaction.transactionId}`,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdBy: userProfile?.displayName || user?.displayName || 'ระบบ',
                lastModifiedBy: userProfile?.displayName || user?.displayName || 'ระบบ',
                lastModifiedByEmail: user?.email || '',
                lastModifiedAt: serverTimestamp()
              });

              toast.success(`คืนเครดิต ฿${new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(refundResult.refundAmount)} ให้เว็บไซต์ ${refundResult.websiteName} สำเร็จ`);
              
            } else {
              console.error('Transaction not found or missing websiteId:', transactionId);
              toast.error('ไม่พบข้อมูลธุรกรรมหรือไม่มี websiteId');
            }
          } catch (refundError) {
            console.error('Error refunding credit:', refundError);
            toast.error('เกิดข้อผิดพลาดในการคืนเครดิต: ' + (refundError instanceof Error ? refundError.message : String(refundError)));
          }
        }

        // Update local state
        setTransactions(prev => 
          prev.map(transaction => 
            transaction.id === transactionId 
              ? { 
                  ...transaction, 
                  status: newStatus, 
                  note: note || transaction.note,
                  lastModifiedBy: updateData.lastModifiedBy,
                  lastModifiedByEmail: updateData.lastModifiedByEmail,
                  lastModifiedAt: updateData.lastModifiedAt
                }
              : transaction
          )
        );

      toast.success('อัพเดทข้อมูลสำเร็จ');
      closeManageModal();
    } catch (err) {
      console.error('Error updating transaction:', err);
      toast.error('ไม่สามารถอัพเดทข้อมูลได้');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleSaveChanges = () => {
    if (selectedTransaction) {
      // Use the selected status from modal
      const finalStatus = modalStatus;
      
      // Validate that a status is selected
      if (!modalStatus || modalStatus === '') {
        toast.error('กรุณาเลือกสถานะ');
        return;
      }
      
      // Validate required note for certain statuses
      if ((modalStatus === 'สำเร็จ' || modalStatus === 'ยกเลิก') && !modalNote.trim()) {
        toast.error(`กรุณาใส่หมายเหตุสำหรับสถานะ "${modalStatus}"`);
        return;
      }
      
      updateTransactionStatus(selectedTransaction.id, finalStatus, modalNote);
    }
  };

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

      return matchesSearch && matchesStatus && matchesTeam;
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

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, selectedTeamFilter]);

  if (!user) {
    return (
      <DashboardLayout title="ธุรกรรม Bot API" subtitle="กรุณาเข้าสู่ระบบ">
        <div className="text-center text-red-600">
          กรุณาเข้าสู่ระบบเพื่อใช้งาน
        </div>
      </DashboardLayout>
    );
  }

  // แสดงหน้าจอทันทีเมื่อมี user (ไม่รอ teamsLoading)
  return (
    <DashboardLayout 
      title="ธุรกรรม Bot API" 
      subtitle="รายการธุรกรรมการถอนเงินที่สร้างผ่าน API"
    >
      <div className="space-y-6 lg:space-y-8">

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
                        {team.name} ({(initialLoading || loading) ? 0 : transactions.filter(t => t.teamId === team.id).length})
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
                    <option value="รอโอน">⏳ รอโอน ({(initialLoading || loading) ? 0 : transactions.filter(t => t.status === 'รอโอน').length})</option>
                    <option value="กำลังโอน">🔄 กำลังโอน ({(initialLoading || loading) ? 0 : transactions.filter(t => t.status === 'กำลังโอน').length})</option>
                  </optgroup>
                  <optgroup label="✅ เสร็จสิ้น">
                    <option value="สำเร็จ">✅ สำเร็จ ({(initialLoading || loading) ? 0 : transactions.filter(t => t.status === 'สำเร็จ').length})</option>
                  </optgroup>
                  <optgroup label="❌ ยกเลิก/ล้มเหลว">
                    <option value="ยกเลิก">❌ ยกเลิก ({(initialLoading || loading) ? 0 : transactions.filter(t => t.status === 'ยกเลิก').length})</option>
                    <option value="ล้มเหลว">⚠️ ล้มเหลว ({(initialLoading || loading) ? 0 : transactions.filter(t => t.status === 'ล้มเหลว').length})</option>
                  </optgroup>
                </select>
              </div>

              {/* Enhanced Clear Filters Button */}
              {(searchTerm || statusFilter !== 'all' || selectedTeamFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setSelectedTeamFilter('all');
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
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/30 dark:border-gray-700/30 p-6">
          {initialLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-gray-500 dark:text-gray-400">กำลังโหลดข้อมูลธุรกรรม...</p>
              <div className="mt-2 text-xs text-gray-400">
                กำลังดึงข้อมูลจากฐานข้อมูล...
              </div>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-gray-500 dark:text-gray-400">กำลังโหลดข้อมูลธุรกรรม...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <div className="text-red-500 mb-4">
                <svg className="h-12 w-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-lg font-semibold">เกิดข้อผิดพลาด</p>
                <p className="text-sm">{error}</p>
              </div>
              <button
                onClick={() => loadTransactions(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                ลองใหม่
              </button>
            </div>
          ) : teamsLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-gray-500 dark:text-gray-400">กำลังโหลดข้อมูลทีม...</p>
            </div>
          ) : teams.length === 0 && !teamsLoading ? (
            <div className="text-center py-16">
              <div className="text-gray-500 dark:text-gray-400">
                <svg className="h-12 w-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 715.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p>ไม่พบทีมที่เข้าร่วม</p>
                <p className="text-sm">คุณยังไม่ได้เป็นสมาชิกของทีมใดๆ</p>
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
                      ธุรกรรม Bot API - วันนี้ {new Date().toLocaleDateString('th-TH', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </h3>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        รายการธุรกรรมการถอนเงินที่สร้างผ่าน API วันนี้เท่านั้น
                      </p>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs text-green-600 dark:text-green-400">อัพเดทแบบ Real-time</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Enhanced Stats info - larger and more beautiful */}
                  <div className="flex items-center gap-6">
                    {/* Pending transactions - Enhanced */}
                    <div className="flex items-center gap-3 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/30 dark:to-orange-900/30 px-4 py-3 rounded-xl border border-yellow-200/50 dark:border-yellow-600/30 shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="flex items-center justify-center w-8 h-8 bg-yellow-100 dark:bg-yellow-800/50 rounded-lg">
                        <span className="text-lg text-yellow-600 dark:text-yellow-400">⏳</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase tracking-wide">รอโอน</span>
                        {(initialLoading || loading) ? (
                          <div className="h-5 w-8 bg-yellow-300 dark:bg-yellow-600 rounded animate-pulse mt-1"></div>
                        ) : (
                          <span className="text-xl font-bold text-yellow-700 dark:text-yellow-300">
                            {transactions.filter(t => t.status === 'รอโอน').length}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Processing transactions - Enhanced */}
                    <div className="flex items-center gap-3 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 px-4 py-3 rounded-xl border border-blue-200/50 dark:border-blue-600/30 shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="flex items-center justify-center w-8 h-8 bg-blue-100 dark:bg-blue-800/50 rounded-lg">
                        <span className="text-lg text-blue-600 dark:text-blue-400">🔄</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">กำลังโอน</span>
                        {(initialLoading || loading) ? (
                          <div className="h-5 w-8 bg-blue-300 dark:bg-blue-600 rounded animate-pulse mt-1"></div>
                        ) : (
                          <span className="text-xl font-bold text-blue-700 dark:text-blue-300">
                            {transactions.filter(t => t.status === 'กำลังโอน').length}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Last updated info */}
                  <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 ml-4">
                    {(initialLoading || loading) ? (
                      <div className="h-4 w-24 bg-gray-300 dark:bg-gray-600 rounded animate-pulse"></div>
                    ) : (
                      <div>อัพเดทล่าสุด: {lastUpdated.toLocaleTimeString('th-TH')}</div>
                    )}
                    {process.env.NODE_ENV === 'development' && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span>Cache: {performanceRef.current.cacheHits}H/{performanceRef.current.cacheMisses}M</span>
                      </div>
                    )}
                    {/* Enhanced performance indicators */}
                    {process.env.NODE_ENV === 'development' && (
                      <div className="flex items-center gap-2 text-xs">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="text-green-600 dark:text-green-400">
                            Query: {performanceRef.current.totalQueryTime.toFixed(0)}ms
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                          <span className="text-purple-600 dark:text-purple-400">
                            Cache: {((performanceRef.current.cacheHits / Math.max(1, performanceRef.current.cacheHits + performanceRef.current.cacheMisses)) * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Manual refresh button */}
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    รีเฟรช
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
                      <th className="text-center py-3 px-4 font-semibold text-gray-900 dark:text-white">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(initialLoading || loading) && transactions.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-16 text-center">
                          <div className="flex flex-col items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-2"></div>
                            <span className="text-gray-500 dark:text-gray-400 text-center">
                              กำลังโหลดข้อมูลธุรกรรม...
                            </span>
                            {loadingProgress.total > 0 && (
                              <div className="mt-2 text-xs text-gray-400">
                                โหลดทีม {loadingProgress.current + 1} จาก {loadingProgress.total} ทีม
                              </div>
                            )}
                            {transactions.length > 0 && (
                              <div className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                                พบข้อมูลแล้ว {transactions.length} รายการ
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : teams.length === 0 && !teamsLoading ? (
                      <tr>
                        <td colSpan={10} className="py-16 text-center">
                          <div className="text-gray-500 dark:text-gray-400">
                            <svg className="h-12 w-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 715.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <p>ไม่พบทีมที่เข้าร่วม</p>
                            <p className="text-sm">คุณยังไม่ได้เป็นสมาชิกของทีมใดๆ</p>
                          </div>
                        </td>
                      </tr>
                    ) : filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-16 text-center">
                          <div className="text-gray-500 dark:text-gray-400">
                            <svg className="h-12 w-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <p>ไม่พบธุรกรรม Bot API ในวันที่เลือก</p>
                            <p className="text-sm">ไม่มีการสร้างธุรกรรมผ่าน API ในวันที่เลือก</p>
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
                    {/* Arrow */}
                    <div className={`absolute ${index < 3 ? 'left-full top-3 border-4 border-transparent border-l-gray-900 dark:border-l-gray-700' : 'top-full right-4 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700'}`}></div>
                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center">
                            {['สำเร็จ', 'ยกเลิก', 'ล้มเหลว'].includes(transaction.status) ? (
                              <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-lg">
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                ปิดแล้ว
                              </span>
                            ) : isUser() ? (
                              <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-lg">
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                                </svg>
                                ไม่มีสิทธิ์
                              </span>
                            ) : (
                              <button
                                onClick={() => openManageModal(transaction)}
                                disabled={updatingStatus === transaction.id}
                                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                จัดการ
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Load More Button - Removed since we use single batch loading */}

              {/* Pagination */}
              {Math.ceil(filteredTransactions.length / itemsPerPage) > 1 && (
                <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        <span className="text-blue-600 dark:text-blue-400 font-medium">ข้อมูลล่าสุด</span>
                      </div>
                      <span>-</span>
                      {loading ? (
                        <div className="h-4 w-32 bg-gray-300 dark:bg-gray-600 rounded animate-pulse"></div>
                      ) : (
                        <span>แสดง {((currentPage - 1) * itemsPerPage) + 1} ถึง {Math.min(currentPage * itemsPerPage, filteredTransactions.length)} จาก {filteredTransactions.length} รายการ</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1 || loading}
                      className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ก่อนหน้า
                    </button>
                    
                    {loading ? (
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: 3 }, (_, i) => (
                          <div key={i} className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-lg animate-pulse"></div>
                        ))}
                      </div>
                    ) : (
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
                    )}
                    
                    <button
                      onClick={() => setCurrentPage(Math.min(Math.ceil(filteredTransactions.length / itemsPerPage), currentPage + 1))}
                      disabled={currentPage === Math.ceil(filteredTransactions.length / itemsPerPage) || loading}
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

        {/* Manage Transaction Modal */}
        <PortalModal isOpen={showManageModal && !!selectedTransaction}>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xl flex items-center justify-center p-4 z-[100]">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-white/20 dark:border-gray-700/50 max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                {/* Modal Header */}
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    จัดการธุรกรรม
                  </h3>
                  <button
                    onClick={closeManageModal}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {selectedTransaction && (
                  <>
                    {/* Transaction Info */}
                    <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Transaction ID:</span>
                          <span className="font-mono text-blue-600 dark:text-blue-400">{selectedTransaction.transactionId}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Customer:</span>
                          <span className="font-medium">{selectedTransaction.customerUsername}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">จำนวนเงิน:</span>
                          <span className="font-bold text-red-600 dark:text-red-400">-฿{formatAmount(selectedTransaction.amount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">เว็บไซต์:</span>
                          <span className="font-medium">{selectedTransaction.websiteName}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status Selection */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        สถานะ
                      </label>
                      <select
                        value={modalStatus}
                        onChange={(e) => setModalStatus(e.target.value)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                          !modalStatus ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                        }`}
                      >
                        <option value="" disabled>
                          - เลือกสถานะ -
                        </option>
                        {statusOptions.map(status => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Note Input */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        หมายเหตุ
                        {(modalStatus === 'สำเร็จ' || modalStatus === 'ยกเลิก') && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </label>
                      {(modalStatus === 'สำเร็จ' || modalStatus === 'ยกเลิก') && (
                        <p className="text-xs text-red-600 dark:text-red-400 mb-2">
                          กรุณาใส่หมายเหตุสำหรับสถานะ "{modalStatus}"
                        </p>
                      )}
                      <textarea
                        value={modalNote}
                        onChange={(e) => setModalNote(e.target.value)}
                        rows={3}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none ${
                          (modalStatus === 'สำเร็จ' || modalStatus === 'ยกเลิก') && !modalNote.trim()
                            ? 'border-red-300 dark:border-red-600'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                        placeholder={
                          (modalStatus === 'สำเร็จ' || modalStatus === 'ยกเลิก')
                            ? `กรุณาใส่เหตุผลสำหรับสถานะ "${modalStatus}"...`
                            : "เพิ่มหมายเหตุสำหรับธุรกรรมนี้..."
                        }
                      />
                    </div>

                    {/* Modal Actions */}
                    <div className="flex gap-3">
                      <button
                        onClick={closeManageModal}
                        className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                      >
                        ยกเลิก
                      </button>
                      <button
                        onClick={handleSaveChanges}
                        disabled={updatingStatus === selectedTransaction.id || !modalStatus}
                        className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors disabled:cursor-not-allowed"
                      >
                        {updatingStatus === selectedTransaction.id ? (
                          <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            กำลังบันทึก...
                          </div>
                        ) : (
                          'บันทึกการเปลี่ยนแปลง'
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </PortalModal>
      </div>
    </DashboardLayout>
  );
}