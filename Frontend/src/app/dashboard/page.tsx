'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import toast from 'react-hot-toast';
import { cacheManager, CACHE_KEYS } from '../../utils/cacheManager';
import { 
  logWebsiteCreated, 
  logWebsiteDeleted, 
  logWebsiteStatusChanged, 
  logWebsiteTopup 
} from '../../utils/logger';

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
    canCreateWebsites, 
    canEditWebsites, 
    canDeleteWebsites, 
    canCreateTopup,
    canViewApiKeys,
    isUser,
    isMemberOfTeam,
    hasTeamPermission
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

  // Optimized website loading with caching
  const loadWebsitesOptimized = useCallback(async (forceRefresh = false) => {
    if (!user) return;
    
    // Check cache first
    if (!forceRefresh && websitesCache && Date.now() - websitesCache.timestamp < WEBSITES_CACHE_DURATION) {
      setWebsites(websitesCache.websites);
      setStats(websitesCache.stats);
      setLoading(false);
      return;
    }
    
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      
      let websiteData: any[] = [];
      
      // โหลดข้อมูลจากทั้งสองที่: main websites collection และ user subcollection
      let mainWebsites: any[] = [];
      let userSubcollectionWebsites: any[] = [];
      
      try {
        // 1. โหลดจาก main websites collection
        const websitesRef = collection(db, 'websites');
        const querySnapshot = await getDocs(websitesRef);
        
        const allWebsites = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // กรองเว็บไซต์ที่เป็นของ user
        mainWebsites = allWebsites.filter((website: any) => {
          // ตรวจสอบว่าเว็บไซต์เป็นของผู้ใช้โดยตรง
          if (website.userId === user.uid) return true;
          
          // ถ้ามีทีม ตรวจสอบว่าผู้ใช้เป็นสมาชิกของทีมนั้นหรือไม่
          if (teams.length > 0 && website.teamId) {
            const userTeamIds = teams.map(team => team.id);
            if (userTeamIds.includes(website.teamId)) {
              return isMemberOfTeam(website.teamId);
            }
          }
          
          return false;
        });
        
      } catch (error) {
        // Error loading from main collection - continue with other sources
      }
      
      try {
        // 2. โหลดจาก user subcollection (backward compatibility)
        const userWebsitesRef = collection(db, 'users', user.uid, 'websites');
        const userQuerySnapshot = await getDocs(userWebsitesRef);
        
        userSubcollectionWebsites = userQuerySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          isUserSubcollection: true // ทำเครื่องหมายว่ามาจาก user subcollection
        }));
        
      } catch (error) {
        // Error loading from user subcollection - continue with other sources
      }
      
      // รวมข้อมูลจากทั้งสองที่ (หลีกเลี่ยงการซ้ำ)
      const combinedWebsites = [...mainWebsites];
      userSubcollectionWebsites.forEach(userWebsite => {
        // ตรวจสอบว่าเว็บไซต์นี้ยังไม่มีใน main collection
        const existsInMain = mainWebsites.some(mainWebsite => 
          mainWebsite.name === userWebsite.name && mainWebsite.url === userWebsite.url
        );
        if (!existsInMain) {
          combinedWebsites.push(userWebsite);
        }
      });
      
      websiteData = combinedWebsites;
      
      setWebsites(websiteData);
      
      // Calculate stats using websiteData
      const totalBalance = websiteData.reduce((sum, site: any) => sum + (site.balance || 0), 0);
      const totalDailyTopup = websiteData.reduce((sum, site: any) => sum + (site.dailyTopup || 0), 0);
      
      const calculatedStats = {
        totalBalance,
        monthlyIncome: totalDailyTopup * 30,
        monthlyExpense: totalBalance * 0.1,
        savings: totalBalance * 0.8
      };
      
      setStats(calculatedStats);
      setLastUpdated(new Date());
      
      // Update cache
      websitesCache = {
        websites: websiteData,
        stats: calculatedStats,
        timestamp: Date.now()
      };
      
    } catch (error: any) {
      // Error loading websites - show user-friendly message
      if (error.code === 'permission-denied') {
        toast.error('ไม่มีสิทธิ์เข้าถึงข้อมูลเว็บไซต์');
      } else if (error.code === 'unavailable') {
        toast.error('บริการไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง');
      } else {
        toast.error('ไม่สามารถโหลดข้อมูลเว็บไซต์ได้ กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid, teams.length, isMemberOfTeam]);

  // Load today's topup amount from topupHistory
  const loadTodayTopupAmount = useCallback(async () => {
    if (!user || !userProfile) return;

    try {
      const topupHistoryRef = collection(db, 'topupHistory');
      const topupSnapshot = await getDocs(topupHistoryRef);
      
      const userTeamIds = teams.map(team => team.id);
      const today = new Date();
      
      let todayAmount = 0;
      const websiteTopupMap: Record<string, number> = {};
      
      topupSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const recordDate = new Date(data.timestamp);
        
        // Check if record is from today
        if (recordDate.toDateString() === today.toDateString()) {
          // Check if user has permission to see this record
          if (userProfile.role === 'admin' || 
              (data.teamId && userTeamIds.includes(data.teamId))) {
            const amount = data.amount || 0;
            const websiteId = data.websiteId;
            
            todayAmount += amount;
            
            // Track per website
            if (websiteId) {
              websiteTopupMap[websiteId] = (websiteTopupMap[websiteId] || 0) + amount;
            }
          }
        }
      });
      
      setTodayTopupAmount(todayAmount);
      setTodayTopupByWebsite(websiteTopupMap);
    } catch (error) {
      // Error loading today topup amount - fail silently
    }
  }, [user, userProfile, teams]);

  // Load today's withdraw amount from withdrawHistory
  const loadTodayWithdrawAmount = useCallback(async () => {
    if (!user || !userProfile) return;

    try {
      const withdrawHistoryRef = collection(db, 'withdrawHistory');
      const withdrawSnapshot = await getDocs(withdrawHistoryRef);
      
      const userTeamIds = teams.map(team => team.id);
      const today = new Date();
      
      let todayAmount = 0;
      const websiteWithdrawMap: Record<string, number> = {};
      
      withdrawSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const recordDate = new Date(data.timestamp);
        
        // Check if record is from today
        if (recordDate.toDateString() === today.toDateString()) {
          // Check if user has permission to see this record
          if (userProfile.role === 'admin' || 
              (data.teamId && userTeamIds.includes(data.teamId))) {
            const amount = data.amount || 0;
            const websiteId = data.websiteId;
            
            todayAmount += amount;
            
            // Track per website
            if (websiteId) {
              websiteWithdrawMap[websiteId] = (websiteWithdrawMap[websiteId] || 0) + amount;
            }
          }
        }
      });
      
      setTodayWithdrawAmount(todayAmount);
      setTodayWithdrawByWebsite(websiteWithdrawMap);
    } catch (error) {
      // Error loading today withdraw amount - fail silently
    }
  }, [user, userProfile, teams]);

  // Force refresh function
  const handleRefreshWebsites = useCallback(() => {
    websitesCache = null; // Clear cache
    loadWebsitesOptimized(true);
    loadTodayTopupAmount(); // Also refresh today's topup amount
    loadTodayWithdrawAmount(); // Also refresh today's withdraw amount
  }, [loadWebsitesOptimized, loadTodayTopupAmount, loadTodayWithdrawAmount]);

  useEffect(() => {
    if (user && teams.length >= 0) { // รอให้ teams โหลดเสร็จ (อาจจะ 0 หรือมากกว่า)
      loadWebsitesOptimized();
      loadTodayTopupAmount();
      loadTodayWithdrawAmount();
    }
  }, [user?.uid, teams.length, loadWebsitesOptimized, loadTodayTopupAmount, loadTodayWithdrawAmount]); // ใช้ user.uid และ teams.length แทน

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
            // Reload data to get the updated/new records
            loadWebsitesOptimized(true);
            setLastUpdated(new Date());
            
            // Show notification for different types of changes
            const addedCount = relevantChanges.filter(c => c.type === 'added').length;
            const modifiedCount = relevantChanges.filter(c => c.type === 'modified').length;
            const removedCount = relevantChanges.filter(c => c.type === 'removed').length;
            
            if (addedCount > 0) {
              toast.success(`มีเว็บไซต์ใหม่ ${addedCount} เว็บไซต์`, {
                duration: 3000,
                position: 'top-right',
              });
            }
            if (modifiedCount > 0) {
              toast.success(`มีการอัพเดทข้อมูล ${modifiedCount} เว็บไซต์`, {
                duration: 3000,
                position: 'top-right',
              });
            }
            if (removedCount > 0) {
              toast.success(`มีการลบ ${removedCount} เว็บไซต์`, {
                duration: 3000,
                position: 'top-right',
              });
            }
          }
          
          setTimeout(() => setIsRealTimeActive(false), 2000);
        }
      },
      (error) => {
        // Real-time listener error - silently disable
        setIsRealTimeActive(false);
      }
    );

    return () => {
      if (websiteUnsubscribe) {
        websiteUnsubscribe();
      }
    };
  }, [user, userProfile, teams, loadWebsitesOptimized]);

  // Real-time listener for topup history changes
  useEffect(() => {
    if (!user || !userProfile) return;

    let topupUnsubscribe: (() => void) | null = null;
    let isInitialLoad = true;

    // Set up real-time listener for topupHistory collection
    const topupHistoryRef = collection(db, 'topupHistory');
    topupUnsubscribe = onSnapshot(
      query(topupHistoryRef, orderBy('timestamp', 'desc')),
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
            // Reload today's topup amount to get the updated data
            loadTodayTopupAmount();
            setLastUpdated(new Date());
            
            // Show notification
            toast.success(
              `มีการเติมเงินใหม่ ${relevantNewRecords.length} รายการ`,
              {
                duration: 4000,
                position: 'top-right',
              }
            );
          }
          
          setTimeout(() => setIsRealTimeActive(false), 2000);
        }
      },
      (error) => {
        // Real-time topup listener error - silently disable
        setIsRealTimeActive(false);
      }
    );

    return () => {
      if (topupUnsubscribe) {
        topupUnsubscribe();
      }
    };
  }, [user, userProfile, teams, loadTodayTopupAmount]);

  // Real-time listener for withdraw history changes
  useEffect(() => {
    if (!user || !userProfile) return;

    let withdrawUnsubscribe: (() => void) | null = null;
    let isInitialLoad = true;

    // Set up real-time listener for withdrawHistory collection
    const withdrawHistoryRef = collection(db, 'withdrawHistory');
    withdrawUnsubscribe = onSnapshot(
      query(withdrawHistoryRef, orderBy('timestamp', 'desc')),
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
            // Reload today's withdraw amount to get the updated data
            loadTodayWithdrawAmount();
            setLastUpdated(new Date());
            
            // Show notification
            toast.success(
              `มีการถอนเงินใหม่ ${relevantNewRecords.length} รายการ`,
              {
                duration: 4000,
                position: 'top-right',
              }
            );
          }
          
          setTimeout(() => setIsRealTimeActive(false), 2000);
        }
      },
      (error) => {
        // Real-time withdraw listener error - silently disable
        setIsRealTimeActive(false);
      }
    );

    return () => {
      if (withdrawUnsubscribe) {
        withdrawUnsubscribe();
      }
    };
  }, [user, userProfile, teams, loadTodayWithdrawAmount]);

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
    if (!user || !newWebsite.name || !newWebsite.url || !newWebsite.apiKey) {
      toast.error('กรุณากรอกข้อมูลให้ครบทุกช่อง');
      return;
    }

    // ตรวจสอบว่ามีทีมหรือไม่
    if (teams.length === 0) {
      toast.error('ต้องมีทีมก่อนถึงจะสามารถเพิ่มเว็บไซต์ได้');
      return;
    }

    // ตรวจสอบการเลือกทีม
    if (!newWebsite.teamId) {
      toast.error('กรุณาเลือกทีมสำหรับเว็บไซต์');
      return;
    }
    
    try {
      // ใช้ทีมที่เลือก
      const selectedTeam = teams.find(t => t.id === newWebsite.teamId);
      
      if (!selectedTeam) {
        toast.error('ไม่พบทีมที่เลือก');
        return;
      }
      
      const websiteData = {
        name: newWebsite.name,
        url: newWebsite.url,
        apiKey: newWebsite.apiKey,
        status: 'inactive',
        isActive: true, // Set website as active by default
        balance: 0,
        dailyTopup: 0,
        teamId: selectedTeam.id,
        teamName: selectedTeam.name, // เพิ่มชื่อทีมเพื่อแสดงผล
        userId: user.uid,
        createdAt: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        lastTopupDate: null
      };
      
      // เก็บใน main websites collection
      const websitesRef = collection(db, 'websites');
      const docRef = await addDoc(websitesRef, websiteData);
      
      // Add to local state
      setWebsites([...websites, { id: docRef.id, ...websiteData }]);
      
      // Log website creation
      if (userProfile) {
        await logWebsiteCreated(
          userProfile.uid,
          userProfile.email,
          userProfile.displayName,
          newWebsite.name,
          newWebsite.url,
          selectedTeam.name
        );
      }
      
      setNewWebsite({ name: '', url: '', apiKey: '', teamId: '' });
      setShowAddWebsite(false);
      
      toast.success(`เพิ่มเว็บไซต์ "${newWebsite.name}" ในทีม "${selectedTeam.name}" เรียบร้อย`);
      
    } catch (error) {
      // Error adding website
      toast.error('ไม่สามารถเพิ่มเว็บไซต์ได้');
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
    if (!user || !deleteConfirm.websiteId) return;
    
    try {
      const website = websites.find(w => w.id === deleteConfirm.websiteId);
      if (!website) return;
      
      // ตรวจสอบสิทธิ์ในการลบเว็บไซต์
      if (website.teamId && !hasTeamPermission(website.teamId, 'websites', 'delete')) {
        toast.error('คุณไม่มีสิทธิ์ลบเว็บไซต์นี้');
        hideDeleteConfirm();
        return;
      }
      
      // Delete from Firestore - ใช้ main websites collection หรือ user subcollection
      let websiteRef;
      if (website?.teamId) {
        websiteRef = doc(db, 'websites', deleteConfirm.websiteId);
      } else {
        websiteRef = doc(db, 'users', user.uid, 'websites', deleteConfirm.websiteId);
      }
      
      await deleteDoc(websiteRef);
      
      // Delete related topup history records
      try {
        const topupHistoryRef = website.teamId 
          ? collection(db, 'topupHistory')
          : collection(db, 'users', user.uid, 'topupHistory');
          
        const topupQuery = query(topupHistoryRef, where('websiteId', '==', deleteConfirm.websiteId));
        const topupSnapshot = await getDocs(topupQuery);
        
        const topupDeletePromises = topupSnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(topupDeletePromises);
        
        console.log(`Deleted ${topupSnapshot.docs.length} topup history records for website ${deleteConfirm.websiteId}`);
      } catch (error) {
        console.error('Error deleting topup history:', error);
        // Continue with deletion even if history cleanup fails
      }
      
      // Delete related withdraw history records
      try {
        const withdrawHistoryRef = website.teamId 
          ? collection(db, 'withdrawHistory')
          : collection(db, 'users', user.uid, 'withdrawHistory');
          
        const withdrawQuery = query(withdrawHistoryRef, where('websiteId', '==', deleteConfirm.websiteId));
        const withdrawSnapshot = await getDocs(withdrawQuery);
        
        const withdrawDeletePromises = withdrawSnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(withdrawDeletePromises);
        
        console.log(`Deleted ${withdrawSnapshot.docs.length} withdraw history records for website ${deleteConfirm.websiteId}`);
      } catch (error) {
        console.error('Error deleting withdraw history:', error);
        // Continue with deletion even if history cleanup fails
      }
      
      // Log website deletion
      if (userProfile) {
        const teamName = website.teamName || teams.find(t => t.id === website.teamId)?.name;
        await logWebsiteDeleted(
          userProfile.uid,
          userProfile.email,
          userProfile.displayName,
          website.name,
          website.url,
          teamName
        );
      }
      
      // Remove from local state
      setWebsites(websites.filter(website => website.id !== deleteConfirm.websiteId));
      
      toast.success('ลบเว็บไซต์และประวัติที่เกี่ยวข้องเรียบร้อย');
      hideDeleteConfirm();
      
    } catch (error) {
      console.error('Error deleting website:', error);
      toast.error('ไม่สามารถลบเว็บไซต์ได้');
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

    setTopupModal({
      show: false,
      websiteId: '',
      websiteName: ''
    });
    setTopupConfirm({
      show: true,
      websiteId: topupModal.websiteId,
      websiteName: topupModal.websiteName,
      amount: amount,
      note: topupNote
    });
  };

  const hideTopupConfirm = () => {
    setIsTopupProcessing(false);
    setTopupConfirm({
      show: false,
      websiteId: '',
      websiteName: '',
      amount: 0,
      note: ''
    });
    setTopupModal({
      show: true,
      websiteId: topupConfirm.websiteId,
      websiteName: topupConfirm.websiteName
    });
    setTopupAmount(topupConfirm.amount.toString());
    setTopupNote(topupConfirm.note);
  };

  const executeTopup = async () => {
    if (!user || !topupConfirm.websiteId || isTopupProcessing) return;

    setIsTopupProcessing(true);
    try {
      const website = websites.find(w => w.id === topupConfirm.websiteId);
      if (!website) return;
      
      // ตรวจสอบสิทธิ์ในการเติมเงิน
      if (website.teamId && !hasTeamPermission(website.teamId, 'topup', 'create')) {
        toast.error('คุณไม่มีสิทธิ์เติมเงินสำหรับเว็บไซต์นี้');
        setTopupConfirm({ show: false, websiteId: '', websiteName: '', amount: 0, note: '' });
        setIsTopupProcessing(false);
        return;
      }

      const newBalance = website.balance + topupConfirm.amount;
      const newDailyTopup = website.dailyTopup + topupConfirm.amount;
      const today = new Date().toISOString().split('T')[0];

      // Update in Firestore - ใช้ main websites collection หรือ user subcollection
      let websiteRef;
      if (website.teamId) {
        websiteRef = doc(db, 'websites', topupConfirm.websiteId);
      } else {
        websiteRef = doc(db, 'users', user.uid, 'websites', topupConfirm.websiteId);
      }

      await updateDoc(websiteRef, {
        balance: newBalance,
        dailyTopup: newDailyTopup,
        lastUpdate: new Date().toISOString(),
        lastTopupDate: today
      });

      // Save topup history
      const topupHistoryRef = website.teamId 
        ? collection(db, 'topupHistory')
        : collection(db, 'users', user.uid, 'topupHistory');
        
      await addDoc(topupHistoryRef, {
        websiteId: topupConfirm.websiteId,
        websiteName: topupConfirm.websiteName,
        teamId: website.teamId || null,
        amount: topupConfirm.amount,
        balanceAfter: newBalance, // ยอดเงินรวมหลังเติม
        timestamp: new Date().toISOString(),
        status: 'completed',
        topupBy: userProfile?.displayName || user.displayName || user.email || 'ผู้ใช้',
        topupByUid: user.uid,
        note: topupConfirm.note || null // เพิ่มหมายเหตุ (optional)
      });

      // Update local state
      setWebsites(websites.map(w => 
        w.id === topupConfirm.websiteId 
          ? { ...w, balance: newBalance, dailyTopup: newDailyTopup, lastUpdate: 'เพิ่งอัพเดท', lastTopupDate: today }
          : w
      ));

      // Update stats
      const totalBalance = websites.reduce((sum, site: any) => 
        site.id === topupConfirm.websiteId ? sum + newBalance : sum + (site.balance || 0), 0
      );
      const totalDailyTopup = websites.reduce((sum, site: any) => 
        site.id === topupConfirm.websiteId ? sum + newDailyTopup : sum + (site.dailyTopup || 0), 0
      );

      setStats({
        totalBalance,
        monthlyIncome: totalDailyTopup * 30,
        monthlyExpense: totalBalance * 0.1,
        savings: totalBalance * 0.8
      });

      // Log website topup
      if (userProfile) {
        const teamName = website.teamName || teams.find(t => t.id === website.teamId)?.name;
        await logWebsiteTopup(
          userProfile.uid,
          userProfile.email,
          userProfile.displayName,
          topupConfirm.websiteName,
          topupConfirm.amount,
          teamName
        );
      }

      toast.success(`เติมเงิน ฿${topupConfirm.amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} สำเร็จ`);
      
      // Refresh today's topup amount
      loadTodayTopupAmount();
      
      // Clear topup history cache to force refresh when user navigates to topup-history page
      cacheManager.clearCache(CACHE_KEYS.TOPUP_HISTORY);
      
      setTopupConfirm({
        show: false,
        websiteId: '',
        websiteName: '',
        amount: 0,
        note: ''
      });
      setTopupAmount('');
      setTopupNote('');
      
    } catch (error) {
      // Error executing topup
      toast.error('ไม่สามารถเติมเงินได้');
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
    if (!user || !withdrawConfirm.websiteId) return;

    try {
      const website = websites.find(w => w.id === withdrawConfirm.websiteId);
      if (!website) return;
      
      // ตรวจสอบสิทธิ์ในการถอนเงิน
      if (website.teamId && !hasTeamPermission(website.teamId, 'topup', 'create')) {
        toast.error('คุณไม่มีสิทธิ์ถอนเงินสำหรับเว็บไซต์นี้');
        setWithdrawConfirm({ show: false, websiteId: '', websiteName: '', amount: 0, note: '' });
        return;
      }

      // Check balance again
      if ((website.balance || 0) < withdrawConfirm.amount) {
        toast.error('ยอดเงินในเว็บไซต์ไม่เพียงพอสำหรับการถอน');
        setWithdrawConfirm({ show: false, websiteId: '', websiteName: '', amount: 0, note: '' });
        return;
      }

      const newBalance = website.balance - withdrawConfirm.amount;
      const today = new Date().toISOString().split('T')[0];

      // Update in Firestore - ใช้ main websites collection หรือ user subcollection
      let websiteRef;
      if (website.teamId) {
        websiteRef = doc(db, 'websites', withdrawConfirm.websiteId);
      } else {
        websiteRef = doc(db, 'users', user.uid, 'websites', withdrawConfirm.websiteId);
      }

      await updateDoc(websiteRef, {
        balance: newBalance,
        lastUpdate: new Date().toISOString(),
        lastWithdrawDate: today
      });

      // Save withdraw history
      const withdrawHistoryRef = website.teamId 
        ? collection(db, 'withdrawHistory')
        : collection(db, 'users', user.uid, 'withdrawHistory');
        
      await addDoc(withdrawHistoryRef, {
        websiteId: withdrawConfirm.websiteId,
        websiteName: withdrawConfirm.websiteName,
        teamId: website.teamId || null,
        amount: withdrawConfirm.amount,
        balanceAfter: newBalance,
        timestamp: new Date().toISOString(),
        status: 'completed',
        withdrawBy: userProfile?.displayName || user.displayName || user.email || 'ผู้ใช้',
        withdrawByUid: user.uid,
        note: withdrawConfirm.note || null
      });

      // Update local state
      setWebsites(websites.map(w => 
        w.id === withdrawConfirm.websiteId 
          ? { ...w, balance: newBalance, lastUpdate: 'เพิ่งอัพเดท', lastWithdrawDate: today }
          : w
      ));

      // Update stats
      const totalBalance = websites.reduce((sum, site: any) => 
        site.id === withdrawConfirm.websiteId ? sum + newBalance : sum + (site.balance || 0), 0
      );

      setStats({
        totalBalance,
        monthlyIncome: totalBalance * 0.3,
        monthlyExpense: totalBalance * 0.1,
        savings: totalBalance * 0.8
      });

      toast.success(`ถอนเงิน ฿${withdrawConfirm.amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} สำเร็จ`);
      
      setWithdrawConfirm({
        show: false,
        websiteId: '',
        websiteName: '',
        amount: 0,
        note: ''
      });
      setWithdrawAmount('');
      setWithdrawNote('');
      
    } catch (error) {
      console.error('Error during withdraw:', error);
      toast.error('ไม่สามารถถอนเงินได้');
    }
  };

  // ฟังก์ชันกรองเว็บไซต์ตามทีม
  const getFilteredWebsites = () => {
    if (selectedTeamFilter === 'all') {
      return websites;
    }
    return websites.filter(website => website.teamId === selectedTeamFilter);
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

  // ตรวจสอบสิทธิ์การเข้าถึง dashboard
  // ผู้ใช้ที่มี teamId สามารถเข้า dashboard ได้ แม้จะเป็น user role
  if (isUser() && !userProfile?.teamId) {
    window.location.href = '/no-team';
    return null;
  }

  return (
    <DashboardLayout 
      title="แดชบอร์ด" 
      subtitle="ภาพรวมการเงินของคุณ"
    >
      <div className="space-y-6 lg:space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, index) => (
            <div key={index} className={`bg-gradient-to-r ${stat.color} rounded-2xl p-6 text-white`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm font-medium">
                    {stat.title}
                  </p>
                  <p className="text-2xl font-bold">
                    {stat.value}
                  </p>
                </div>
                <stat.icon className="h-8 w-8 text-white/60" />
              </div>
            </div>
          ))}
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
                onClick={handleRefreshWebsites}
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
                        toast.error(`ต้องมีทีมก่อนถึงจะสามารถเพิ่มเว็บไซต์ได้ (ทีม: ${teams.length})`);
                      }}
                      className="flex items-center space-x-2 bg-gray-400 dark:bg-gray-600 text-white px-4 py-2 rounded-xl cursor-not-allowed opacity-60 hover:opacity-70 transition-opacity"
                      title="ต้องมีทีมก่อนถึงจะสามารถเพิ่มเว็บไซต์ได้"
                    >
                      <PlusIcon className="h-4 w-4" />
                      <span>เพิ่มเว็บไซต์</span>
                    </button>
                    <div className="text-sm text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 px-3 py-1 rounded-lg">
                      ต้องมีทีมก่อน (จำนวนทีม: {teams.length})
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
                          <p className="text-sm">คลิก &quot;เพิ่มเว็บไซต์&quot; เพื่อเริ่มต้น</p>
                        ) : (
                          <p className="text-sm text-orange-600 dark:text-orange-400">
                            ต้องมีทีมก่อนถึงจะสามารถเพิ่มเว็บไซต์ได้
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
                        <tr key={website.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200">
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
                            <div className="font-bold text-green-600 dark:text-green-400">฿{(website.balance || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <div className="font-bold text-blue-600 dark:text-blue-400">฿{(todayTopupByWebsite[website.id] || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
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
                              {canCreateTopup() && (!website.teamId || hasTeamPermission(website.teamId, 'topup', 'create')) && (
                                <button 
                                  onClick={() => showTopupModal(website.id, website.name)}
                                  className="flex items-center space-x-1 px-2 py-1 bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 rounded-lg text-xs font-medium transition-colors"
                                >
                                  <CurrencyDollarIcon className="h-3 w-3" />
                                  <span>เติมเงิน</span>
                                </button>
                              )}
                              {/* ซ่อนปุ่มถอนเงินชั่วคราว */}
                              {false && canDeleteWebsites() && (!website.teamId || hasTeamPermission(website.teamId, 'websites', 'delete')) && (
                                <button 
                                  onClick={() => showWithdrawModal(website.id, website.name)}
                                  className="flex items-center space-x-1 px-2 py-1 bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 rounded-lg text-xs font-medium transition-colors"
                                >
                                  <ArrowTrendingDownIcon className="h-3 w-3" />
                                  <span>ถอนเงิน</span>
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
                              {(!canCreateTopup() || (website.teamId && !hasTeamPermission(website.teamId, 'topup', 'create'))) && 
                               (!canDeleteWebsites() || (website.teamId && !hasTeamPermission(website.teamId, 'websites', 'delete'))) && (
                                <span className="text-xs text-gray-400 dark:text-gray-500">ไม่มีสิทธิ์จัดการ</span>
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
                  className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl hover:from-orange-600 hover:to-red-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium"
                >
                  ยืนยันถอนเงิน
                </button>
              </div>
            </div>
          </div>
        </PortalModal>
      </div>
    </DashboardLayout>
  );
} 