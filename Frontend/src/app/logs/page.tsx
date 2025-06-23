'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useUserProfile } from '../../contexts/UserContext';
import { usePermission } from '../../hooks/usePermission';
import { collection, getDocs, query, orderBy, where, limit, startAfter, DocumentSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  DocumentTextIcon,
  UserIcon,
  ShieldCheckIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  XCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface LogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: string;
  category: 'auth' | 'profile' | 'team' | 'system' | 'security';
  details: string;
  ipAddress?: string;
  severity: 'info' | 'warning' | 'error' | 'success';
}

export default function LogsPage() {
  const { user } = useAuth();
  const { userProfile } = useUserProfile();
  const { canAccessAdminPanel } = usePermission();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'auth' | 'profile' | 'team' | 'system' | 'security'>('all');
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'info' | 'warning' | 'error' | 'success'>('all');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  // Pagination states - Improved for large datasets
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  
  // Use refs for values that shouldn't trigger re-renders
  const lastDocRef = useRef<any>(null);
  const isLoadingRef = useRef(false);
  const paginationCache = useRef<Map<number, LogEntry[]>>(new Map());
  const cursorCache = useRef<Map<number, any>>(new Map());
  
  // Summary statistics (for all data, not just displayed)
  const [allTimeStats, setAllTimeStats] = useState({
    totalLogs: 0,
    todayLogs: 0,
    errorLogs: 0,
    warningLogs: 0
  });

  // Redirect if not admin
  useEffect(() => {
    if (userProfile && !canAccessAdminPanel()) {
      toast.error('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
      window.location.href = '/dashboard';
    }
  }, [userProfile, canAccessAdminPanel]);

  // Optimized loading function with improved pagination for large datasets
  const loadLogs = useCallback(async (forceRefresh = false, page = 1) => {

    
    if (!user || !userProfile || !canAccessAdminPanel()) {

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

        setLogs(cachedData);
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

      // Create optimized cursor-based pagination query
      let logsQuery = query(
        collection(db, 'systemLogs'),
        orderBy('timestamp', 'desc'),
        limit(itemsPerPage)
      );

      // For pagination beyond first page, use cached cursor
      if (page > 1) {
        const prevPageCursor = cursorCache.current.get(page - 1);
        if (prevPageCursor) {
          logsQuery = query(
            collection(db, 'systemLogs'),
            orderBy('timestamp', 'desc'),
            startAfter(prevPageCursor),
            limit(itemsPerPage)
          );
        } else {
          // Build missing cursor by querying the previous page
          let currentCursor = null;
          
          for (let i = 1; i < page; i++) {
            if (cursorCache.current.has(i)) {
              currentCursor = cursorCache.current.get(i);
            } else {
              const buildQuery: any = currentCursor 
                ? query(collection(db, 'systemLogs'), orderBy('timestamp', 'desc'), startAfter(currentCursor), limit(itemsPerPage))
                : query(collection(db, 'systemLogs'), orderBy('timestamp', 'desc'), limit(itemsPerPage));
               
              const buildSnapshot: any = await getDocs(buildQuery);
              if (buildSnapshot.docs.length > 0) {
                currentCursor = buildSnapshot.docs[buildSnapshot.docs.length - 1];
                cursorCache.current.set(i, currentCursor);
              } else {
                break;
              }
            }
          }
          
          if (currentCursor) {
            logsQuery = query(
              collection(db, 'systemLogs'),
              orderBy('timestamp', 'desc'),
              startAfter(currentCursor),
              limit(itemsPerPage)
            );
          }
        }
      }

      // Execute queries in parallel

      const [logsSnapshot, allStatsSnapshot] = await Promise.all([
        getDocs(logsQuery),
        // Get all records for accurate statistics (only on first load or refresh)
        page === 1 || forceRefresh ? getDocs(query(
          collection(db, 'systemLogs'),
          orderBy('timestamp', 'desc')
        )) : Promise.resolve(null)
      ]);

      // Process log records
      const logsData = logsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LogEntry[];



      // Cache the page data and cursor
      paginationCache.current.set(page, logsData);
      if (logsSnapshot.docs.length > 0) {
        cursorCache.current.set(page, logsSnapshot.docs[logsSnapshot.docs.length - 1]);
      }

      setLogs(logsData);
      setCurrentPage(page);
      setLastUpdated(new Date());


      // Update statistics if we have all data
      if (allStatsSnapshot) {
        const allLogs = allStatsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as LogEntry[];

        const today = new Date();
        const todayLogs = allLogs.filter(log => {
          const logDate = new Date(log.timestamp);
          return logDate.toDateString() === today.toDateString();
        });

        setAllTimeStats({
          totalLogs: allLogs.length,
          todayLogs: todayLogs.length,
          errorLogs: allLogs.filter(log => log.severity === 'error').length,
          warningLogs: allLogs.filter(log => log.severity === 'warning').length
        });

        setTotalItems(allLogs.length);
        setTotalPages(Math.ceil(allLogs.length / itemsPerPage));
      }

      setHasMore(logsData.length === itemsPerPage);

    } catch (error) {
      // Error loading logs
      toast.error('ไม่สามารถโหลดข้อมูล Log ได้');
      setLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
      isLoadingRef.current = false;
    }
  }, [user, userProfile, canAccessAdminPanel, itemsPerPage]);

  useEffect(() => {
    if (user && userProfile && canAccessAdminPanel()) {
      loadLogs();
    }
  }, [user?.uid, userProfile?.role]);

  // Go to specific page
  const goToPage = (page: number) => {

    if (page >= 1 && page <= totalPages && page !== currentPage) {
      
      loadLogs(false, page);
    } else {
      
    }
  };

  // Refresh data
  const handleRefresh = () => {
    loadLogs(true, 1);
  };

  // Get page numbers for pagination
  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const showPages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(showPages / 2));
    let endPage = Math.min(totalPages, startPage + showPages - 1);
    
    if (endPage - startPage < showPages - 1) {
      startPage = Math.max(1, endPage - showPages + 1);
    }

    if (startPage > 1) {
      pages.push(1);
      if (startPage > 2) {
        pages.push('...');
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push('...');
      }
      pages.push(totalPages);
    }

    return pages;
  };

  // Filter logs based on search and filters (current page only)
  const getFilteredLogs = () => {
    return logs.filter(log => {
      const matchesSearch = 
        log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.details.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = filterCategory === 'all' || log.category === filterCategory;
      const matchesSeverity = filterSeverity === 'all' || log.severity === filterSeverity;
      
      return matchesSearch && matchesCategory && matchesSeverity;
    });
  };

  const filteredLogs = getFilteredLogs();

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

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'auth':
        return <ShieldCheckIcon className="h-4 w-4" />;
      case 'profile':
        return <UserIcon className="h-4 w-4" />;
      case 'team':
        return <UserIcon className="h-4 w-4" />;
      case 'system':
        return <DocumentTextIcon className="h-4 w-4" />;
      case 'security':
        return <ExclamationTriangleIcon className="h-4 w-4" />;
      default:
        return <InformationCircleIcon className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'auth':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'profile':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'team':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'system':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
      case 'security':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'success':
        return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <XCircleIcon className="h-4 w-4 text-red-500" />;
      case 'info':
      default:
        return <InformationCircleIcon className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'success':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'warning':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'info':
      default:
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
    }
  };

  // Statistics (from all logs, not just current page)
  const totalLogs = allTimeStats.totalLogs;
  const todayLogs = allTimeStats.todayLogs;
  const errorLogs = allTimeStats.errorLogs;
  const warningLogs = allTimeStats.warningLogs;

  if (!canAccessAdminPanel()) {
    return (
      <DashboardLayout title="ไม่มีสิทธิ์เข้าถึง" subtitle="คุณไม่มีสิทธิ์เข้าถึงหน้านี้">
        <div className="text-center py-12">
          <ExclamationTriangleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">ไม่มีสิทธิ์เข้าถึง</h2>
          <p className="text-gray-600 dark:text-gray-400">คุณต้องเป็นแอดมินจึงจะเข้าถึงหน้านี้ได้</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="System Logs" 
      subtitle="ตรวจสอบกิจกรรมและการทำงานของระบบ"
    >
      <div className="space-y-6">
        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/30 dark:border-gray-700/30">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg">
                <DocumentTextIcon className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">รายการทั้งหมด</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalLogs}</p>
            </div>
          </div>

          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/30 dark:border-gray-700/30">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                <ClockIcon className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">วันนี้</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{todayLogs}</p>
            </div>
          </div>

          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/30 dark:border-gray-700/30">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
                <ExclamationTriangleIcon className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">คำเตือน</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{warningLogs}</p>
            </div>
          </div>

          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/30 dark:border-gray-700/30">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
                <XCircleIcon className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">ข้อผิดพลาด</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{errorLogs}</p>
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
                placeholder="ค้นหาผู้ใช้, การกระทำ, หรือรายละเอียด..."
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="all">หมวดหมู่ทั้งหมด</option>
                <option value="auth">การเข้าสู่ระบบ</option>
                <option value="profile">ข้อมูลส่วนตัว</option>
                <option value="team">การจัดการทีม</option>
                <option value="system">ระบบ</option>
                <option value="security">ความปลอดภัย</option>
              </select>

              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="all">ความสำคัญทั้งหมด</option>
                <option value="info">ข้อมูล</option>
                <option value="success">สำเร็จ</option>
                <option value="warning">คำเตือน</option>
                <option value="error">ข้อผิดพลาด</option>
              </select>

              <select
                value={itemsPerPage}
                onChange={(e) => {
                  const newItemsPerPage = Number(e.target.value);
                  setItemsPerPage(newItemsPerPage);
                  setCurrentPage(1);
                  paginationCache.current.clear();
                  cursorCache.current.clear();
                  loadLogs(true, 1);
                }}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value={25}>25 รายการ</option>
                <option value={50}>50 รายการ</option>
                <option value={100}>100 รายการ</option>
                <option value={200}>200 รายการ</option>
              </select>

              <button
                onClick={handleRefresh}
                disabled={loading || refreshing}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ClockIcon className="h-4 w-4" />
                <span>รีเฟรช</span>
              </button>
            </div>
          </div>
        </div>

        {/* Logs List */}
        <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/30 dark:border-gray-700/30 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                <DocumentTextIcon className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">System Logs</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  รายการกิจกรรมและการทำงานของระบบ
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {/* Page info */}
            <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400 mb-4">
              <div>
                📊 <strong>สถิติรวมทั้งหมด (ข้อมูลทั้งระบบ)</strong>
              </div>
              <div>
                หน้า {currentPage}: {filteredLogs.length} รายการ
                {(loading || refreshing) && (
                  <span className="ml-2 text-green-600 dark:text-green-400">
                    🔄 กำลังอัพเดท...
                  </span>
                )}
              </div>
            </div>

            {loading ? (
              <div className="py-8 text-center">
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <span className="ml-2 text-gray-500 dark:text-gray-400">กำลังโหลดข้อมูล...</span>
                </div>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="py-8 text-center">
                <div className="text-gray-500 dark:text-gray-400">
                  <DocumentTextIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>ไม่พบข้อมูล Log</p>
                  <p className="text-sm">ยังไม่มีกิจกรรมในระบบ</p>
                </div>
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className={`p-4 rounded-lg border-l-4 ${getSeverityColor(log.severity)} transition-all duration-200 hover:shadow-md`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className="flex items-center space-x-2">
                        {getSeverityIcon(log.severity)}
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(log.category)}`}>
                          {getCategoryIcon(log.category)}
                          <span className="ml-1">
                            {log.category === 'auth' && 'การเข้าสู่ระบบ'}
                            {log.category === 'profile' && 'ข้อมูลส่วนตัว'}
                            {log.category === 'team' && 'การจัดการทีม'}
                            {log.category === 'system' && 'ระบบ'}
                            {log.category === 'security' && 'ความปลอดภัย'}
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(log.timestamp)}
                    </div>
                  </div>
                  
                  <div className="mt-2">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {log.userName}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        ({log.userEmail})
                      </span>
                    </div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {log.action}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {log.details}
                    </div>
                    {log.ipAddress && (
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <div>IP: {log.ipAddress}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                รายการ {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, totalItems)} จาก {totalItems.toLocaleString()} รายการ
              </div>
              
              <div className="flex items-center space-x-2">
                {/* First Page */}
                <button
                  onClick={() => goToPage(1)}
                  disabled={currentPage === 1 || loading || refreshing}
                  className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronDoubleLeftIcon className="h-4 w-4" />
                </button>
                
                {/* Previous Page */}
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1 || loading || refreshing}
                  className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>

                {/* Page Numbers */}
                <div className="flex items-center space-x-1">
                  {getPageNumbers().map((pageNum, index) => {
                    if (typeof pageNum === 'string') {
                      return <span key={`ellipsis-${index}`} className="px-2">...</span>;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => goToPage(pageNum)}
                        disabled={loading || refreshing}
                        className={`px-3 py-1 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          pageNum === currentPage
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                {/* Next Page */}
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages || loading || refreshing}
                  className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
                
                {/* Last Page */}
                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage === totalPages || loading || refreshing}
                  className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronDoubleRightIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
} 