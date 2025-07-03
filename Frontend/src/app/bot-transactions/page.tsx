'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useUserProfile } from '../../contexts/UserContext';
import { usePermission } from '../../hooks/usePermission';
import { useMultiTeam } from '../../hooks/useMultiTeam';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, addDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import DashboardLayout from '../../components/DashboardLayout';
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
  'กำลังโอน',
  'สำเร็จ',
  'ยกเลิก'
];

const statusConfig: { [key: string]: {
  label: string;
  color: string;
  icon: string;
} } = {
  'รอโอน': {
    label: 'รอโอน',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    icon: '⏳'
  },
  'กำลังโอน': {
    label: 'กำลังโอน',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    icon: '🔄'
  },
  'สำเร็จ': {
    label: 'สำเร็จ',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    icon: '✅'
  },
  'ยกเลิก': {
    label: 'ยกเลิก',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    icon: '❌'
  }
};

export default function BotTransactionsPage() {
  const { user } = useAuth();
  const { userProfile } = useUserProfile();
  const { isUser } = usePermission();
  const { teams, loading: teamsLoading } = useMultiTeam();

  const [transactions, setTransactions] = useState<BotTransaction[]>([]);
  const [loading, setLoading] = useState(false);
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

  // Real-time listener ref
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Simplified real-time listener for pending transactions only
  useEffect(() => {
    if (!user || !userProfile || teamsLoading || teams.length === 0) return;

    let unsubscribe: (() => void) | null = null;
    setLoading(true);
    setError(null);

    try {
      const userTeamIds = teams.map(team => team.id);
      const teamsMap = new Map(teams.map(team => [team.id, team]));

      // Get today's date range
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      // Simplest possible query - only date range to avoid composite index
      // All other filtering done on client side
      unsubscribe = onSnapshot(
        query(
          collection(db, 'transactions'),
          where('createdAt', '>=', startOfDay),
          where('createdAt', '<=', endOfDay),
          orderBy('createdAt', 'desc')
        ),
        (snapshot) => {
          const pendingTransactions: BotTransaction[] = [];

          snapshot.docs.forEach(doc => {
            const data = doc.data() as any;
            
            // Complete client-side filtering for all conditions
            if (
              data.type === 'withdraw' && // Filter withdraw transactions
              data.createdBy === 'api' && // Filter API transactions
              (data.status === 'รอโอน' || data.status === 'กำลังโอน') && // Filter pending statuses
              data.teamId && 
              userTeamIds.includes(data.teamId) // Filter user teams
            ) {
              const team = teamsMap.get(data.teamId);
              pendingTransactions.push({
                id: doc.id,
                ...data,
                teamName: team?.name || `ทีม ${data.teamId?.substring(0, 8) || 'ไม่ระบุ'}`
              } as BotTransaction);
            }
          });

          setTransactions(pendingTransactions);
          setLastUpdated(new Date());
          setLoading(false);
        },
        (error) => {
          console.error('Real-time listener error:', error);
          setError('ไม่สามารถโหลดข้อมูลได้');
          setLoading(false);
        }
      );

      unsubscribeRef.current = unsubscribe;
    } catch (err) {
      console.error('Error setting up listener:', err);
      setError('ไม่สามารถเชื่อมต่อข้อมูลได้');
      setLoading(false);
    }

    return () => unsubscribe?.();
  }, [user, userProfile, teams, teamsLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  // Simple refresh function
  const handleRefresh = () => {
    setLastUpdated(new Date());
    toast.success('ข้อมูลอัพเดทแล้ว');
  };

  const openManageModal = (transaction: BotTransaction) => {
    setSelectedTransaction(transaction);
    setModalStatus('');
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
          const transaction = transactions.find(t => t.id === transactionId);
          
          if (transaction && transaction.websiteId) {
            const refundResult = await runTransaction(db, async (firestoreTransaction) => {
              const websiteDocRef = doc(db, 'websites', transaction.websiteId!);
              const websiteDocSnap = await firestoreTransaction.get(websiteDocRef);
              
              if (!websiteDocSnap.exists()) {
                throw new Error(`Website not found: ${transaction.websiteName}`);
              }
              
              const websiteData = websiteDocSnap.data();
              const currentBalance = websiteData.balance || 0;
              const refundAmount = transaction.amount;
              const newBalance = currentBalance + refundAmount;

              firestoreTransaction.update(websiteDocRef, {
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

            await addDoc(collection(db, 'transactions'), {
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
              note: `คืนเครดิตจากการยกเลิกธุรกรรม ${transaction.transactionId}`,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              createdBy: userProfile?.displayName || user?.displayName || 'ระบบ',
              lastModifiedBy: userProfile?.displayName || user?.displayName || 'ระบบ',
              lastModifiedByEmail: user?.email || '',
              lastModifiedAt: serverTimestamp()
            });

            toast.success(`คืนเครดิต ฿${refundResult.refundAmount.toFixed(2)} ให้เว็บไซต์ ${refundResult.websiteName} สำเร็จ`);
          }
        } catch (refundError) {
          console.error('Error refunding credit:', refundError);
          toast.error('เกิดข้อผิดพลาดในการคืนเครดิต');
        }
      }

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
      if (!modalStatus || modalStatus === '') {
        toast.error('กรุณาเลือกสถานะ');
        return;
      }
      
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

  // Filter transactions
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

    return filtered;
  };

  const filteredTransactions = getFilteredTransactions();

  if (!user) {
    return (
      <DashboardLayout title="ธุรกรรม Bot API" subtitle="กรุณาเข้าสู่ระบบ">
        <div className="text-center text-red-600">
          กรุณาเข้าสู่ระบบเพื่อใช้งาน
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="ธุรกรรม Bot API - รายการรอดำเนินการ" 
      subtitle="แสดงเฉพาะรายการ 'รอโอน' และ 'กำลังโอน' แบบ Real-time"
    >
      <div className="space-y-6">
        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="ค้นหา Transaction ID, Customer, เว็บไซต์..."
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              {/* Team Filter */}
              {teams.length > 1 && (
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    ทีม:
                  </label>
                  <select
                    value={selectedTeamFilter}
                    onChange={(e) => setSelectedTeamFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="all">ทุกทีม</option>
                    {teams.map(team => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Status Filter */}
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  สถานะ:
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="รอโอน">รอโอน</option>
                  <option value="กำลังโอน">กำลังโอน</option>
                </select>
              </div>

              {/* Clear Filters Button */}
              {(searchTerm || statusFilter !== 'all' || selectedTeamFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setSelectedTeamFilter('all');
                  }}
                  className="px-3 py-2 text-sm bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  ธุรกรรม Bot API - วันนี้
                </h3>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    รายการรอดำเนินการ
                  </p>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs text-green-600 dark:text-green-400">Real-time</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Status Cards */}
              <div className="flex items-center gap-4">
                {/* รอโอน Card */}
                <div className="flex items-center gap-3 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/30 dark:to-orange-900/30 px-4 py-3 rounded-xl border border-yellow-200/50 dark:border-yellow-600/30 shadow-sm">
                  <div className="flex items-center justify-center w-8 h-8 bg-yellow-100 dark:bg-yellow-800/50 rounded-lg">
                    <span className="text-lg text-yellow-600 dark:text-yellow-400 animate-spin" style={{animationDuration: '2s'}}>⏳</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase tracking-wide">รอโอน</span>
                    {loading ? (
                      <div className="h-5 w-8 bg-yellow-300 dark:bg-yellow-600 rounded animate-pulse mt-1"></div>
                    ) : (
                      <span className="text-xl font-bold text-yellow-700 dark:text-yellow-300">
                        {transactions.filter(t => t.status === 'รอโอน').length}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* กำลังโอน Card */}
                <div className="flex items-center gap-3 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 px-4 py-3 rounded-xl border border-blue-200/50 dark:border-blue-600/30 shadow-sm">
                  <div className="flex items-center justify-center w-8 h-8 bg-blue-100 dark:bg-blue-800/50 rounded-lg">
                    <span className="text-lg text-blue-600 dark:text-blue-400">🔄</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">กำลังโอน</span>
                    {loading ? (
                      <div className="h-5 w-8 bg-blue-300 dark:bg-blue-600 rounded animate-pulse mt-1"></div>
                    ) : (
                      <span className="text-xl font-bold text-blue-700 dark:text-blue-300">
                        {transactions.filter(t => t.status === 'กำลังโอน').length}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-sm text-gray-500 dark:text-gray-400">
                อัพเดทล่าสุด: {lastUpdated.toLocaleTimeString('th-TH')}
              </div>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">วันที่</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Transaction ID</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">Customer</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">เว็บไซต์</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">ธนาคาร</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">เลขบัญชี</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">ชื่อจริง</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-900 dark:text-white">จำนวนเงิน</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">สถานะ</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-900 dark:text-white">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <div className="animate-spin text-4xl text-blue-600 dark:text-blue-400 mb-2">
                          ⏳
                        </div>
                        <span className="text-gray-500 dark:text-gray-400">กำลังโหลดข้อมูล...</span>
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center">
                      <div className="text-red-500 mb-4">
                        <svg className="h-12 w-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-lg font-semibold">เกิดข้อผิดพลาด</p>
                        <p className="text-sm">{error}</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center">
                      <div className="text-gray-500 dark:text-gray-400">
                        <div className="flex justify-center items-center mb-4">
                          <div className="animate-spin text-4xl text-blue-600 dark:text-blue-400">
                            ⏳
                          </div>
                        </div>
                        <p>ไม่พบรายการรอดำเนินการ</p>
                        <p className="text-sm">ไม่มีธุรกรรมที่มีสถานะ "รอโอน" หรือ "กำลังโอน"</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((transaction) => (
                    <tr key={transaction.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-4 px-4">
                        <div className="text-sm text-gray-900 dark:text-white">
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
                          {getBankDisplayName(transaction.bankName)}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-sm font-mono text-gray-700 dark:text-gray-300">
                          {transaction.accountNumber}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-sm text-gray-900 dark:text-white truncate max-w-32" title={transaction.realName}>
                          {transaction.realName}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="text-sm font-bold text-red-600 dark:text-red-400">
                          -฿{formatAmount(transaction.amount)}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-full ${statusConfig[transaction.status]?.color}`}>
                            <span className="text-xs">{statusConfig[transaction.status]?.icon}</span>
                            {statusConfig[transaction.status]?.label}
                          </span>
                          {transaction.note && (
                            <div className="w-2 h-2 bg-red-500 rounded-full" title={transaction.note}></div>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        {isUser() ? (
                          <span className="text-xs text-gray-400">ไม่มีสิทธิ์</span>
                        ) : (
                          <button
                            onClick={() => openManageModal(transaction)}
                            disabled={updatingStatus === transaction.id}
                            className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg disabled:opacity-50"
                          >
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
        </div>

        {/* Manage Modal */}
        <PortalModal isOpen={showManageModal && !!selectedTransaction}>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    จัดการธุรกรรม
                  </h3>
                  <button
                    onClick={closeManageModal}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {selectedTransaction && (
                  <>
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

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        สถานะ
                      </label>
                      <select
                        value={modalStatus}
                        onChange={(e) => setModalStatus(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">- เลือกสถานะ -</option>
                        {statusOptions.map(status => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        หมายเหตุ
                        {(modalStatus === 'สำเร็จ' || modalStatus === 'ยกเลิก') && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </label>
                      <textarea
                        value={modalNote}
                        onChange={(e) => setModalNote(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                        placeholder="เพิ่มหมายเหตุ..."
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={closeManageModal}
                        className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
                      >
                        ยกเลิก
                      </button>
                      <button
                        onClick={handleSaveChanges}
                        disabled={updatingStatus === selectedTransaction.id}
                        className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg"
                      >
                        {updatingStatus === selectedTransaction.id ? 'กำลังบันทึก...' : 'บันทึก'}
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