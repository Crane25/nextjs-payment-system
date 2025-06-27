'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useUserProfile } from '../../contexts/UserContext';
import { usePermission } from '../../hooks/usePermission';
import { useMultiTeam } from '../../hooks/useMultiTeam';
import { collection, query, where, orderBy, getDocs, onSnapshot, updateDoc, doc, limit, startAfter, Query, QuerySnapshot, DocumentData } from 'firebase/firestore';
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

const statusColors: { [key: string]: string } = {
  'รอโอน': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  'กำลังดำเนินการ': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'สำเร็จ': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'ยกเลิก': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  'ล้มเหลว': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
};

export default function BotTransactionsPage() {
  const { user } = useAuth();
  const { userProfile } = useUserProfile();
  const { hasPermission, isUser } = usePermission();
  const { teams, loading: teamsLoading, error: teamsError } = useMultiTeam();
  
  // Debug teams data
  useEffect(() => {
    console.log('bot-transactions: teams data', { 
      teams: teams.map(t => ({ id: t.id, name: t.name })), 
      teamsLoading, 
      teamsError 
    });
  }, [teams, teamsLoading, teamsError]);

  const [transactions, setTransactions] = useState<BotTransaction[]>([]);
  const [loading, setLoading] = useState(true);
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

  // Optimized loading function with traditional pagination
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
      } else {
        setLoading(true);
      }

      const userTeamIds = teams.map(team => team.id);
      
      // If no teams, return early
      if (userTeamIds.length === 0) {
        setTransactions([]);
        setLoading(false);
        setRefreshing(false);
        isLoadingRef.current = false;
        return;
      }

      setError(null);

      // Use optimized query with cursor-based pagination
      const queryStartTime = performance.now();
      
      let allTransactionDocs: any[] = [];
      
      for (const teamId of userTeamIds) {
        try {
          // Use single-field query to avoid composite index requirements
          let teamQuery = query(
            collection(db, 'transactions'),
            where('teamId', '==', teamId),
            limit(1000) // Get more data for client-side processing
          );

          const teamSnapshot = await getDocs(teamQuery);
          console.log(`Team ${teamId}: Found ${teamSnapshot.docs.length} transactions`);
          allTransactionDocs.push(...teamSnapshot.docs);
        } catch (error) {
          console.warn(`Error loading team ${teamId} transactions:`, error);
          // Continue with other teams even if one fails
        }
      }

      // Sort all documents by createdAt on client side
      allTransactionDocs.sort((a, b) => {
        const aTime = a.data().createdAt?.toDate?.() || new Date(a.data().createdAt);
        const bTime = b.data().createdAt?.toDate?.() || new Date(b.data().createdAt);
        return bTime.getTime() - aTime.getTime();
      });

      const teamsSnapshot = await getDocs(collection(db, 'teams'));
      
      performanceRef.current.totalQueryTime += performance.now() - queryStartTime;

      // Create efficient lookup maps
      const teamsMap = new Map();
      teamsSnapshot.docs.forEach(doc => {
        teamsMap.set(doc.id, doc.data());
      });

      // Process all documents
      const allTransactions = allTransactionDocs.map(doc => {
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

      console.log(`Total transactions loaded: ${allTransactions.length}`);
      
      // Filter for bot transactions on client-side since we simplified the query
      const botTransactions = allTransactions.filter(record => 
        record.type === 'withdraw' && 
        record.createdBy === 'api'
      );

      console.log(`Bot transactions found: ${botTransactions.length}`);
      console.log('Sample bot transaction:', botTransactions[0]);

      // Filter based on user role and permissions
      let filteredRecords: BotTransaction[];
      
      if (userProfile.role === 'admin') {
        filteredRecords = botTransactions.filter(record => 
          record.teamId && userTeamIds.includes(record.teamId)
        );
      } else if (userProfile.role === 'manager') {
        filteredRecords = botTransactions.filter(record => 
          record.teamId && userTeamIds.includes(record.teamId)
        );
      } else {
        filteredRecords = botTransactions.filter(record => 
          record.teamId && userTeamIds.includes(record.teamId)
        );
      }

      console.log(`Filtered records: ${filteredRecords.length}`);

      // Store all filtered records for client-side pagination
      setTransactions(filteredRecords);

      setLastUpdated(new Date());
      performanceRef.current.cacheMisses++;

    } catch (err) {
      console.error('Error loading bot transactions:', err);
      setError('ไม่สามารถโหลดข้อมูลธุรกรรมได้');
      toast.error('ไม่สามารถโหลดข้อมูลธุรกรรมได้');
    } finally {
      setLoading(false);
      setRefreshing(false);
      isLoadingRef.current = false;
    }
  }, [user, userProfile, teams, teamsLoading, itemsPerPage]);

  // Removed loadMoreTransactions - now using pagination

  // Initial load and team changes
  useEffect(() => {
    if (!teamsLoading && user && userProfile && teams.length > 0) {
      loadTransactions(true);
    }
  }, [loadTransactions, teamsLoading, user, userProfile, teams]);

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

  const openManageModal = (transaction: BotTransaction) => {
    setSelectedTransaction(transaction);
    setModalStatus(transaction.status);
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
      // Validate required note for certain statuses
      if ((modalStatus === 'สำเร็จ' || modalStatus === 'ยกเลิก') && !modalNote.trim()) {
        toast.error(`กรุณาใส่หมายเหตุสำหรับสถานะ "${modalStatus}"`);
        return;
      }
      
      updateTransactionStatus(selectedTransaction.id, modalStatus, modalNote);
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
      minute: '2-digit'
    });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Filter transactions for display (client-side filtering for search/status)
  const getFilteredTransactions = () => {
    return transactions.filter(transaction => {
      // Search filter
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        transaction.transactionId.toLowerCase().includes(searchLower) ||
        transaction.customerUsername.toLowerCase().includes(searchLower) ||
        transaction.websiteName.toLowerCase().includes(searchLower) ||
        transaction.bankName.toLowerCase().includes(searchLower) ||
        transaction.realName.toLowerCase().includes(searchLower);

      // Status filter
      const matchesStatus = statusFilter === 'all' || transaction.status === statusFilter;

      // Team filter
      const matchesTeam = selectedTeamFilter === 'all' || transaction.teamId === selectedTeamFilter;

      return matchesSearch && matchesStatus && matchesTeam;
    });
  };

  const filteredTransactions = getFilteredTransactions();

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, selectedTeamFilter]);

  if (teamsLoading) {
    return (
      <DashboardLayout title="ธุรกรรม Bot API" subtitle="กำลังโหลด...">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout title="ธุรกรรม Bot API" subtitle="กรุณาเข้าสู่ระบบ">
        <div className="text-center text-red-600">
          กรุณาเข้าสู่ระบบเพื่อใช้งาน
        </div>
      </DashboardLayout>
    );
  }

  if (teams.length === 0 && !teamsLoading) {
    return (
      <DashboardLayout title="ธุรกรรม Bot API" subtitle="ไม่พบทีม">
        <div className="text-center text-gray-500">
          ไม่พบทีมที่เข้าร่วม
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-r from-blue-500 to-cyan-600 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">รายการทั้งหมด</p>
                <p className="text-2xl font-bold">{transactions.length}</p>
              </div>
              <svg className="h-8 w-8 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>

          <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-sm font-medium">รอดำเนินการ</p>
                <p className="text-2xl font-bold">
                  {transactions.filter(t => t.status === 'รอโอน').length}
                </p>
              </div>
              <svg className="h-8 w-8 text-orange-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium">สำเร็จ</p>
                <p className="text-2xl font-bold">
                  {transactions.filter(t => t.status === 'สำเร็จ').length}
                </p>
              </div>
              <svg className="h-8 w-8 text-green-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">ยอดรวม</p>
                <p className="text-2xl font-bold">
                  ฿{formatAmount(transactions.reduce((sum, t) => sum + t.amount, 0))}
                </p>
              </div>
              <svg className="h-8 w-8 text-purple-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
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
                        {team.name} ({transactions.filter(t => t.teamId === team.id).length})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Status Filter */}
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
                  {statusOptions.map(status => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              {/* Clear Filters */}
              {(searchTerm || statusFilter !== 'all' || selectedTeamFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setSelectedTeamFilter('all');
                  }}
                  className="px-3 py-2 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/30 dark:border-gray-700/30 p-6">
          {loading ? (
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
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">ธุรกรรม Bot API</h3>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        รายการธุรกรรมการถอนเงินที่สร้างผ่าน API
                      </p>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs text-green-600 dark:text-green-400">อัพเดทแบบ Real-time</span>
                      </div>
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
                        <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">วันที่/เวลา</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">ID</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Customer</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">เว็บไซต์</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">ธนาคาร</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">เลขบัญชี</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">ชื่อจริง</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-900 dark:text-white">จำนวนเงิน</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-900 dark:text-white">สถานะ</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">หมายเหตุ</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-900 dark:text-white">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && transactions.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-16 text-center">
                          <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                            <span className="ml-2 text-gray-500 dark:text-gray-400">กำลังโหลดข้อมูลธุรกรรม...</span>
                          </div>
                        </td>
                      </tr>
                    ) : teams.length === 0 && !teamsLoading ? (
                      <tr>
                        <td colSpan={11} className="py-16 text-center">
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
                        <td colSpan={11} className="py-16 text-center">
                          <div className="text-gray-500 dark:text-gray-400">
                            <svg className="h-12 w-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <p>ไม่พบธุรกรรม Bot API</p>
                            <p className="text-sm">ยังไม่มีการสร้างธุรกรรมผ่าน API</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((transaction) => (
                        <tr key={transaction.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200">
                          <td className="py-4 px-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {formatDate(transaction.createdAt)}
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
                              {transaction.bankName}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="text-sm font-mono text-gray-700 dark:text-gray-300">
                              {transaction.accountNumber}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {transaction.realName}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <div className="text-sm font-bold text-red-600 dark:text-red-400">
                              -฿{formatAmount(transaction.amount)}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColors[transaction.status] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                              {transaction.status}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            {transaction.note ? (
                              <div className="max-w-xs">
                                <div className="flex items-start space-x-2">
                                  <div className="relative group h-4 w-4 mt-0.5 flex-shrink-0 bg-red-500 rounded-full flex items-center justify-center cursor-help">
                                    <span className="text-white text-xs font-bold">!</span>
                                    <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-normal max-w-sm z-20 shadow-lg">
                                      <div className="space-y-2">
                                        <div>
                                          <div className="font-medium text-yellow-300">หมายเหตุ:</div>
                                          <div className="text-gray-200 dark:text-gray-300">
                                            {transaction.note}
                                          </div>
                                        </div>
                                        {transaction.lastModifiedBy && (
                                          <div className="border-t border-gray-600 pt-2">
                                            <div className="font-medium text-blue-300">แก้ไขล่าสุดโดย:</div>
                                            <div className="text-gray-200">
                                              {transaction.lastModifiedBy}
                                            </div>
                                            {transaction.lastModifiedByEmail && (
                                              <div className="text-gray-400 text-xs">
                                                ({transaction.lastModifiedByEmail})
                                              </div>
                                            )}
                                            {transaction.lastModifiedAt && (
                                              <div className="text-gray-400 text-xs mt-1">
                                                {formatDate(transaction.lastModifiedAt)}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      <div className="absolute top-full left-4 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                                    </div>
                                  </div>
                                  <div className="text-sm text-gray-700 dark:text-gray-300 break-words">
                                    {transaction.note.length > 50 ? `${transaction.note.substring(0, 50)}...` : transaction.note}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="max-w-xs">
                                <div className="flex items-start space-x-2">
                                  {transaction.lastModifiedBy ? (
                                    <div className="relative group h-4 w-4 mt-0.5 flex-shrink-0 bg-red-500 rounded-full flex items-center justify-center cursor-help">
                                      <span className="text-white text-xs font-bold">!</span>
                                      <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-normal max-w-sm z-20 shadow-lg">
                                        <div className="space-y-2">
                                          <div>
                                            <div className="font-medium text-yellow-300">หมายเหตุ:</div>
                                            <div className="text-gray-400 italic">ไม่มีหมายเหตุ</div>
                                          </div>
                                          <div className="border-t border-gray-600 pt-2">
                                            <div className="font-medium text-blue-300">แก้ไขล่าสุดโดย:</div>
                                            <div className="text-gray-200">
                                              {transaction.lastModifiedBy}
                                            </div>
                                            {transaction.lastModifiedByEmail && (
                                              <div className="text-gray-400 text-xs">
                                                ({transaction.lastModifiedByEmail})
                                              </div>
                                            )}
                                            {transaction.lastModifiedAt && (
                                              <div className="text-gray-400 text-xs mt-1">
                                                {formatDate(transaction.lastModifiedAt)}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        <div className="absolute top-full left-4 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                                      </div>
                                    </div>
                                  ) : null}
                                  <span className="text-gray-400 dark:text-gray-500 text-sm italic">-</span>
                                </div>
                              </div>
                            )}
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

              {/* Pagination */}
              {Math.ceil(filteredTransactions.length / itemsPerPage) > 1 && (
                <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    แสดง {((currentPage - 1) * itemsPerPage) + 1} ถึง {Math.min(currentPage * itemsPerPage, filteredTransactions.length)} จาก {filteredTransactions.length} รายการ
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
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
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
                        disabled={updatingStatus === selectedTransaction.id}
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