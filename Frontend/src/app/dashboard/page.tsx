'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { 
  CurrencyDollarIcon, 
  ShoppingBagIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  GlobeAltIcon,
  PlusIcon,
  EyeIcon,
  EyeSlashIcon,
  TrashIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import { useUserProfile } from '../../contexts/UserContext';
import { usePermission } from '../../hooks/usePermission';
import { useMultiTeam } from '../../hooks/useMultiTeam';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, orderBy, where, limit, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import toast from 'react-hot-toast';
import { cacheManager, CACHE_KEYS } from '../../utils/cacheManager';
import { 
  logWebsiteCreated, 
  logWebsiteDeleted, 
  logWebsiteStatusChanged, 
  logWebsiteTopup 
} from '../../utils/logger';
import { dashboardDataManager } from '@/utils/dashboardDataManager';

// Portal Modal Component
const PortalModal = ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) => {
  if (!isOpen) return null;
  
  return createPortal(
    children,
    document.body
  );
};

export default function Dashboard() {
  const { user } = useAuth();
  const { userProfile } = useUserProfile();
  const { 
    canViewWebsites, 
    canCreateWebsites, 
    canEditWebsites, 
    canDeleteWebsites,
    canViewTopup,
    canCreateTopup,
    canAccessTeamData,
    canViewApiKeys,
    canAccessAdminPanel,
    isUser,
    isMemberOfTeam,
    hasTeamPermission,
    refreshPermissions
  } = usePermission();
  const { teams } = useMultiTeam();
  const [stats, setStats] = useState({
    totalBalance: 0,
    monthlyIncome: 0,
    monthlyExpense: 0,
    savings: 0
  });
  const [todayTopupAmount, setTodayTopupAmount] = useState(0);
  const [todayTopupByWebsite, setTodayTopupByWebsite] = useState<Record<string, number>>({});
  const [todayWithdrawAmount, setTodayWithdrawAmount] = useState(0);
  const [todayWithdrawByWebsite, setTodayWithdrawByWebsite] = useState<Record<string, number>>({});
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRealTimeActive, setIsRealTimeActive] = useState(false);

  // Animation states for updated values
  const [animationState, setAnimationState] = useState({
    todayTopup: false,
    todayWithdraw: false,
    totalBalance: false,
    websiteBalances: {} as Record<string, boolean>
  });

  // เพิ่ม state เพื่อป้องกันการโหลดข้อมูลซ้ำซ้อน
  const [isLoadingRef, setIsLoadingRef] = useState(false);
  
  // เพิ่ม debounce timer สำหรับ real-time updates
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Website Management State
  const [websites, setWebsites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{show: boolean, websiteId: string, websiteName: string}>({
    show: false,
    websiteId: '',
    websiteName: ''
  });
  
  const [topupModal, setTopupModal] = useState<{show: boolean, websiteId: string, websiteName: string}>({
    show: false,
    websiteId: '',
    websiteName: ''
  });
  
  const [topupAmount, setTopupAmount] = useState('');
  const [topupNote, setTopupNote] = useState('');
  
  const [topupConfirm, setTopupConfirm] = useState<{show: boolean, websiteId: string, websiteName: string, amount: number, note: string}>({
    show: false,
    websiteId: '',
    websiteName: '',
    amount: 0,
    note: ''
  });

  // Withdraw Modal State
  const [withdrawModal, setWithdrawModal] = useState<{show: boolean, websiteId: string, websiteName: string}>({
    show: false,
    websiteId: '',
    websiteName: ''
  });
  
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNote, setWithdrawNote] = useState('');
  
  const [withdrawConfirm, setWithdrawConfirm] = useState<{show: boolean, websiteId: string, websiteName: string, amount: number, note: string}>({
    show: false,
    websiteId: '',
    websiteName: '',
    amount: 0,
    note: ''
  });

  // Add loading state for topup processing
  const [isTopupProcessing, setIsTopupProcessing] = useState(false);
  const [isWithdrawProcessing, setIsWithdrawProcessing] = useState(false);

  const [showAddWebsite, setShowAddWebsite] = useState(false);
  const [newWebsite, setNewWebsite] = useState({
    name: '',
    url: '',
    apiKey: '',
    teamId: '' // เพิ่มการเลือกทีม
  });
  const [visibleKeys, setVisibleKeys] = useState<{[key: string]: boolean}>({});
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('all'); // กรองตามทีม

  // Cache system for websites
  interface WebsitesCacheData {
    websites: any[];
    stats: typeof stats;
    timestamp: number;
  }

  let websitesCache: WebsitesCacheData | null = null;
  const WEBSITES_CACHE_DURATION = 60000; // 1 minute

  // Animation helper function
  const triggerAnimation = (type: 'todayTopup' | 'todayWithdraw' | 'totalBalance', websiteId?: string) => {
    if (websiteId) {
      setAnimationState(prev => ({
        ...prev,
        websiteBalances: {
          ...prev.websiteBalances,
          [websiteId]: true
        }
      }));
      
      setTimeout(() => {
        setAnimationState(prev => ({
          ...prev,
          websiteBalances: {
            ...prev.websiteBalances,
            [websiteId]: false
          }
        }));
      }, 2000);
    } else {
      setAnimationState(prev => ({
        ...prev,
        [type]: true
      }));
      
      setTimeout(() => {
        setAnimationState(prev => ({
          ...prev,
          [type]: false
        }));
      }, 2000);
    }
  };

  // ===== ปรับปรุง Data Loading โดยใช้ DashboardDataManager =====
  
  // แทนที่ loadWebsitesOptimized, loadTodayTopupAmount, loadTodayWithdrawAmount
  const loadDashboardData = useCallback(async (forceRefresh = false) => {
    if (!user || !userProfile) return;
    
    // ป้องกันการโหลดข้อมูลซ้ำซ้อน
    if (isLoadingRef && !forceRefresh) {
      console.log('Dashboard data is already loading, skipping...');
      return;
    }
    
    try {
      setIsLoadingRef(true);
      
      if (forceRefresh || !refreshing) {
        setLoading(true);
      } else {
        setLoading(true);
      }
      
      // Get user team IDs
      const userTeamIds = teams.map(team => team.id);
      
      // Load all dashboard data in one consolidated call
      const dashboardData = await dashboardDataManager.loadDashboardData(
        user.uid,
        userTeamIds,
        userProfile.role || 'user',
        forceRefresh
      );
      
      // Update all state variables from the consolidated data
      setWebsites(dashboardData.websites);
      setTodayTopupAmount(dashboardData.stats.todayTopup);
      setTodayWithdrawAmount(dashboardData.stats.todayWithdraw);
      setTodayTopupByWebsite(dashboardData.stats.todayTopupByWebsite);
      setTodayWithdrawByWebsite(dashboardData.stats.todayWithdrawByWebsite);
      
      // Calculate stats using consolidated data
      const totalBalance = dashboardData.stats.totalBalance;
      const totalDailyTopup = dashboardData.websites.reduce(
        (sum, site: any) => sum + (site.dailyTopup || 0), 0
      );
      
      const calculatedStats = {
        totalBalance,
        monthlyIncome: totalDailyTopup * 30,
        monthlyExpense: totalBalance * 0.1,
        savings: totalBalance * 0.8
      };
      
      setStats(calculatedStats);
      setLastUpdated(new Date());
      
    } catch (error: any) {
      console.error('Error loading dashboard data:', error);
      
      // Show user-friendly error messages
      if (error.code === 'permission-denied') {
        toast.error('ไม่มีสิทธิ์เข้าถึงข้อมูล');
      } else if (error.code === 'unavailable') {
        toast.error('บริการไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง');
      } else {
        toast.error('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setIsLoadingRef(false);
    }
  }, [user?.uid, teams, userProfile?.role, refreshing, isLoadingRef]);

  // Force refresh function - แทนที่ handleRefreshWebsites
  const handleRefreshDashboard = useCallback(async () => {
    setRefreshing(true);
    
    // Clear cache และ refresh permissions
    dashboardDataManager.clearUserCache(user?.uid || '');
    await refreshPermissions();
    
    // Reload data
    await loadDashboardData(true);
    
    toast.success('ข้อมูลถูกอัปเดตแล้ว', {
      duration: 2000,
      position: 'top-right',
    });
  }, [user?.uid, loadDashboardData, refreshPermissions]);

  // ===== ปรับปรุง useEffect หลัก =====
  
  useEffect(() => {
    if (user && teams.length >= 0) {
      loadDashboardData();
    }
  }, [user?.uid, teams.length, loadDashboardData]);

  // ===== ปรับปรุง Real-time Listeners =====
  
  // Real-time listener for websites changes
  useEffect(() => {
    if (!user || !userProfile) return;

    let websiteUnsubscribe: (() => void) | null = null;
    let isInitialLoad = true;

    // Set up real-time listener for websites collection
    const websitesRef = collection(db, 'websites');
    websiteUnsubscribe = onSnapshot(
      websitesRef,
      (snapshot) => {
        // Skip initial load to avoid duplicate data
        if (isInitialLoad) {
          isInitialLoad = false;
          return;
        }

        const changes = snapshot.docChanges();
        
        if (changes.length > 0) {
          setIsRealTimeActive(true);
          
          // Check if any changes are relevant to current user
          const userTeamIds = teams.map(team => team.id);
          const relevantChanges = changes.filter(change => {
            const data = change.doc.data();
            
            // Check if website belongs to user directly
            if (data.userId === user.uid) return true;
            
            // Check if user is member of the team
            if (data.teamId && userTeamIds.includes(data.teamId)) {
              return true;
            }
            
            return false;
          });

          if (relevantChanges.length > 0) {
            // อัพเดท state แบบ incremental แทนการโหลดข้อมูลใหม่ทั้งหมด
            relevantChanges.forEach(change => {
              const data = change.doc.data();
              const websiteId = change.doc.id;
              
              if (change.type === 'added') {
                // เพิ่มเว็บไซต์ใหม่
                setWebsites(prev => {
                  // ตรวจสอบว่ามีเว็บไซต์นี้อยู่แล้วหรือไม่
                  if (prev.some(w => w.id === websiteId)) return prev;
                  
                  const newWebsite = {
                    id: websiteId,
                    ...data,
                    teamName: data.teamId ? teams.find(t => t.id === data.teamId)?.name || 'ไม่ระบุทีม' : null
                  };
                  return [...prev, newWebsite];
                });
                
                toast.success(`เพิ่มเว็บไซต์ใหม่: ${data.name}`, {
                  duration: 3000,
                  position: 'top-right',
                });
              }
              
              else if (change.type === 'modified') {
                // อัพเดทข้อมูลเว็บไซต์ที่มีอยู่
                setWebsites(prev => 
                  prev.map(w => 
                    w.id === websiteId 
                      ? { 
                          ...w, 
                          ...data,
                          teamName: data.teamId ? teams.find(t => t.id === data.teamId)?.name || 'ไม่ระบุทีม' : null
                        }
                      : w
                  )
                );
                
                // Trigger animation for balance update
                if (data.balance !== undefined) {
                  triggerAnimation('totalBalance', websiteId);
                }
                
                toast.success(`อัพเดท: ${data.name}`, {
                  duration: 2000,
                  position: 'top-right',
                });
              }
              
              else if (change.type === 'removed') {
                // ลบเว็บไซต์
                setWebsites(prev => prev.filter(w => w.id !== websiteId));
                
                toast.success(`ลบเว็บไซต์: ${data.name}`, {
                  duration: 3000,
                  position: 'top-right',
                });
              }
            });
            
            // อัพเดท stats โดยไม่ต้องโหลดข้อมูลใหม่
            setStats(prevStats => {
              const newTotalBalance = websites.reduce((sum, site) => sum + (site.balance || 0), 0);
              const totalDailyTopup = websites.reduce((sum, site) => sum + (site.dailyTopup || 0), 0);
              
              return {
                totalBalance: newTotalBalance,
                monthlyIncome: totalDailyTopup * 30,
                monthlyExpense: newTotalBalance * 0.1,
                savings: newTotalBalance * 0.8
              };
            });
            
            setLastUpdated(new Date());
          }
          
          setTimeout(() => setIsRealTimeActive(false), 2000);
        }
      },
      (error) => {
        console.error('Real-time listener error:', error);
        setIsRealTimeActive(false);
        
        // หากเกิดข้อผิดพลาด ให้โหลดข้อมูลใหม่เพียงครั้งเดียว
        setTimeout(() => {
          loadDashboardData(true);
        }, 5000);
      }
    );

    return () => {
      if (websiteUnsubscribe) {
        websiteUnsubscribe();
      }
    };
  }, [user?.uid, userProfile?.role, teams, triggerAnimation]);

  // Real-time listener for topup history changes
  useEffect(() => {
    if (!user || !userProfile) return;

    let topupUnsubscribe: (() => void) | null = null;
    let isInitialLoad = true;

    // Set up real-time listener for topupHistory collection
    const topupHistoryRef = collection(db, 'topupHistory');
    topupUnsubscribe = onSnapshot(
      query(topupHistoryRef, orderBy('timestamp', 'desc'), limit(50)),
      (snapshot) => {
        // Skip initial load to avoid duplicate data
        if (isInitialLoad) {
          isInitialLoad = false;
          return;
        }

        // Check for new topup records only
        const newRecords = snapshot.docChanges().filter(change => change.type === 'added');
        
        if (newRecords.length > 0) {
          setIsRealTimeActive(true);
          
          // Check if any new records are relevant to current user
          const userTeamIds = teams.map(team => team.id);
          const relevantNewRecords = newRecords.filter(change => {
            const data = change.doc.data();
            
            if (userProfile.role === 'admin') return true;
            
            return data.teamId && userTeamIds.includes(data.teamId);
          });

          if (relevantNewRecords.length > 0) {
            // Update today's topup amount directly for immediate UI response
            const today = new Date().toDateString();
            let newTodayAmount = 0;
            const newWebsiteTopupMap: Record<string, number> = {};
            const websiteBalanceUpdates: Record<string, number> = {};
            
            relevantNewRecords.forEach(change => {
              const data = change.doc.data();
              const recordDate = data.timestamp?.toDate?.() || new Date(data.timestamp);
              
              // Check if record is from today
              if (recordDate.toDateString() === today) {
                const amount = data.amount || 0;
                const websiteId = data.websiteId;
                
                newTodayAmount += amount;
                
                // Track per website
                if (websiteId) {
                  newWebsiteTopupMap[websiteId] = (newWebsiteTopupMap[websiteId] || 0) + amount;
                  websiteBalanceUpdates[websiteId] = amount; // เพื่ออัพเดทยอดคงเหลือ
                }
              }
            });
            
            if (newTodayAmount > 0) {
              // Add to existing amounts
              setTodayTopupAmount(prev => prev + newTodayAmount);
              setTodayTopupByWebsite(prev => {
                const updated = { ...prev };
                Object.entries(newWebsiteTopupMap).forEach(([websiteId, amount]) => {
                  updated[websiteId] = (updated[websiteId] || 0) + amount;
                });
                return updated;
              });
              
              // อัพเดทยอดคงเหลือของเว็บไซต์ที่เกี่ยวข้อง
              setWebsites(prev => 
                prev.map(w => {
                  if (websiteBalanceUpdates[w.id]) {
                    const newBalance = (w.balance || 0) + websiteBalanceUpdates[w.id];
                    triggerAnimation('totalBalance', w.id);
                    return { ...w, balance: newBalance };
                  }
                  return w;
                })
              );
              
              // อัพเดท total stats
              setStats(prev => ({
                ...prev,
                totalBalance: prev.totalBalance + newTodayAmount
              }));
              
              // Trigger animation for topup amount
              triggerAnimation('todayTopup');
              
              // Show notification
              toast.success(`เงินเข้าใหม่ ฿${newTodayAmount.toLocaleString()}`, {
                duration: 4000,
                position: 'top-right',
              });
            }
            
            setLastUpdated(new Date());
          }
          
          setTimeout(() => setIsRealTimeActive(false), 2000);
        }
      },
      (error) => {
        console.error('Topup real-time listener error:', error);
        setIsRealTimeActive(false);
      }
    );

    return () => {
      if (topupUnsubscribe) {
        topupUnsubscribe();
      }
    };
  }, [user?.uid, userProfile?.role, teams, triggerAnimation]);

  // Real-time listener for withdraw history changes
  useEffect(() => {
    if (!user || !userProfile) return;

    let withdrawUnsubscribe: (() => void) | null = null;
    let isInitialLoad = true;

    // Set up real-time listener for withdrawHistory collection
    const withdrawHistoryRef = collection(db, 'withdrawHistory');
    withdrawUnsubscribe = onSnapshot(
      query(withdrawHistoryRef, orderBy('timestamp', 'desc'), limit(50)),
      (snapshot) => {
        // Skip initial load to avoid duplicate data
        if (isInitialLoad) {
          isInitialLoad = false;
          return;
        }

        // Check for new withdraw records only
        const newRecords = snapshot.docChanges().filter(change => change.type === 'added');
        
        if (newRecords.length > 0) {
          setIsRealTimeActive(true);
          
          // Check if any new records are relevant to current user
          const userTeamIds = teams.map(team => team.id);
          const relevantNewRecords = newRecords.filter(change => {
            const data = change.doc.data();
            
            if (userProfile.role === 'admin') return true;
            
            return data.teamId && userTeamIds.includes(data.teamId);
          });

          if (relevantNewRecords.length > 0) {
            // Update today's withdraw amount directly for immediate UI response
            const today = new Date().toDateString();
            let newTodayAmount = 0;
            const newWebsiteWithdrawMap: Record<string, number> = {};
            const websiteBalanceUpdates: Record<string, number> = {};
            
            relevantNewRecords.forEach(change => {
              const data = change.doc.data();
              const recordDate = data.timestamp?.toDate?.() || new Date(data.timestamp);
              
              // Check if record is from today
              if (recordDate.toDateString() === today) {
                const amount = data.amount || 0;
                const websiteId = data.websiteId;
                
                newTodayAmount += amount;
                
                // Track per website
                if (websiteId) {
                  newWebsiteWithdrawMap[websiteId] = (newWebsiteWithdrawMap[websiteId] || 0) + amount;
                  websiteBalanceUpdates[websiteId] = amount; // เพื่ออัพเดทยอดคงเหลือ
                }
              }
            });
            
            if (newTodayAmount > 0) {
              // Add to existing amounts
              setTodayWithdrawAmount(prev => prev + newTodayAmount);
              setTodayWithdrawByWebsite(prev => {
                const updated = { ...prev };
                Object.entries(newWebsiteWithdrawMap).forEach(([websiteId, amount]) => {
                  updated[websiteId] = (updated[websiteId] || 0) + amount;
                });
                return updated;
              });
              
              // อัพเดทยอดคงเหลือของเว็บไซต์ที่เกี่ยวข้อง
              setWebsites(prev => 
                prev.map(w => {
                  if (websiteBalanceUpdates[w.id]) {
                    const newBalance = (w.balance || 0) - websiteBalanceUpdates[w.id];
                    triggerAnimation('totalBalance', w.id);
                    return { ...w, balance: Math.max(0, newBalance) }; // ป้องกันยอดติดลบ
                  }
                  return w;
                })
              );
              
              // อัพเดท total stats
              setStats(prev => ({
                ...prev,
                totalBalance: Math.max(0, prev.totalBalance - newTodayAmount) // ป้องกันยอดติดลบ
              }));
              
              // Trigger animation for withdraw amount
              triggerAnimation('todayWithdraw');
              
              // Show notification
              toast.success(`เงินออกใหม่ ฿${newTodayAmount.toLocaleString()}`, {
                duration: 4000,
                position: 'top-right',
              });
            }
            
            setLastUpdated(new Date());
          }
          
          setTimeout(() => setIsRealTimeActive(false), 2000);
        }
      },
      (error) => {
        console.error('Withdraw real-time listener error:', error);
        setIsRealTimeActive(false);
      }
    );

    return () => {
      if (withdrawUnsubscribe) {
        withdrawUnsubscribe();
      }
    };
  }, [user?.uid, userProfile?.role, teams, triggerAnimation]);

  const toggleWebsiteStatus = async (id: string) => {
    if (!user) return;
    
    try {
      const website = websites.find(w => w.id === id);
      if (!website) return;
      
      // ตรวจสอบสิทธิ์ในการแก้ไขเว็บไซต์
      if (website.teamId && !hasTeamPermission(website.teamId, 'websites', 'update')) {
        toast.error('คุณไม่มีสิทธิ์แก้ไขเว็บไซต์นี้');
        return;
      }
      
      const newStatus = website.status === 'active' ? 'inactive' : 'active';
      
      // Update in Firestore - ใช้ main websites collection หรือ user subcollection
      let websiteRef;
      if (website.teamId) {
        websiteRef = doc(db, 'websites', id);
      } else {
        websiteRef = doc(db, 'users', user.uid, 'websites', id);
      }
      
      await updateDoc(websiteRef, {
        status: newStatus,
        lastUpdate: new Date().toISOString()
      });
      
      // Update local state
      setWebsites(websites.map(website => 
        website.id === id 
          ? { ...website, status: newStatus, lastUpdate: 'เพิ่งอัพเดท' }
          : website
      ));
      
      // Log the status change
      if (userProfile) {
        const teamName = website.teamName || teams.find(t => t.id === website.teamId)?.name;
        await logWebsiteStatusChanged(
          userProfile.uid,
          userProfile.email,
          userProfile.displayName,
          website.name,
          website.status,
          newStatus,
          teamName
        );
      }
      
      toast.success(`${newStatus === 'active' ? 'เปิด' : 'ปิด'}เว็บไซต์เรียบร้อย`);
      
    } catch (error) {
      // Error updating website status
      toast.error('ไม่สามารถอัพเดทสถานะได้');
    }
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const addWebsite = async () => {
    try {
      // Validate input
      if (!newWebsite.name.trim()) {
        toast.error('กรุณากรอกชื่อเว็บไซต์');
        return;
      }
      
      if (!newWebsite.url.trim()) {
        toast.error('กรุณากรอก URL');
        return;
      }
      
      if (!newWebsite.apiKey.trim()) {
        toast.error('กรุณากรอก API Key');
        return;
      }
      
      // URL validation
      try {
        new URL(newWebsite.url);
      } catch {
        toast.error('กรุณากรอก URL ให้ถูกต้อง');
        return;
      }
      
      // เก็บใน main websites collection
      const websitesRef = collection(db, 'websites');
      
      await addDoc(websitesRef, {
        name: newWebsite.name.trim(),
        url: newWebsite.url.trim(),
        balance: 0,
        dailyTopup: 0,
        isActive: true,
        apiKey: newWebsite.apiKey.trim(),
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        userId: user?.uid,
        teamId: newWebsite.teamId || null
      });
      
      // Show success message
      toast.success('เพิ่มเว็บไซต์สำเร็จ', {
        duration: 3000,
        position: 'top-right',
      });
      
      // Reset form
      setNewWebsite({
        name: '',
        url: '',
        teamId: '',
        apiKey: ''
      });
      setShowAddWebsite(false);
      
      // Clear cache and refresh data
      dashboardDataManager.clearUserCache(user?.uid || '');
      dashboardDataManager.clearCache('websites');
      
      // Refresh dashboard data
      await loadDashboardData(true);
      
    } catch (error: any) {
      console.error('Error adding website:', error);
      
      // Show error message
      if (error.code === 'permission-denied') {
        toast.error('ไม่มีสิทธิ์ในการเพิ่มเว็บไซต์');
      } else {
        toast.error('เกิดข้อผิดพลาดในการเพิ่มเว็บไซต์');
      }
    }
  };

  const showDeleteConfirm = (id: string, name: string) => {
    setDeleteConfirm({
      show: true,
      websiteId: id,
      websiteName: name
    });
  };

  const hideDeleteConfirm = () => {
    setDeleteConfirm({
      show: false,
      websiteId: '',
      websiteName: ''
    });
  };

  const confirmDelete = async () => {
    try {
      const { websiteId } = deleteConfirm;
      
      let targetCollection;
      let targetTopupCollection;
      let targetWithdrawCollection;
      
      // ใช้ main collections
      targetCollection = collection(db, 'websites');
      targetTopupCollection = collection(db, 'topupHistory');
      targetWithdrawCollection = collection(db, 'withdrawHistory');
      
      // Delete related topup history first
      const topupQuery = query(targetTopupCollection, where('websiteId', '==', websiteId));
      const topupSnapshot = await getDocs(topupQuery);
      
      const topupDeletePromises = topupSnapshot.docs.map(doc => 
        deleteDoc(doc.ref)
      );
      
      // Delete related withdraw history
      const withdrawQuery = query(targetWithdrawCollection, where('websiteId', '==', websiteId));
      const withdrawSnapshot = await getDocs(withdrawQuery);
      
      const withdrawDeletePromises = withdrawSnapshot.docs.map(doc => 
        deleteDoc(doc.ref)
      );
      
      // Wait for all history deletions to complete
      await Promise.all([...topupDeletePromises, ...withdrawDeletePromises]);
      
      // Delete the website
      await deleteDoc(doc(targetCollection, websiteId));
      
      // Show success message
      toast.success('ลบเว็บไซต์สำเร็จ', {
        duration: 3000,
        position: 'top-right',
      });
      
      // Reset delete confirm state
      setDeleteConfirm({
        show: false,
        websiteId: '',
        websiteName: ''
      });
      
      // Clear cache and refresh data
      dashboardDataManager.clearUserCache(user?.uid || '');
      dashboardDataManager.clearCache('websites');
      dashboardDataManager.clearCache('topupHistory');
      dashboardDataManager.clearCache('withdrawHistory');
      
      // Refresh dashboard data
      await loadDashboardData(true);
      
    } catch (error: any) {
      console.error('Error deleting website:', error);
      
      // Show error message
      if (error.code === 'permission-denied') {
        toast.error('ไม่มีสิทธิ์ในการลบเว็บไซต์');
      } else {
        toast.error('เกิดข้อผิดพลาดในการลบเว็บไซต์');
      }
    }
  };

  const showTopupModal = (id: string, name: string) => {
    setTopupModal({
      show: true,
      websiteId: id,
      websiteName: name
    });
    setTopupAmount('');
  };

  const hideTopupModal = () => {
    setTopupModal({
      show: false,
      websiteId: '',
      websiteName: ''
    });
    setTopupAmount('');
    setTopupNote('');
  };

  const confirmTopup = () => {
    if (!user || !topupModal.websiteId || !topupAmount) {
      toast.error('กรุณากรอกจำนวนเงินที่ต้องการเติม');
      return;
    }

    const amount = parseFloat(topupAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('กรุณากรอกจำนวนเงินที่ถูกต้อง');
      return;
    }

    // เก็บค่าไว้ในตัวแปรก่อนเคลียร์ modal
    const websiteId = topupModal.websiteId;
    const websiteName = topupModal.websiteName;
    const note = topupNote;

    setTopupModal({
      show: false,
      websiteId: '',
      websiteName: ''
    });
    setTopupConfirm({
      show: true,
      websiteId: websiteId,
      websiteName: websiteName,
      amount: amount,
      note: note
    });
  };

  const hideTopupConfirm = () => {
    setIsTopupProcessing(false);
    
    // เก็บค่าไว้ในตัวแปรก่อนเคลียร์ confirm modal
    const websiteId = topupConfirm.websiteId;
    const websiteName = topupConfirm.websiteName;
    const amount = topupConfirm.amount;
    const note = topupConfirm.note;
    
    setTopupConfirm({
      show: false,
      websiteId: '',
      websiteName: '',
      amount: 0,
      note: ''
    });
    setTopupModal({
      show: true,
      websiteId: websiteId,
      websiteName: websiteName
    });
    setTopupAmount(amount.toString());
    setTopupNote(note);
  };

  const executeTopup = async () => {
    if (!user || !userProfile) return;
    
    try {
      setIsTopupProcessing(true);
      
      const { websiteId, amount, note } = topupConfirm;
      
      // Get current website data before transaction
      const currentWebsite = websites.find(w => w.id === websiteId);
      if (!currentWebsite) {
        throw new Error('Website not found locally');
      }

      // Log the topup action
      // logWebsiteTopup(user.uid, websiteId, amount, note);
      
      let targetCollection;
      let targetHistoryCollection;
      
      // ใช้ main collections
      targetCollection = collection(db, 'websites');
      targetHistoryCollection = collection(db, 'topupHistory');
      
      // Use transaction to ensure data consistency
      await runTransaction(db, async (transaction) => {
        const websiteRef = doc(targetCollection, websiteId);
        const websiteDoc = await transaction.get(websiteRef);
        
        if (!websiteDoc.exists()) {
          throw new Error('Website not found');
        }
        
        const websiteData = websiteDoc.data();
        const newBalance = (websiteData.balance || 0) + amount;
        
        // Update website balance
        transaction.update(websiteRef, {
          balance: newBalance,
          lastUpdated: serverTimestamp()
        });
        
        // Add to topup history
        const historyRef = doc(targetHistoryCollection);
        transaction.set(historyRef, {
          websiteId: websiteId,
          websiteName: websiteData.name || 'Unknown',
          amount: amount,
          balanceBefore: websiteData.balance || 0,
          balanceAfter: newBalance,
          note: note || '',
          timestamp: serverTimestamp(),
          createdBy: user.uid,
          createdByName: userProfile.displayName || userProfile.username || 'Unknown',
          topupBy: userProfile.displayName || userProfile.username || 'ผู้ใช้ไม่ระบุ',
          topupByUid: user.uid,
          topupByEmail: userProfile.email || user.email,
          topupByUsername: userProfile.username || userProfile.displayName || user.email?.split('@')[0] || 'user',
          teamId: websiteData.teamId || null,
          teamName: websiteData.teamId ? teams.find(t => t.id === websiteData.teamId)?.name || 'ไม่ระบุทีม' : null,
          status: 'completed',
          type: 'topup'
        });
      });
      
      // อัพเดทข้อมูลในโลคัลก่อน เพื่อให้ UI ตอบสนองเร็วขึ้น
      setWebsites(prevWebsites => 
        prevWebsites.map(w => 
          w.id === websiteId 
            ? { ...w, balance: (w.balance || 0) + amount }
            : w
        )
      );
      
      // อัพเดทยอดเติมวันนี้ในโลคัล
      setTodayTopupAmount(prev => prev + amount);
      setTodayTopupByWebsite(prev => ({
        ...prev,
        [websiteId]: (prev[websiteId] || 0) + amount
      }));
      
      // Show success message
      toast.success(`เติมเงินสำเร็จ ${amount.toLocaleString()} บาท`, {
        duration: 4000,
        position: 'top-right',
      });
      
      // Reset form
      setTopupConfirm({
        show: false,
        websiteId: '',
        websiteName: '',
        amount: 0,
        note: ''
      });
      
      // Trigger animation
      triggerAnimation('totalBalance', websiteId);
      triggerAnimation('todayTopup');
      
      // Real-time listeners จะจัดการอัพเดทข้อมูลให้เอง ไม่ต้องโหลดใหม่
      // setTimeout(async () => {
      //   // Clear เฉพาะ cache ที่เกี่ยวข้องกับ topup
      //   dashboardDataManager.clearCache('topupHistory');
      //   dashboardDataManager.clearCache('websites');
      //   dashboardDataManager.clearUserCache(user.uid);
      //   
      //   // รีเฟรชข้อมูลใหม่
      //   await loadDashboardData(true);
      // }, 1000);
      
    } catch (error: any) {
      console.error('Error executing topup:', error);
      
      // Show error message
      if (error.code === 'permission-denied') {
        toast.error('ไม่มีสิทธิ์ในการเติมเงิน');
      } else if (error.code === 'not-found') {
        toast.error('ไม่พบข้อมูลเว็บไซต์');
      } else {
        toast.error('เกิดข้อผิดพลาดในการเติมเงิน กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setIsTopupProcessing(false);
    }
  };

  // Withdraw functions
  const showWithdrawModal = (id: string, name: string) => {
    setWithdrawModal({
      show: true,
      websiteId: id,
      websiteName: name
    });
    setWithdrawAmount('');
    setWithdrawNote('');
  };

  const hideWithdrawModal = () => {
    setWithdrawModal({
      show: false,
      websiteId: '',
      websiteName: ''
    });
    setWithdrawAmount('');
    setWithdrawNote('');
  };

  const confirmWithdraw = () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      toast.error('กรุณากรอกจำนวนเงินที่ถูกต้อง');
      return;
    }

    if (!withdrawNote.trim()) {
      toast.error('กรุณาระบุหมายเหตุ');
      return;
    }

    // Check if website has enough balance
    const website = websites.find(w => w.id === withdrawModal.websiteId);
    if (!website) {
      toast.error('ไม่พบเว็บไซต์');
      return;
    }

    if ((website.balance || 0) < amount) {
      toast.error('ยอดเงินในเว็บไซต์ไม่เพียงพอสำหรับการถอน');
      return;
    }

    setWithdrawConfirm({
      show: true,
      websiteId: withdrawModal.websiteId,
      websiteName: withdrawModal.websiteName,
      amount: amount,
      note: withdrawNote
    });
    hideWithdrawModal();
  };

  const hideWithdrawConfirm = () => {
    setWithdrawConfirm({
      show: false,
      websiteId: '',
      websiteName: '',
      amount: 0,
      note: ''
    });
  };

  const executeWithdraw = async () => {
    if (!user || !userProfile) return;
    
    try {
      setIsWithdrawProcessing(true);
      
      const { websiteId, amount, note } = withdrawConfirm;
      
      // Get current website data before transaction
      const currentWebsite = websites.find(w => w.id === websiteId);
      if (!currentWebsite) {
        throw new Error('Website not found locally');
      }

      // Pre-check balance to give immediate feedback
      if ((currentWebsite.balance || 0) < amount) {
        throw new Error('Insufficient balance');
      }

      let targetCollection;
      let targetHistoryCollection;
      
      // ใช้ main collections
      targetCollection = collection(db, 'websites');
      targetHistoryCollection = collection(db, 'withdrawHistory');
      
      // Use transaction to ensure data consistency
      await runTransaction(db, async (transaction) => {
        const websiteRef = doc(targetCollection, websiteId);
        const websiteDoc = await transaction.get(websiteRef);
        
        if (!websiteDoc.exists()) {
          throw new Error('Website not found');
        }
        
        const websiteData = websiteDoc.data();
        const currentBalance = websiteData.balance || 0;
        
        // Real-time balance check inside transaction
        if (currentBalance < amount) {
          throw new Error('Insufficient balance');
        }
        
        const newBalance = currentBalance - amount;
        
        // Update website balance
        transaction.update(websiteRef, {
          balance: newBalance,
          lastUpdated: serverTimestamp()
        });
        
        // Add to withdraw history
        const historyRef = doc(targetHistoryCollection);
        transaction.set(historyRef, {
          websiteId: websiteId,
          websiteName: websiteData.name || 'Unknown',
          amount: amount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          note: note || '',
          timestamp: serverTimestamp(),
          createdBy: user.uid,
          createdByName: userProfile.displayName || userProfile.username || 'Unknown',
          withdrawBy: userProfile.displayName || userProfile.username || 'ผู้ใช้ไม่ระบุ',
          withdrawByUid: user.uid,
          withdrawByEmail: userProfile.email || user.email,
          withdrawByUsername: userProfile.username || userProfile.displayName || user.email?.split('@')[0] || 'user',
          teamId: websiteData.teamId || null,
          teamName: websiteData.teamId ? teams.find(t => t.id === websiteData.teamId)?.name || 'ไม่ระบุทีม' : null,
          status: 'completed',
          type: 'withdraw'
        });
      });
      
      // อัพเดทข้อมูลในโลคัลก่อน เพื่อให้ UI ตอบสนองเร็วขึ้น
      setWebsites(prevWebsites => 
        prevWebsites.map(w => 
          w.id === websiteId 
            ? { ...w, balance: (w.balance || 0) - amount }
            : w
        )
      );
      
      // อัพเดทยอดถอนวันนี้ในโลคัล
      setTodayWithdrawAmount(prev => prev + amount);
      setTodayWithdrawByWebsite(prev => ({
        ...prev,
        [websiteId]: (prev[websiteId] || 0) + amount
      }));
      
      // Show success message
      toast.success(`ถอนเงินสำเร็จ ${amount.toLocaleString()} บาท`, {
        duration: 4000,
        position: 'top-right',
      });
      
      // Reset form
      setWithdrawConfirm({
        show: false,
        websiteId: '',
        websiteName: '',
        amount: 0,
        note: ''
      });
      
      // Trigger animation
      triggerAnimation('totalBalance', websiteId);
      triggerAnimation('todayWithdraw');
      
      // Real-time listeners จะจัดการอัพเดทข้อมูลให้เอง ไม่ต้องโหลดใหม่
      // setTimeout(async () => {
      //   // Clear เฉพาะ cache ที่เกี่ยวข้องกับ withdraw
      //   dashboardDataManager.clearCache('withdrawHistory');
      //   dashboardDataManager.clearCache('websites');
      //   dashboardDataManager.clearUserCache(user.uid);
      //   
      //   // รีเฟรชข้อมูลใหม่
      //   await loadDashboardData(true);
      // }, 1000);
      
    } catch (error: any) {
      console.error('Error executing withdraw:', error);
      
      // Enhanced error handling
      if (error.code === 'permission-denied') {
        toast.error('ไม่มีสิทธิ์ในการถอนเงิน');
      } else if (error.code === 'not-found') {
        toast.error('ไม่พบข้อมูลเว็บไซต์');
      } else if (error.code === 'aborted') {
        toast.error('รายการถูกยกเลิกเนื่องจากข้อมูลเปลี่ยนแปลง กรุณาลองใหม่');
      } else if (error.message === 'Insufficient balance') {
        toast.error('ยอดเงินไม่เพียงพอ');
      } else if (error.message === 'Website not found locally') {
        toast.error('ไม่พบข้อมูลเว็บไซต์ในระบบ');
      } else {
        toast.error('เกิดข้อผิดพลาดในการถอนเงิน กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setIsWithdrawProcessing(false);
    }
  };

  // ฟังก์ชันกรองเว็บไซต์ตามทีม (ปรับให้กรองเฉพาะทีมที่ user เป็นสมาชิก)
  const getFilteredWebsites = () => {
    const userTeamIds = teams.map(team => team.id);
    let filtered = websites.filter(website => userTeamIds.includes(website.teamId));
    if (selectedTeamFilter === 'all') {
      return filtered;
    }
    return filtered.filter(website => website.teamId === selectedTeamFilter);
  };

  // จัดกลุ่มเว็บไซต์ตามทีม
  const getWebsitesByTeam = () => {
    const websitesByTeam: { [teamId: string]: any[] } = {};
    const filteredWebsites = getFilteredWebsites();
    
    filteredWebsites.forEach(website => {
      const teamId = website.teamId || 'no-team';
      if (!websitesByTeam[teamId]) {
        websitesByTeam[teamId] = [];
      }
      websitesByTeam[teamId].push(website);
    });
    
    return websitesByTeam;
  };

  const statCards = [
    {
      title: 'ยอดเงินคงเหลือ',
      value: `฿${getFilteredWebsites().reduce((sum, site: any) => sum + (site.balance || 0), 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: CurrencyDollarIcon,
      color: 'from-green-500 to-emerald-600'
    },
    {
      title: 'ยอดเติมรวมวันนี้',
      value: `฿${getFilteredWebsites().reduce((sum, site: any) => sum + (todayTopupByWebsite[site.id] || 0), 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: ArrowTrendingUpIcon,
      color: 'from-blue-500 to-cyan-600'
    },
    {
      title: 'ยอดถอนรวมวันนี้',
      value: `฿${getFilteredWebsites().reduce((sum, site: any) => sum + (todayWithdrawByWebsite[site.id] || 0), 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: ArrowTrendingDownIcon,
      color: 'from-red-500 to-pink-600'
    },
    {
      title: 'เว็บทั้งหมด',
      value: `${getFilteredWebsites().length} เว็บ`,
      icon: GlobeAltIcon,
      color: 'from-purple-500 to-indigo-600'
    },
    {
      title: 'เปิดใช้งานทั้งหมด',
      value: `${getFilteredWebsites().filter((site: any) => site.status === 'active').length} เว็บ`,
      icon: ShoppingBagIcon,
      color: 'from-indigo-500 to-purple-600'
    }
  ];

  // ผู้ใช้สามารถเข้า dashboard ได้ทุกคน ไม่ว่าจะมีทีมหรือไม่
  // เอาการตรวจสอบและ redirect ไป /no-team ออก
  // ให้ผู้ใช้สามารถใช้งานระบบได้ปกติ
  
  // ตรวจสอบว่าเป็นผู้ใช้ใหม่หรือไม่ เพื่อแสดง loading ระหว่างรอข้อมูล
  const isNewUser = user?.metadata?.creationTime && 
    (Date.now() - new Date(user.metadata.creationTime).getTime()) < 10000; // 10 วินาที

  if (isNewUser && loading) {
    // แสดง loading สำหรับผู้ใช้ใหม่ที่ข้อมูลยังโหลดไม่เสร็จ
    return (
      <DashboardLayout title="กำลังเตรียมข้อมูล" subtitle="กรุณารอสักครู่...">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400 mb-2">กำลังโหลดข้อมูลบัญชี</p>
            <p className="text-sm text-gray-500 dark:text-gray-500">กรุณารอสักครู่...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Debounced function สำหรับ real-time updates
  const debouncedStatsUpdate = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      setStats(prevStats => {
        const newTotalBalance = websites.reduce((sum, site) => sum + (site.balance || 0), 0);
        const totalDailyTopup = websites.reduce((sum, site) => sum + (site.dailyTopup || 0), 0);
        
        return {
          totalBalance: newTotalBalance,
          monthlyIncome: totalDailyTopup * 30,
          monthlyExpense: newTotalBalance * 0.1,
          savings: newTotalBalance * 0.8
        };
      });
    }, 500); // รอ 500ms ก่อนอัพเดท stats
  }, [websites]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <DashboardLayout 
      title="แดชบอร์ด" 
      subtitle="ภาพรวมการเงินของคุณ"
    >
      <style jsx>{`
        .amount-update {
          animation: professionalUpdate 2s ease-out;
        }
        
        @keyframes professionalUpdate {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
          }
          25% {
            transform: scale(1.05);
            box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.2);
          }
          50% {
            transform: scale(1.08);
            box-shadow: 0 0 0 12px rgba(59, 130, 246, 0.1);
          }
          75% {
            transform: scale(1.03);
            box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.05);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
          }
        }
        
        .amount-update-green {
          animation: professionalUpdateGreen 2s ease-out;
        }
        
        @keyframes professionalUpdateGreen {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
          }
          25% {
            transform: scale(1.05);
            box-shadow: 0 0 0 8px rgba(34, 197, 94, 0.2);
          }
          50% {
            transform: scale(1.08);
            box-shadow: 0 0 0 12px rgba(34, 197, 94, 0.1);
          }
          75% {
            transform: scale(1.03);
            box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.05);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
          }
        }
        
        .amount-update-orange {
          animation: professionalUpdateOrange 2s ease-out;
        }
        
        @keyframes professionalUpdateOrange {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.4);
          }
          25% {
            transform: scale(1.05);
            box-shadow: 0 0 0 8px rgba(249, 115, 22, 0.2);
          }
          50% {
            transform: scale(1.08);
            box-shadow: 0 0 0 12px rgba(249, 115, 22, 0.1);
          }
          75% {
            transform: scale(1.03);
            box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.05);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(249, 115, 22, 0);
          }
        }
        
        /* Clean and professional amount container */
        .amount-container {
          position: relative;
          display: inline-block;
          transition: all 0.3s ease;
          border-radius: 6px;
          padding: 2px 4px;
        }
        
        .amount-container:hover {
          transform: translateY(-1px);
        }
        
        /* Professional stat card styling */
        .stat-card {
          position: relative;
          overflow: hidden;
          transition: all 0.3s ease;
        }
        
        .stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
        }
        
        .stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.1),
            transparent
          );
          transition: left 0.6s ease;
        }
        
        .stat-card:hover::before {
          left: 100%;
        }
      `}</style>
      <div className="space-y-6 lg:space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {statCards.map((stat, index) => {
            // Determine animation class based on card type
            let animationClass = '';
            if (index === 0 && animationState.totalBalance) animationClass = 'amount-update-green'; // ยอดเงินคงเหลือ - สีเขียว
            if (index === 1 && animationState.todayTopup) animationClass = 'amount-update'; // ยอดเติมวันนี้ - สีน้ำเงิน
            if (index === 2 && animationState.todayWithdraw) animationClass = 'amount-update-orange'; // ยอดถอนวันนี้ - สีส้ม
            
            return (
              <div key={index} className={`stat-card bg-gradient-to-r ${stat.color} rounded-2xl p-6 text-white`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/80 text-sm font-medium">
                      {stat.title}
                    </p>
                    <div className="amount-container">
                      <p className={`text-2xl font-bold ${animationClass}`}>
                        {stat.value}
                      </p>
                    </div>
                  </div>
                  <stat.icon className="h-8 w-8 text-white/60" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Website Management Section */}
        <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/30 dark:border-gray-700/30 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                <GlobeAltIcon className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">จัดการเว็บไซต์</h3>
                <div className="flex items-center space-x-2">
                  <p className="text-sm text-gray-600 dark:text-gray-400">เปิด/ปิด และติดตามสถานะเว็บไซต์</p>
                  {/* Real-time status indicator */}
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs text-green-600 dark:text-green-400">
                      {isRealTimeActive ? 'กำลังอัพเดท' : 'อัพเดทแบบ Real-time'}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  อัพเดทล่าสุด: {lastUpdated.toLocaleTimeString('th-TH')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleRefreshDashboard}
                disabled={refreshing}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-50"
              >
                <ArrowPathIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                รีเฟรช
              </button>
              {/* Team Filter - แสดงเมื่อ user มีทีม (แม้แค่ 1 ทีม) */}
              {teams.length > 0 && (
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    กรองตามทีม:
                  </label>
                  <select
                    value={selectedTeamFilter}
                    onChange={(e) => setSelectedTeamFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[150px]"
                  >
                    <option value="all">ทุกทีม ({websites.length})</option>
                    {teams.map(team => {
                      const teamWebsiteCount = websites.filter(w => w.teamId === team.id).length;
                      return (
                        <option key={team.id} value={team.id}>
                          {team.name} ({teamWebsiteCount})
                        </option>
                      );
                    })}
                    {websites.some(w => !w.teamId) && (
                      <option value="no-team">
                        ไม่มีทีม ({websites.filter(w => !w.teamId).length})
                      </option>
                    )}
                  </select>
                </div>
              )}


              
              {canCreateWebsites() && (
                teams.length > 0 ? (
                  <button
                    onClick={() => setShowAddWebsite(true)}
                    className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-2 rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                  >
                    <PlusIcon className="h-4 w-4" />
                    <span>เพิ่มเว็บไซต์</span>
                  </button>
                ) : (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        toast.error(`สร้างทีมหรือเข้าร่วมทีมก่อนเพื่อเพิ่มเว็บไซต์ (ทีม: ${teams.length})`);
                      }}
                      className="flex items-center space-x-2 bg-gray-400 dark:bg-gray-600 text-white px-4 py-2 rounded-xl cursor-not-allowed opacity-60 hover:opacity-70 transition-opacity"
                      title="สร้างทีมหรือเข้าร่วมทีมก่อนเพื่อเพิ่มเว็บไซต์"
                    >
                      <PlusIcon className="h-4 w-4" />
                      <span>เพิ่มเว็บไซต์</span>
                    </button>
                    <div className="text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-lg">
                      สร้างทีมเพื่อเริ่มต้น (จำนวนทีม: {teams.length})
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Website Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">ชื่อเว็บไซต์</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">URL</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">API Key</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-900 dark:text-white">คงเหลือ</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-900 dark:text-white">ยอดเติมวันนี้</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-900 dark:text-white">สถานะ</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-900 dark:text-white">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center">
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                        <span className="ml-2 text-gray-500 dark:text-gray-400">กำลังโหลดข้อมูล...</span>
                      </div>
                    </td>
                  </tr>
                ) : websites.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center">
                      <div className="text-gray-500 dark:text-gray-400">
                        <GlobeAltIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>ยังไม่มีเว็บไซต์</p>
                        {teams.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-sm">คลิก &quot;เพิ่มเว็บไซต์&quot; เพื่อเริ่มต้น</p>
                            <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-lg inline-block">
                              💡 หากเพิ่งเข้าร่วมทีม กรุณากดปุ่ม &quot;รีเฟรช&quot; เพื่อดูข้อมูลใหม่
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm text-blue-600 dark:text-blue-400">
                            สร้างทีมหรือเข้าร่วมทีมเพื่อเริ่มจัดการเว็บไซต์
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  Object.entries(getWebsitesByTeam()).map(([teamId, teamWebsites]) => (
                    <React.Fragment key={teamId}>
                      {/* Team Header */}
                      <tr className="bg-gray-50 dark:bg-gray-700/30">
                        <td colSpan={7} className="py-3 px-4">
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full"></div>
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {teamId === 'no-team' 
                                ? 'เว็บไซต์ไม่มีทีม' 
                                : teams.find(t => t.id === teamId)?.name || teamId
                              }
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              ({teamWebsites.length} เว็บไซต์)
                            </span>
                          </div>
                        </td>
                      </tr>
                      {/* Team Websites */}
                      {teamWebsites.map((website: any) => (
                        <tr key={website.id} data-website-id={website.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200">
                          <td className="py-4 px-4">
                            <div className="font-semibold text-gray-900 dark:text-white">{website.name}</div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">{website.url}</div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center space-x-2">
                              <div className="flex-1 min-w-0">
                                {canViewApiKeys() ? (
                                  <div className={`text-xs text-gray-500 dark:text-gray-400 font-mono ${visibleKeys[website.id] ? 'break-all' : 'overflow-hidden'}`}>
                                    {visibleKeys[website.id] ? website.apiKey : '••••••••••••'}
                                  </div>
                                ) : (
                                  <div className="flex items-center space-x-2">
                                    <div className="w-3 h-3 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                                      <div className="w-1.5 h-1.5 bg-red-500 dark:bg-red-400 rounded-full"></div>
                                    </div>
                                    <span className="text-xs text-red-600 dark:text-red-400 font-medium">ซ่อนจาก User</span>
                                  </div>
                                )}
                              </div>
                              {canViewApiKeys() && (
                                <button
                                  onClick={() => toggleKeyVisibility(website.id)}
                                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
                                  title={visibleKeys[website.id] ? 'ซ่อน API Key' : 'แสดง API Key'}
                                >
                                  {visibleKeys[website.id] ? (
                                    <EyeSlashIcon className="h-4 w-4" />
                                  ) : (
                                    <EyeIcon className="h-4 w-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <div className="amount-container">
                              <div className={`font-bold text-green-600 dark:text-green-400 ${animationState.websiteBalances[website.id] ? 'amount-update-green' : ''}`}>฿{(website.balance || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <div className="amount-container">
                              <div className={`font-bold text-blue-600 dark:text-blue-400 ${animationState.websiteBalances[website.id] ? 'amount-update' : ''}`}>฿{(todayTopupByWebsite[website.id] || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <div className="flex items-center justify-center">
                              {canEditWebsites() && (!website.teamId || hasTeamPermission(website.teamId, 'websites', 'update')) ? (
                                <button
                                  onClick={() => toggleWebsiteStatus(website.id)}
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ${
                                    website.status === 'active' 
                                      ? 'bg-green-500 hover:bg-green-600' 
                                      : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
                                      website.status === 'active' ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                  />
                                </button>
                              ) : (
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  website.status === 'active' 
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                                    : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                                }`}>
                                  {website.status === 'active' ? 'เปิด' : 'ปิด'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center justify-center space-x-2">
                              {/* ปุ่มเติมเงิน - แสดงให้ทุกคนที่เห็นเว็บไซต์ */}
                              <button 
                                onClick={() => showTopupModal(website.id, website.name)}
                                disabled={isTopupProcessing || isWithdrawProcessing}
                                className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                                  isTopupProcessing || isWithdrawProcessing
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                                }`}
                              >
                                <CurrencyDollarIcon className="h-3 w-3" />
                                <span>{isTopupProcessing ? 'กำลังเติม...' : 'เติมเงิน'}</span>
                              </button>
                              {/* ปุ่มถอนเงิน - แสดงเฉพาะแอดมิน */}
                              {canAccessAdminPanel() && (
                                <button 
                                  onClick={() => showWithdrawModal(website.id, website.name)}
                                  disabled={isTopupProcessing || isWithdrawProcessing}
                                  className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                                    isTopupProcessing || isWithdrawProcessing
                                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                      : 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400'
                                  }`}
                                >
                                  <ArrowTrendingDownIcon className="h-3 w-3" />
                                  <span>{isWithdrawProcessing ? 'กำลังถอน...' : 'ถอนเงิน'}</span>
                                </button>
                              )}
                              {canDeleteWebsites() && (!website.teamId || hasTeamPermission(website.teamId, 'websites', 'delete')) && (
                                <button 
                                  onClick={() => showDeleteConfirm(website.id, website.name)}
                                  className="flex items-center space-x-1 px-2 py-1 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-xs font-medium transition-colors"
                                >
                                  <TrashIcon className="h-3 w-3" />
                                  <span>ลบ</span>
                                </button>
                              )}
                              {/* แสดงข้อความเมื่อไม่มีสิทธิ์ */}
                              {(!canDeleteWebsites() || (website.teamId && !hasTeamPermission(website.teamId, 'websites', 'delete'))) && (
                                <span className="text-xs text-gray-400 dark:text-gray-500">ไม่มีสิทธิ์ลบ</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Website Modal */}
        <PortalModal isOpen={showAddWebsite}>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xl flex items-center justify-center z-[100] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl border border-white/20 dark:border-gray-700/50">
              {/* Header */}
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">เพิ่มเว็บไซต์ใหม่</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">สร้างเว็บไซต์ใหม่ในระบบ</p>
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-5">
                {/* Team Selection */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    <span className="flex items-center space-x-2">
                      <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span>เลือกทีม</span>
                      <span className="text-red-500">*</span>
                    </span>
                  </label>
                  <div className="relative">
                    <select
                      value={newWebsite.teamId}
                      onChange={(e) => setNewWebsite({...newWebsite, teamId: e.target.value})}
                      className="w-full px-4 py-3 pl-10 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm transition-all duration-200 hover:border-blue-300 dark:hover:border-blue-600"
                      required
                    >
                      <option value="">เลือกทีมที่ต้องการ</option>
                      {teams.map(team => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                {/* Website Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    <span className="flex items-center space-x-2">
                      <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      <span>ชื่อเว็บไซต์</span>
                      <span className="text-red-500">*</span>
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={newWebsite.name}
                      onChange={(e) => setNewWebsite({...newWebsite, name: e.target.value})}
                      className="w-full px-4 py-3 pl-10 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm transition-all duration-200 hover:border-green-300 dark:hover:border-green-600"
                      placeholder="เช่น เว็บหลัก, เว็บสำรอง"
                      required
                    />
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                {/* Website URL */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    <span className="flex items-center space-x-2">
                      <svg className="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <span>URL เว็บไซต์</span>
                      <span className="text-red-500">*</span>
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="url"
                      value={newWebsite.url}
                      onChange={(e) => setNewWebsite({...newWebsite, url: e.target.value})}
                      className="w-full px-4 py-3 pl-10 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm transition-all duration-200 hover:border-purple-300 dark:hover:border-purple-600"
                      placeholder="https://example.com"
                      required
                    />
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                {/* API Key */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    <span className="flex items-center space-x-2">
                      <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                      <span>API Key</span>
                      <span className="text-red-500">*</span>
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={newWebsite.apiKey}
                      onChange={(e) => setNewWebsite({...newWebsite, apiKey: e.target.value})}
                      className="w-full px-4 py-3 pl-10 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm shadow-sm transition-all duration-200 hover:border-amber-300 dark:hover:border-amber-600"
                      placeholder="กรอก API Key ที่ได้รับจากเว็บไซต์"
                      required
                    />
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-1">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>API Key จะถูกเข้ารหัสและเก็บอย่างปลอดภัย</span>
                  </p>
                </div>
              </div>

              {/* Info Card */}
              <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl border border-blue-200/50 dark:border-blue-800/50">
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="text-sm">
                    <p className="font-semibold text-blue-900 dark:text-blue-100 mb-1">ข้อมูลสำคัญ</p>
                    <ul className="text-blue-700 dark:text-blue-300 space-y-1 text-xs">
                      <li>• เว็บไซต์ที่สร้างจะถูกเพิ่มเข้าทีมที่เลือก</li>
                      <li>• API Key จะใช้สำหรับการเชื่อมต่อระบบ</li>
                      <li>• สามารถแก้ไขข้อมูลได้ภายหลัง</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-3 mt-8">
                <button
                  onClick={() => setShowAddWebsite(false)}
                  className="px-6 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors font-medium rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={addWebsite}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl font-semibold flex items-center space-x-2"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span>เพิ่มเว็บไซต์</span>
                </button>
              </div>
            </div>
          </div>
        </PortalModal>

        {/* Delete Confirmation Modal */}
        <PortalModal isOpen={deleteConfirm.show}>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xl flex items-center justify-center z-[100] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <h3 className="text-xl font-bold text-red-600 dark:text-red-400 mb-4">ยืนยันการลบ</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                คุณแน่ใจหรือไม่ที่จะลบเว็บไซต์ <span className="font-semibold text-gray-900 dark:text-white">&quot;{deleteConfirm.websiteName}&quot;</span>?
                <br />
                <span className="text-red-500 text-sm">การกระทำนี้ไม่สามารถย้อนกลับได้</span>
              </p>
              
              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={hideDeleteConfirm}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  ลบเว็บไซต์
                </button>
              </div>
            </div>
          </div>
        </PortalModal>

        {/* Topup Modal */}
        <PortalModal isOpen={topupModal.show}>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xl flex items-center justify-center z-[100] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl border border-white/20 dark:border-gray-700/50">
              {/* Header */}
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                  <CurrencyDollarIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">เติมเงิน</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">เพิ่มยอดเงินในระบบ</p>
                </div>
              </div>

              {/* Website Info */}
              <div className="bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20 rounded-xl p-4 mb-6 border border-blue-200/50 dark:border-blue-800/50">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-white dark:bg-gray-800 rounded-lg flex items-center justify-center shadow-sm">
                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {topupModal.websiteName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{topupModal.websiteName}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">เว็บไซต์ที่จะเติมเงิน</p>
                  </div>
                </div>
              </div>
              
              {/* Amount Input */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  <span className="flex items-center space-x-2">
                    <CurrencyDollarIcon className="h-4 w-4 text-green-500" />
                    <span>จำนวนเงิน (บาท)</span>
                  </span>
                </label>
                
                {/* Quick Amount Buttons */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[1000, 5000, 10000, 20000, 30000, 40000].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setTopupAmount(amount.toString())}
                      className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium border border-gray-200 dark:border-gray-600 hover:border-green-300 dark:hover:border-green-600"
                    >
                      ฿{amount.toLocaleString()}
                    </button>
                  ))}
                </div>

                {/* Clear Button */}
                <div className="flex justify-end mb-3">
                  <button
                    onClick={() => setTopupAmount('')}
                    className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    ล้าง
                  </button>
                </div>

                {/* Custom Amount Input */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 dark:text-gray-400 text-lg font-semibold">฿</span>
                  </div>
                  <input
                    type="number"
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg font-semibold placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-200"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
                
                {/* Amount Display */}
                {topupAmount && !isNaN(parseFloat(topupAmount)) && parseFloat(topupAmount) > 0 && (
                  <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <p className="text-sm text-green-700 dark:text-green-400">
                      <span className="font-medium">จำนวนที่จะเติม:</span> 
                      <span className="font-bold ml-2">
                        ฿{parseFloat(topupAmount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              {/* Note Input */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  <span className="flex items-center space-x-2">
                    <svg className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span>หมายเหตุ (ไม่บังคับ)</span>
                  </span>
                </label>
                <textarea
                  value={topupNote}
                  onChange={(e) => setTopupNote(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-200 resize-none"
                  placeholder="เช่น เติมเงินสำหรับโปรโมชั่น, เติมเงินประจำเดือน, ฯลฯ"
                  rows={3}
                  maxLength={200}
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    ระบุเหตุผลหรือรายละเอียดการเติมเงิน (ไม่เกิน 200 ตัวอักษร)
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {topupNote.length}/200
                  </p>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={hideTopupModal}
                  className="px-6 py-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={confirmTopup}
                  disabled={!topupAmount || isNaN(parseFloat(topupAmount)) || parseFloat(topupAmount) <= 0}
                  className="px-6 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg"
                >
                  เติมเงิน
                </button>
              </div>
            </div>
          </div>
        </PortalModal>

        {/* Topup Confirmation Modal */}
        <PortalModal isOpen={topupConfirm.show}>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xl flex items-center justify-center z-[100] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-white/20 dark:border-gray-700/50">
              {/* Header */}
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                  <CurrencyDollarIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-green-600 dark:text-green-400">ยืนยันการเติมเงิน</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">กรุณาตรวจสอบข้อมูลก่อนยืนยัน</p>
                </div>
              </div>

              {/* Transaction Details */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4 mb-6 border border-green-200/50 dark:border-green-800/50">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">เว็บไซต์:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{topupConfirm.websiteName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">จำนวนเงิน:</span>
                    <span className="font-bold text-2xl text-green-600 dark:text-green-400">
                      ฿{topupConfirm.amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {topupConfirm.note && (
                    <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">หมายเหตุ:</span>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 bg-white/50 dark:bg-gray-800/50 p-2 rounded-lg">
                        {topupConfirm.note}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Warning */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-6">
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  <span className="font-medium">⚠️ หมายเหตุ:</span> การเติมเงินนี้จะไม่สามารถยกเลิกได้หลังจากยืนยันแล้ว
                </p>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={hideTopupConfirm}
                  className="px-6 py-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={executeTopup}
                  disabled={isTopupProcessing}
                  className="px-6 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isTopupProcessing && (
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  <span>{isTopupProcessing ? 'กำลังประมวลผล...' : 'ยืนยันเติมเงิน'}</span>
                </button>
              </div>
            </div>
          </div>
        </PortalModal>

        {/* Withdraw Modal */}
        <PortalModal isOpen={withdrawModal.show}>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xl flex items-center justify-center z-[100] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl border border-white/20 dark:border-gray-700/50">
              {/* Header */}
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
                  <ArrowTrendingDownIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">ถอนเงิน</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">ลดยอดเงินในระบบ</p>
                </div>
              </div>

              {/* Website Info */}
              <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-xl p-4 mb-6 border border-orange-200/50 dark:border-orange-800/50">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-white dark:bg-gray-800 rounded-lg flex items-center justify-center shadow-sm">
                    <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                      {withdrawModal.websiteName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{withdrawModal.websiteName}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">เว็บไซต์ที่จะถอนเงิน</p>
                    {/* Show current balance */}
                    {(() => {
                      const website = websites.find(w => w.id === withdrawModal.websiteId);
                      return website && (
                        <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">
                          ยอดคงเหลือ: ฿{(website.balance || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      );
                    })()}
                  </div>
                </div>
              </div>
              
              {/* Amount Input */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  <span className="flex items-center space-x-2">
                    <ArrowTrendingDownIcon className="h-4 w-4 text-orange-500" />
                    <span>จำนวนเงิน (บาท)</span>
                  </span>
                </label>
                
                {/* Quick Amount Buttons */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[1000, 5000, 10000, 20000, 30000].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setWithdrawAmount(amount.toString())}
                      className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium border border-gray-200 dark:border-gray-600 hover:border-orange-300 dark:hover:border-orange-600"
                    >
                      ฿{amount.toLocaleString()}
                    </button>
                  ))}
                  {/* Withdraw All Button */}
                  <button
                    onClick={() => {
                      const website = websites.find(w => w.id === withdrawModal.websiteId);
                      if (website && website.balance > 0) {
                        setWithdrawAmount(website.balance.toString());
                      }
                    }}
                    className="px-3 py-2 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-800/50 transition-colors text-sm font-medium border border-orange-200 dark:border-orange-600 hover:border-orange-300 dark:hover:border-orange-500"
                  >
                    ถอนทั้งหมด
                  </button>
                </div>

                {/* Clear Button */}
                <div className="flex justify-end mb-3">
                  <button
                    onClick={() => setWithdrawAmount('')}
                    className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    ล้าง
                  </button>
                </div>

                {/* Custom Amount Input */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 dark:text-gray-400 text-lg font-semibold">฿</span>
                  </div>
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg font-semibold placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-200"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
                
                {/* Amount Display */}
                {withdrawAmount && !isNaN(parseFloat(withdrawAmount)) && parseFloat(withdrawAmount) > 0 && (
                  <div className="mt-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                    <p className="text-sm text-orange-700 dark:text-orange-400">
                      <span className="font-medium">จำนวนที่จะถอน:</span> 
                      <span className="font-bold ml-2">
                        ฿{parseFloat(withdrawAmount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              {/* Note Input */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  <span className="flex items-center space-x-2">
                    <svg className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span>หมายเหตุ</span>
                    <span className="text-red-500">*</span>
                  </span>
                </label>
                <textarea
                  value={withdrawNote}
                  onChange={(e) => setWithdrawNote(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-200 resize-none"
                  placeholder="กรุณาระบุเหตุผลในการถอนเงิน เช่น ถอนเงินสำหรับค่าใช้จ่าย, ถอนเงินเพื่อโอนไปบัญชีอื่น, ฯลฯ"
                  rows={3}
                  maxLength={200}
                  required
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    ระบุเหตุผลหรือรายละเอียดการถอนเงิน <span className="text-red-500">*บังคับ</span> (ไม่เกิน 200 ตัวอักษร)
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {withdrawNote.length}/200
                  </p>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={hideWithdrawModal}
                  className="px-6 py-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={confirmWithdraw}
                  disabled={!withdrawAmount || isNaN(parseFloat(withdrawAmount)) || parseFloat(withdrawAmount) <= 0 || !withdrawNote.trim()}
                  className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl hover:from-orange-600 hover:to-red-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg"
                >
                  ถอนเงิน
                </button>
              </div>
            </div>
          </div>
        </PortalModal>

        {/* Withdraw Confirmation Modal */}
        <PortalModal isOpen={withdrawConfirm.show}>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xl flex items-center justify-center z-[100] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-white/20 dark:border-gray-700/50">
              {/* Header */}
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
                  <ArrowTrendingDownIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-orange-600 dark:text-orange-400">ยืนยันการถอนเงิน</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">กรุณาตรวจสอบข้อมูลก่อนยืนยัน</p>
                </div>
              </div>

              {/* Transaction Details */}
              <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-xl p-4 mb-6 border border-orange-200/50 dark:border-orange-800/50">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">เว็บไซต์:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{withdrawConfirm.websiteName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">จำนวนเงิน:</span>
                    <span className="font-bold text-2xl text-orange-600 dark:text-orange-400">
                      ฿{withdrawConfirm.amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {withdrawConfirm.note && (
                    <div className="mt-3 pt-3 border-t border-orange-200 dark:border-orange-800">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">หมายเหตุ:</span>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 bg-white/50 dark:bg-gray-800/50 p-2 rounded-lg">
                        {withdrawConfirm.note}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Warning */}
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-6">
                <p className="text-sm text-red-700 dark:text-red-400">
                  <span className="font-medium">⚠️ หมายเหตุ:</span> การถอนเงินนี้จะไม่สามารถยกเลิกได้หลังจากยืนยันแล้ว
                </p>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={hideWithdrawConfirm}
                  className="px-6 py-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={executeWithdraw}
                  disabled={isWithdrawProcessing}
                  className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl hover:from-orange-600 hover:to-red-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isWithdrawProcessing && (
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  <span>{isWithdrawProcessing ? 'กำลังประมวลผล...' : 'ยืนยันถอนเงิน'}</span>
                </button>
              </div>
            </div>
          </div>
        </PortalModal>
      </div>
    </DashboardLayout>
  );
} 