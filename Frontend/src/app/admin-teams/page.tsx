'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../contexts/AuthContext';
import { 
  UserGroupIcon, 
  EyeIcon, 
  PencilIcon, 
  TrashIcon,
  UserIcon,
  CalendarIcon,
  ChartBarIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  AdjustmentsHorizontalIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { 
  UserGroupIcon as UserGroupIconSolid,
  EyeIcon as EyeIconSolid,
  ChartBarIcon as ChartBarIconSolid
} from '@heroicons/react/24/solid';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  getDoc
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import toast from 'react-hot-toast';
import { logAdminTeamStatusChanged, logAdminTeamDeleted } from '../../utils/logger';

interface TeamOwner {
  name: string;
  email: string;
  uid: string;
}

interface Team {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  createdAt: Date;
  status: 'active' | 'inactive';
  owner: TeamOwner;
  totalBalance: number;
  totalWebsites: number;
  dailyTopup: number;
  ownerId: string;
  ownerName?: string;
}

const AdminTeamsPage: React.FC = () => {
  const { canAccessAdminPanel, isAdmin } = usePermission();
  const { user, loading: authLoading } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [filteredTeams, setFilteredTeams] = useState<Team[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Add caching to prevent unnecessary reloads
  const [lastFetch, setLastFetch] = useState<number>(0);
  const CACHE_DURATION = 60000; // 1 minute cache

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && user && !isAdmin()) {
      window.location.href = '/dashboard';
    }
  }, [user, authLoading, isAdmin]);

  // Load teams data from Firestore with caching
  const loadTeams = async (force = false) => {
    if (authLoading || !user) {
      setInitialLoading(false);
      return;
    }

    if (!isAdmin()) {
      setError('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
      setInitialLoading(false);
      return;
    }

    // Check cache unless forced refresh
    const now = Date.now();
    if (!force && !initialLoading && teams.length > 0 && (now - lastFetch) < CACHE_DURATION) {
      
      return;
    }

    try {
      setError(null);
      if (!initialLoading) {
        setIsLoading(true);
      }
      
      // Fetch all teams first
      const teamsRef = collection(db, 'teams');
      const teamsSnapshot = await getDocs(teamsRef);
      
      if (teamsSnapshot.empty) {
        setTeams([]);
        setFilteredTeams([]);
        return;
      }

      const teamIds = teamsSnapshot.docs.map(doc => doc.id);
      
      // Batch fetch all related data in parallel
      const [allMembersSnapshot, allWebsitesSnapshot, allUsersSnapshot, allTopupSnapshot] = await Promise.all([
        // Fetch all team members at once
        getDocs(query(
          collection(db, 'teamMembers'),
          where('status', '==', 'active')
        )),
        
        // Fetch all websites at once
        getDocs(collection(db, 'websites')),
        
        // Fetch all users at once (for owner information)
        getDocs(collection(db, 'users')),
        
        // Fetch all topup history for today's calculation
        getDocs(collection(db, 'topupHistory'))
      ]);

      // Group data by teamId for efficient lookup
      const membersByTeam = new Map<string, number>();
      const websitesByTeam = new Map<string, any[]>();
      const usersById = new Map<string, any>();
      const dailyTopupByTeam = new Map<string, number>();

      // Process members
      allMembersSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const teamId = data.teamId;
        if (teamId && teamIds.includes(teamId)) {
          membersByTeam.set(teamId, (membersByTeam.get(teamId) || 0) + 1);
        }
      });

      // Process websites
      allWebsitesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const teamId = data.teamId;
        if (teamId && teamIds.includes(teamId)) {
          if (!websitesByTeam.has(teamId)) {
            websitesByTeam.set(teamId, []);
          }
          websitesByTeam.get(teamId)!.push(data);
        }
      });

      // Process users
      allUsersSnapshot.docs.forEach(doc => {
        usersById.set(doc.id, doc.data());
      });

      // Process topup history for today's calculation
      const today = new Date();
      allTopupSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const recordDate = new Date(data.timestamp);
        
        // Check if record is from today
        if (recordDate.toDateString() === today.toDateString()) {
          const teamId = data.teamId;
          if (teamId && teamIds.includes(teamId)) {
            const amount = data.amount || 0;
            dailyTopupByTeam.set(teamId, (dailyTopupByTeam.get(teamId) || 0) + amount);
          }
        }
      });

      // Build teams data efficiently
      const teamsData: Team[] = teamsSnapshot.docs.map(teamDoc => {
        const teamData = teamDoc.data();
        const teamId = teamDoc.id;
        
        // Get counts and calculations
        const memberCount = membersByTeam.get(teamId) || 0;
        const websites = websitesByTeam.get(teamId) || [];
        const totalBalance = websites.reduce((sum, website) => sum + (website.balance || 0), 0);
        const dailyTopup = dailyTopupByTeam.get(teamId) || 0;

        // Get owner information
        let owner: TeamOwner = {
          name: teamData.ownerName || 'ไม่ระบุ',
          email: 'ไม่ระบุ',
          uid: teamData.ownerId || ''
        };

        if (teamData.ownerId && usersById.has(teamData.ownerId)) {
          const ownerData = usersById.get(teamData.ownerId);
          owner = {
            name: ownerData.displayName || ownerData.username || ownerData.email?.split('@')[0] || 'ไม่ระบุ',
            email: ownerData.email || 'ไม่ระบุ',
            uid: teamData.ownerId
          };
        }

        // Handle different createdAt formats safely
        let createdAtDate = new Date();
        if (teamData.createdAt) {
          if (typeof teamData.createdAt.toDate === 'function') {
            // Firestore Timestamp
            createdAtDate = teamData.createdAt.toDate();
          } else if (teamData.createdAt instanceof Date) {
            // Already a Date object
            createdAtDate = teamData.createdAt;
          } else if (typeof teamData.createdAt === 'string') {
            // String date
            createdAtDate = new Date(teamData.createdAt);
          } else if (typeof teamData.createdAt === 'number') {
            // Unix timestamp
            createdAtDate = new Date(teamData.createdAt);
          }
        }

        return {
          id: teamId,
          name: teamData.name || 'ไม่ระบุชื่อ',
          description: teamData.description || '',
          memberCount,
          createdAt: createdAtDate,
          status: teamData.status || 'active',
          owner,
          totalBalance,
          totalWebsites: websites.length,
          dailyTopup,
          ownerId: teamData.ownerId || '',
          ownerName: teamData.ownerName
        };
      });

      // Sort by creation date (newest first)
      teamsData.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      
      setTeams(teamsData);
      setFilteredTeams(teamsData);
      setLastFetch(now); // Update cache timestamp
      
    } catch (error) {
      // Error loading teams
      setError('ไม่สามารถโหลดข้อมูลทีมได้: ' + (error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'));
    } finally {
      setInitialLoading(false);
      setIsLoading(false);
    }
  };

  // Wrapper function for refresh button
  const handleRefresh = () => {
    loadTeams(true); // Force refresh
  };

  // Load teams on component mount
  useEffect(() => {
    if (!authLoading && user) {
      loadTeams();
    }
  }, [user, authLoading]);

  // Filter teams based on search and status
  useEffect(() => {
    let filtered = teams;

    if (searchTerm) {
      filtered = filtered.filter(team =>
        team.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        team.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        team.owner.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        team.owner.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(team => team.status === statusFilter);
    }

    setFilteredTeams(filtered);
  }, [searchTerm, statusFilter, teams]);

  const handleViewDetails = (team: Team) => {
    setSelectedTeam(team);
    setShowDetails(true);
  };

  const handleStatusToggle = async (teamId: string) => {
    if (isLoading) return;
    
    setIsLoading(true);
    try {
      const team = teams.find(t => t.id === teamId);
      if (!team) {
        toast.error('ไม่พบข้อมูลทีม');
        return;
      }

      const newStatus = team.status === 'active' ? 'inactive' : 'active';
      
      // Update in Firestore
      const teamRef = doc(db, 'teams', teamId);
      await updateDoc(teamRef, {
        status: newStatus
      });
      
      // Log admin team status change
      if (user) {
        await logAdminTeamStatusChanged(
          user.uid,
          user.email || 'admin@system.local',
          user.displayName || user.email || 'Admin',
          team.name,
          team.status,
          newStatus,
          team.memberCount
        );
      }

      // Update local state
      setTeams(prev => prev.map(team => 
        team.id === teamId 
          ? { ...team, status: newStatus }
          : team
      ));
      
      toast.success(`เปลี่ยนสถานะทีม "${team.name}" เป็น${newStatus === 'active' ? 'ใช้งาน' : 'ไม่ใช้งาน'}แล้ว`);
    } catch (error) {
      // Error updating team status
      toast.error('เกิดข้อผิดพลาดในการเปลี่ยนสถานะ: ' + (error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (isLoading) return;
    
    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    if (!confirm(`คุณแน่ใจหรือไม่ที่จะลบทีม "${team.name}"?\n\nการลบจะส่งผลต่อ:\n- สมาชิกทีม ${team.memberCount} คน\n- เว็บไซต์ ${team.totalWebsites} เว็บไซต์\n- ยอดเงิน ${formatCurrency(team.totalBalance)}`)) {
      return;
    }

    setIsLoading(true);
    try {
      // Delete team members
      const membersQuery = query(
        collection(db, 'teamMembers'),
        where('teamId', '==', teamId)
      );
      const membersSnapshot = await getDocs(membersQuery);
      
      const deletePromises = [];
      
      // Delete all team members
      for (const memberDoc of membersSnapshot.docs) {
        deletePromises.push(deleteDoc(doc(db, 'teamMembers', memberDoc.id)));
      }

      // Delete team websites
      const websitesQuery = query(
        collection(db, 'websites'),
        where('teamId', '==', teamId)
      );
      const websitesSnapshot = await getDocs(websitesQuery);
      
      for (const websiteDoc of websitesSnapshot.docs) {
        deletePromises.push(deleteDoc(doc(db, 'websites', websiteDoc.id)));
      }

      // Delete topup history related to this team
      const topupQuery = query(
        collection(db, 'topupHistory'),
        where('teamId', '==', teamId)
      );
      const topupSnapshot = await getDocs(topupQuery);
      
      for (const topupDoc of topupSnapshot.docs) {
        deletePromises.push(deleteDoc(doc(db, 'topupHistory', topupDoc.id)));
      }

      // Execute all deletions
      await Promise.all(deletePromises);

      // Finally delete the team
      await deleteDoc(doc(db, 'teams', teamId));
      
      // Log admin team deletion
      if (user) {
        await logAdminTeamDeleted(
          user.uid,
          user.email || 'admin@system.local',
          user.displayName || user.email || 'Admin',
          team.name,
          team.memberCount,
          team.totalWebsites,
          team.totalBalance
        );
      }
      
      // Update local state
      setTeams(prev => prev.filter(team => team.id !== teamId));
      toast.success(`ลบทีม "${team.name}" เรียบร้อยแล้ว`);
      
      if (selectedTeam?.id === teamId) {
        setShowDetails(false);
        setSelectedTeam(null);
      }
    } catch (error) {
      // Error deleting team
      toast.error('เกิดข้อผิดพลาดในการลบทีม: ' + (error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ'));
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB'
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    return status === 'active' 
      ? 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/20 dark:border-green-800'
      : 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800';
  };

  const getStatusIcon = (status: string) => {
    return status === 'active' 
      ? <CheckCircleIcon className="h-4 w-4" />
      : <ExclamationTriangleIcon className="h-4 w-4" />;
  };

  // Calculate statistics
  const stats = {
    total: teams.length,
    active: teams.filter(t => t.status === 'active').length,
    inactive: teams.filter(t => t.status === 'inactive').length,
    totalMembers: teams.reduce((sum, team) => sum + team.memberCount, 0),
    totalBalance: teams.reduce((sum, team) => sum + team.totalBalance, 0),
    totalWebsites: teams.reduce((sum, team) => sum + team.totalWebsites, 0)
  };

  // Show loading if auth is still loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">กำลังตรวจสอบสิทธิ์...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin()) {
    return null;
  }

  // Show error screen
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-red-900">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center max-w-md mx-auto p-6">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">เกิดข้อผิดพลาด</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              ลองใหม่
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">กำลังโหลดข้อมูลทีม...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <UserGroupIconSolid className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
              จัดการทีมทั้งหมด
            </h1>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRefresh}
              disabled={isLoading || initialLoading}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              <span className="hidden sm:inline font-medium">รีเฟรช</span>
            </button>
          </div>
        </div>
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6 mb-8">
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">ทีมทั้งหมด</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
              </div>
              <UserGroupIconSolid className="h-10 w-10 text-blue-500 dark:text-blue-400" />
            </div>
          </div>

          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">ทีมที่ใช้งาน</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.active}</p>
              </div>
              <CheckCircleIcon className="h-10 w-10 text-green-500 dark:text-green-400" />
            </div>
          </div>

          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">ทีมที่ไม่ใช้งาน</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.inactive}</p>
              </div>
              <ExclamationTriangleIcon className="h-10 w-10 text-red-500 dark:text-red-400" />
            </div>
          </div>

          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">สมาชิกทั้งหมด</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.totalMembers}</p>
              </div>
              <UserIcon className="h-10 w-10 text-purple-500 dark:text-purple-400" />
            </div>
          </div>

          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">เว็บไซต์รวม</p>
                <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{stats.totalWebsites}</p>
              </div>
              <ChartBarIconSolid className="h-10 w-10 text-indigo-500 dark:text-indigo-400" />
            </div>
          </div>

          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">ยอดเงินรวม</p>
                <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{formatCurrency(stats.totalBalance)}</p>
              </div>
              <ChartBarIcon className="h-10 w-10 text-orange-500 dark:text-orange-400" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/50 shadow-lg mb-8">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหาทีม, รายละเอียด, หรือเจ้าของทีม..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/80 dark:bg-gray-700/80 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 transition-all duration-300"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <AdjustmentsHorizontalIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="pl-10 pr-8 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/80 dark:bg-gray-700/80 text-gray-900 dark:text-white transition-all duration-300 appearance-none min-w-[150px]"
              >
                <option value="all">ทุกสถานะ</option>
                <option value="active">ใช้งาน</option>
                <option value="inactive">ไม่ใช้งาน</option>
              </select>
            </div>
          </div>
        </div>

        {/* Teams Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredTeams.map((team) => (
            <div key={team.id} className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group">
              {/* Team Header */}
              <div className="p-6 border-b border-gray-200/50 dark:border-gray-700/50">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                      <UserGroupIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {team.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {team.memberCount} สมาชิก • {team.totalWebsites} เว็บไซต์
                      </p>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center space-x-1 ${getStatusColor(team.status)}`}>
                    {getStatusIcon(team.status)}
                    <span>{team.status === 'active' ? 'ใช้งาน' : 'ไม่ใช้งาน'}</span>
                  </div>
                </div>

                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">
                  {team.description || 'ไม่มีรายละเอียด'}
                </p>
              </div>

              {/* Team Stats */}
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 dark:text-gray-400">ยอดเงินรวม</p>
                    <p className="text-lg font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(team.totalBalance)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 dark:text-gray-400">เติมเงินวันนี้</p>
                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(team.dailyTopup)}
                    </p>
                  </div>
                </div>

                {/* Team Owner */}
                <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">เจ้าของทีม</p>
                  <p className="font-medium text-gray-900 dark:text-white">{team.owner.name}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{team.owner.email}</p>
                </div>

                {/* Created Date */}
                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mb-4">
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  <span>สร้างเมื่อ {formatDate(team.createdAt)}</span>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleViewDetails(team)}
                    className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all duration-300 transform hover:scale-105 text-sm"
                  >
                    <EyeIcon className="h-4 w-4" />
                    <span>ดูรายละเอียด</span>
                  </button>
                  
                  <button
                    onClick={() => handleStatusToggle(team.id)}
                    disabled={isLoading}
                    className={`px-3 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 text-sm font-medium ${
                      team.status === 'active'
                        ? 'bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400'
                        : 'bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900/30 dark:hover:bg-green-900/50 dark:text-green-400'
                    }`}
                  >
                    {team.status === 'active' ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                  </button>
                  
                  <button
                    onClick={() => handleDeleteTeam(team.id)}
                    disabled={isLoading}
                    className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 rounded-xl transition-all duration-300 transform hover:scale-105 text-sm"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* No Results */}
        {filteredTeams.length === 0 && !initialLoading && (
          <div className="text-center py-12">
            <UserGroupIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {teams.length === 0 ? 'ยังไม่มีทีมในระบบ' : 'ไม่พบทีมที่ตรงกับเงื่อนไข'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {teams.length === 0 
                ? 'เมื่อมีการสร้างทีมใหม่ ข้อมูลจะแสดงที่นี่'
                : 'ลองเปลี่ยนเงื่อนไขการค้นหาหรือกรองข้อมูลใหม่'
              }
            </p>
          </div>
        )}
      </div>

      {/* Team Details Modal */}
      {showDetails && selectedTeam && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  รายละเอียดทีม: {selectedTeam.name}
                </h2>
                <button
                  onClick={() => setShowDetails(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                >
                  <span className="sr-only">ปิด</span>
                  ✕
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">ข้อมูลพื้นฐาน</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ชื่อทีม</label>
                    <p className="text-gray-900 dark:text-white">{selectedTeam.name}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">สถานะ</label>
                    <div className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(selectedTeam.status)}`}>
                      {getStatusIcon(selectedTeam.status)}
                      <span>{selectedTeam.status === 'active' ? 'ใช้งาน' : 'ไม่ใช้งาน'}</span>
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">รายละเอียด</label>
                    <p className="text-gray-900 dark:text-white">{selectedTeam.description || 'ไม่มีรายละเอียด'}</p>
                  </div>
                </div>
              </div>

              {/* Owner Info */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">เจ้าของทีม</h3>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                      <UserIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{selectedTeam.owner.name}</p>
                      <p className="text-gray-600 dark:text-gray-400">{selectedTeam.owner.email}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Statistics */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">สถิติ</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{selectedTeam.memberCount}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">สมาชิก</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{selectedTeam.totalWebsites}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">เว็บไซต์</p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 text-center">
                    <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(selectedTeam.totalBalance)}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">ยอดเงินรวม</p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 text-center">
                    <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{formatCurrency(selectedTeam.dailyTopup)}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">เติมเงินวันนี้</p>
                  </div>
                </div>
              </div>

              {/* Created Date */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">วันที่สร้าง</h3>
                <div className="flex items-center text-gray-600 dark:text-gray-400">
                  <CalendarIcon className="h-5 w-5 mr-2" />
                  <span>{formatDate(selectedTeam.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default AdminTeamsPage; 