'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../contexts/AuthContext';
import { useUserProfile } from '../../contexts/UserContext';
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
  CheckCircleIcon,
  UserPlusIcon
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
  getDoc,
  addDoc,
  limit
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import toast from 'react-hot-toast';
import { logAdminTeamStatusChanged, logAdminTeamDeleted, logTeamMemberAdded } from '../../utils/logger';
import { getUserDisplayName, getUserAvatarInitial } from '../../utils/userDisplay';

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
  const { canAccessAdminPanel, isAdmin, refreshPermissions } = usePermission();
  const { user, loading: authLoading } = useAuth();
  const { refreshUserProfile } = useUserProfile();
  const [teams, setTeams] = useState<Team[]>([]);
  const [filteredTeams, setFilteredTeams] = useState<Team[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [deletingMember, setDeletingMember] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Add caching to prevent unnecessary reloads
  const [lastFetch, setLastFetch] = useState<number>(0);
  const CACHE_DURATION = 60000; // 1 minute cache

  // State ใหม่แบบเดียวกับหน้า team
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [searchUsersResults, setSearchUsersResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserList, setShowUserList] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

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

  const handleViewMembers = async (team: Team) => {
    setSelectedTeam(team);
    setLoadingMembers(true);
    setShowMembers(true);
    
    try {
      // Fetch team members
      const membersQuery = query(
        collection(db, 'teamMembers'),
        where('teamId', '==', team.id),
        where('status', '==', 'active')
      );
      const membersSnapshot = await getDocs(membersQuery);
      
      // Get user details for each member
      const memberPromises = membersSnapshot.docs.map(async (memberDoc) => {
        const memberData = memberDoc.data();
        
        // Safe date conversion
        let joinedAtDate;
        try {
          if (memberData.joinedAt) {
            if (typeof memberData.joinedAt.toDate === 'function') {
              // Firestore Timestamp
              joinedAtDate = memberData.joinedAt.toDate();
            } else if (memberData.joinedAt.seconds) {
              // Timestamp with seconds property
              joinedAtDate = new Date(memberData.joinedAt.seconds * 1000);
            } else if (memberData.joinedAt instanceof Date) {
              // Already a Date object
              joinedAtDate = memberData.joinedAt;
            } else if (typeof memberData.joinedAt === 'string') {
              // String date
              joinedAtDate = new Date(memberData.joinedAt);
            } else {
              // Fallback
              joinedAtDate = new Date();
            }
          } else {
            joinedAtDate = new Date();
          }
        } catch (dateError) {
          console.warn('Date conversion error:', dateError);
          joinedAtDate = new Date();
        }
        
        try {
          const userDoc = await getDoc(doc(db, 'users', memberData.userId));
          const userData = userDoc.exists() ? userDoc.data() : null;
          
          return {
            id: memberDoc.id,
            ...memberData,
            user: userData,
            joinedAt: joinedAtDate,
          };
        } catch (error) {
          console.error('Error fetching user data:', error);
          return {
            id: memberDoc.id,
            ...memberData,
            user: null,
            joinedAt: joinedAtDate,
          };
        }
      });
      
      const members = await Promise.all(memberPromises);
      setTeamMembers(members.sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime()));
      
    } catch (error) {
      console.error('Error loading team members:', error);
      toast.error('ไม่สามารถโหลดรายชื่อสมาชิกได้');
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!window.confirm(`คุณต้องการลบ "${memberName}" ออกจากทีมหรือไม่?`)) {
      return;
    }

    setDeletingMember(memberId);
    try {
      // Delete from teamMembers collection
      await deleteDoc(doc(db, 'teamMembers', memberId));
      
      // Update local state
      const updatedMembers = teamMembers.filter(member => member.id !== memberId);
      setTeamMembers(updatedMembers);
      
      // Update team member count in Firestore and local state
      if (selectedTeam) {
        const newMemberCount = updatedMembers.length;
        
        try {
          await updateDoc(doc(db, 'teams', selectedTeam.id), {
            memberCount: newMemberCount
          });
          
          // Update local team state
          setTeams(prev => prev.map(team => 
            team.id === selectedTeam.id 
              ? { ...team, memberCount: newMemberCount }
              : team
          ));
          
          // Update selected team
          setSelectedTeam(prev => prev ? { ...prev, memberCount: newMemberCount } : prev);
        } catch (error) {
          console.warn('Failed to update team member count:', error);
        }
      }
      
      // Log admin action
      console.log(`Admin removed member ${memberName} from team ${selectedTeam?.name}`);
      
      toast.success(`ลบสมาชิก "${memberName}" ออกจากทีมแล้ว`);
      
      // Refresh teams data to ensure everything is up to date
      await loadTeams(true);
      
    } catch (error) {
      console.error('Error removing team member:', error);
      toast.error('ไม่สามารถลบสมาชิกได้ กรุณาลองใหม่');
    } finally {
      setDeletingMember(null);
    }
  };

  // ฟังก์ชันจากหน้า team
  const selectUser = (user: any) => {
    setSelectedUser(user);
    setSearchQuery(getUserDisplayName(user));
    setInviteEmail(user.email || user.username || '');
    setShowUserList(false);
    setSearchUsersResults([]);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setInviteEmail(value);

    // Clear selection if user manually changes the input and it doesn't match the selected user
    if (selectedUser && value !== getUserDisplayName(selectedUser)) {
      setSelectedUser(null);
    }

    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Set new timeout for search
    if (value.trim().length >= 2) {
      const timeout = setTimeout(() => {
        searchUsersInDatabase(value);
      }, 300); // 300ms delay
      setSearchTimeout(timeout);
    } else {
      setSearchUsersResults([]);
      setShowUserList(false);
    }
  };

  const searchUsersInDatabase = async (searchTerm: string) => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setSearchUsersResults([]);
      setShowUserList(false);
      return;
    }

    setLoadingUsers(true);
    try {
      // Load all users (same approach as team management page)
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const allUsers = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];

      // Filter users based on search query (client-side filtering)
      const searchLower = searchTerm.toLowerCase();
      const filteredUsers = allUsers.filter((user: any) => {
        const matches = (
          user.displayName?.toLowerCase().includes(searchLower) ||
          user.email?.toLowerCase().includes(searchLower) ||
          user.username?.toLowerCase().includes(searchLower)
        );
        return matches;
      });

      // Filter out users who are already team members
      let availableUsers = filteredUsers;
      if (selectedTeam) {
        const existingMembersQuery = query(
          collection(db, 'teamMembers'),
          where('teamId', '==', selectedTeam.id)
        );
        const existingMembersSnapshot = await getDocs(existingMembersQuery);
        const existingUserIds = new Set(existingMembersSnapshot.docs.map(doc => doc.data().userId));
        
        // Remove existing members from results
        availableUsers = filteredUsers.filter((user: any) => !existingUserIds.has(user.id));
      }

      setSearchUsersResults(availableUsers.slice(0, 10)); // Limit to 10 results
      setShowUserList(true);
      
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchUsersResults([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const addMemberDirectly = async () => {
    if (!selectedTeam) {
      toast.error('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    // ตรวจสอบว่าเลือกผู้ใช้หรือกรอกข้อมูลมาหรือไม่
    if (!selectedUser && !inviteEmail?.trim()) {
      toast.error('กรุณาเลือกผู้ใช้หรือกรอกข้อมูลผู้ใช้');
      return;
    }

    try {
      let targetUser = selectedUser;
      let targetEmail = '';
      let targetDisplayName = '';
      let targetUserId = '';

      if (selectedUser) {
        // ผู้ใช้ที่มีในระบบแล้ว
        targetEmail = selectedUser.email || `${selectedUser.username}@app.local`;
        targetDisplayName = getUserDisplayName(selectedUser);
        targetUserId = selectedUser.id;
      } else if (inviteEmail?.trim()) {
        // ผู้ใช้ใหม่
        const username = inviteEmail.trim();
        targetEmail = username.includes('@') ? username : `${username}@app.local`;
        targetDisplayName = username.includes('@') ? username.split('@')[0] : username;
        targetUserId = ''; // จะไม่มี userId สำหรับผู้ใช้ใหม่
      }

      // ตรวจสอบว่ามีสมาชิกอยู่แล้วหรือไม่
      const existingMember = teamMembers.find(member => 
        member.email === targetEmail ||
        (targetUserId && member.userId === targetUserId)
      );
      
      if (existingMember) {
        toast.error('ผู้ใช้นี้เป็นสมาชิกอยู่แล้ว');
        return;
      }

      // สร้างข้อมูลสมาชิกใหม่ - ใช้ role 'user' เสมอ
      const memberRole = 'user';
      
      const memberData = {
        email: targetEmail,
        displayName: targetDisplayName,
        role: memberRole,
        invitedAt: new Date().toISOString(),
        acceptedAt: new Date().toISOString(),
        joinedAt: new Date().toISOString(),
        invitedBy: user?.uid || 'admin',
        status: 'active',
        teamId: selectedTeam.id,
        ...(targetUserId && { userId: targetUserId })
      };

      // เพิ่มสมาชิกเข้าทีม (ขั้นตอนหลัก)
      let docRef;
      try {
        docRef = await addDoc(collection(db, 'teamMembers'), memberData);
      } catch (error) {
        console.error('Failed to add team member:', error);
        toast.error('ไม่สามารถเพิ่มสมาชิกได้ กรุณาลองใหม่');
        return;
      }
      
      // อัพเดท local state
      const newMember = { id: docRef.id, ...memberData };
      const updatedMembers = [...teamMembers, newMember];
      setTeamMembers(updatedMembers);
      
      // Log team member addition (ไม่ต้องรอผลลัพธ์)
      if (user && selectedTeam) {
        // ทำแบบ fire-and-forget ไม่ block การทำงาน
        logTeamMemberAdded(
          user.uid,
          user.email || 'admin@system.local',
          user.displayName || user.email || 'Admin',
          targetEmail,
          targetDisplayName,
          selectedTeam.name,
          memberRole
        ).catch((error: any) => {
          console.warn('Failed to log team member addition:', error);
        });
      }

      // อัพเดท users collection ถ้าเป็นผู้ใช้ที่มีในระบบ (แบบ optional)
      if (targetUserId) {
        try {
          await updateDoc(doc(db, 'users', targetUserId), {
            teamId: selectedTeam.id,
            lastLogin: new Date()
          });
          
          // ถ้าเป็นผู้ใช้ปัจจุบันที่ถูกเพิ่มเข้าทีม ให้ refresh profile
          if (targetUserId === user?.uid) {
            try {
              await refreshUserProfile();
              await refreshPermissions();
            } catch (error) {
              console.warn('Failed to refresh user profile:', error);
            }
          }
        } catch (error) {
          console.warn('Failed to update user teamId:', error);
          // ไม่ต้อง throw error เพราะไม่ critical
        }
      }

      // อัพเดทจำนวนสมาชิกในทีม (แบบ optional)
      try {
        const currentMembersQuery = query(
          collection(db, 'teamMembers'),
          where('teamId', '==', selectedTeam.id),
          where('status', '==', 'active')
        );
        const currentMembersSnapshot = await getDocs(currentMembersQuery);
        const actualMemberCount = currentMembersSnapshot.docs.length;
        
        const teamRef = doc(db, 'teams', selectedTeam.id);
        await updateDoc(teamRef, {
          memberCount: actualMemberCount
        });
      } catch (error) {
        console.warn('Failed to update team member count:', error);
        // ไม่ต้อง throw error เพราะไม่ critical
      }
      
      // Reset form
      setInviteEmail('');
      setSearchQuery('');
      setSelectedUser(null);
      setShowUserList(false);
      setSearchUsersResults([]);
      setShowInviteModal(false);
      
      toast.success(`เพิ่ม ${targetDisplayName} เข้าทีมเรียบร้อย`);
      
      // Refresh teams data to ensure everything is up to date
      await loadTeams(true);
      
      // แจ้งเตือนให้ผู้ใช้รีเฟรชหน้าเว็บหากเป็นการเพิ่มตัวเอง
      if (targetUserId === user?.uid) {
        setTimeout(() => {
          toast.success('กรุณารีเฟรชหน้าเว็บเพื่อดูข้อมูลที่อัปเดต', {
            duration: 5000,
          });
        }, 1000);
      }
      
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการเพิ่มสมาชิก กรุณาลองใหม่อีกครั้ง');
    }
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
        {/* Statistics Cards - Compact */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 backdrop-blur-sm rounded-xl p-4 border border-blue-200/50 dark:border-blue-700/50 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-blue-700 dark:text-blue-400">ทีมทั้งหมด</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
              </div>
              <div className="p-2 bg-blue-500 rounded-lg">
                <UserGroupIconSolid className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 backdrop-blur-sm rounded-xl p-4 border border-green-200/50 dark:border-green-700/50 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-green-700 dark:text-green-400">ใช้งาน</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">{stats.active}</p>
              </div>
              <div className="p-2 bg-green-500 rounded-lg">
                <CheckCircleIcon className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 backdrop-blur-sm rounded-xl p-4 border border-red-200/50 dark:border-red-700/50 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-red-700 dark:text-red-400">ไม่ใช้งาน</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{stats.inactive}</p>
              </div>
              <div className="p-2 bg-red-500 rounded-lg">
                <ExclamationTriangleIcon className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 backdrop-blur-sm rounded-xl p-4 border border-purple-200/50 dark:border-purple-700/50 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-purple-700 dark:text-purple-400">สมาชิก</p>
                <p className="text-xl font-bold text-purple-600 dark:text-purple-400">{stats.totalMembers}</p>
              </div>
              <div className="p-2 bg-purple-500 rounded-lg">
                <UserIcon className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 backdrop-blur-sm rounded-xl p-4 border border-indigo-200/50 dark:border-indigo-700/50 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-indigo-700 dark:text-indigo-400">เว็บไซต์</p>
                <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{stats.totalWebsites}</p>
              </div>
              <div className="p-2 bg-indigo-500 rounded-lg">
                <ChartBarIconSolid className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 backdrop-blur-sm rounded-xl p-4 border border-orange-200/50 dark:border-orange-700/50 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-orange-700 dark:text-orange-400">ยอดเงิน</p>
                <p className="text-sm font-bold text-orange-600 dark:text-orange-400">{formatCurrency(stats.totalBalance)}</p>
              </div>
              <div className="p-2 bg-orange-500 rounded-lg">
                <ChartBarIcon className="h-5 w-5 text-white" />
              </div>
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
            <div key={team.id} className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl border border-gray-200/60 dark:border-gray-700/60 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group hover:scale-[1.02]">
              {/* Team Header - More Compact */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <div className="p-2.5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg">
                      <UserGroupIcon className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                        {team.name}
                      </h3>
                      <div className="flex items-center space-x-3 text-sm text-gray-600 dark:text-gray-400">
                        <span className="flex items-center">
                          <UserIcon className="h-3.5 w-3.5 mr-1" />
                          {team.memberCount}
                        </span>
                        <span className="flex items-center">
                          <ChartBarIcon className="h-3.5 w-3.5 mr-1" />
                          {team.totalWebsites}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center space-x-1 ${getStatusColor(team.status)} shrink-0`}>
                    {getStatusIcon(team.status)}
                    <span className="hidden sm:inline">{team.status === 'active' ? 'ใช้งาน' : 'ปิด'}</span>
                  </div>
                </div>

                {/* Team Stats - Compact Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-3 text-center border border-green-200/50 dark:border-green-700/50">
                    <p className="text-xs text-green-700 dark:text-green-400 font-medium mb-1">ยอดเงินรวม</p>
                    <p className="text-sm font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(team.totalBalance)}
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-3 text-center border border-blue-200/50 dark:border-blue-700/50">
                    <p className="text-xs text-blue-700 dark:text-blue-400 font-medium mb-1">เติมวันนี้</p>
                    <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(team.dailyTopup)}
                    </p>
                  </div>
                </div>

                {/* Team Owner - More Compact */}
                <div className="mb-4 p-3 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700/50 dark:to-gray-600/50 rounded-xl border border-gray-200/50 dark:border-gray-600/50">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                      <UserIcon className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{team.owner.name}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{team.owner.email}</p>
                    </div>
                  </div>
                </div>

                {/* Created Date & Description - Combined */}
                <div className="mb-4 space-y-2">
                  {team.description && (
                    <p className="text-gray-600 dark:text-gray-400 text-xs line-clamp-2 bg-gray-50/50 dark:bg-gray-700/30 rounded-lg p-2">
                      {team.description}
                    </p>
                  )}
                  <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                    <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                    <span>สร้างเมื่อ {formatDate(team.createdAt)}</span>
                  </div>
                </div>

                {/* Action Buttons - More Compact */}
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleViewDetails(team)}
                    className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl transition-all duration-300 transform hover:scale-105 text-xs font-medium shadow-lg"
                  >
                    <EyeIcon className="h-3.5 w-3.5" />
                    <span>รายละเอียด</span>
                  </button>

                                        <button
                        onClick={() => {
                          setSelectedTeam(team);
                          handleViewMembers(team);
                          setShowMembers(true);
                        }}
                        className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200"
                      >
                        <span className="hidden sm:inline">สมาชิก</span>
                        <span className="sm:hidden">👥</span>
                      </button>
                      
                      <button
                        onClick={() => {
                          setSelectedTeam(team);
                          setShowInviteModal(true);
                        }}
                        className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all duration-200"
                      >
                        <span className="hidden sm:inline">เพิ่ม</span>
                        <span className="sm:hidden">➕</span>
                      </button>
                  
                  <button
                    onClick={() => handleStatusToggle(team.id)}
                    disabled={isLoading}
                    className={`px-3 py-2.5 rounded-xl transition-all duration-300 transform hover:scale-105 text-xs font-medium shadow-sm ${
                      team.status === 'active'
                        ? 'bg-gradient-to-r from-red-100 to-red-200 hover:from-red-200 hover:to-red-300 text-red-700 dark:from-red-900/30 dark:to-red-800/30 dark:hover:from-red-900/50 dark:hover:to-red-800/50 dark:text-red-400'
                        : 'bg-gradient-to-r from-green-100 to-green-200 hover:from-green-200 hover:to-green-300 text-green-700 dark:from-green-900/30 dark:to-green-800/30 dark:hover:from-green-900/50 dark:hover:to-green-800/50 dark:text-green-400'
                    }`}
                  >
                    {team.status === 'active' ? '⏸️' : '▶️'}
                  </button>
                  
                  <button
                    onClick={() => handleDeleteTeam(team.id)}
                    disabled={isLoading}
                    className="px-3 py-2.5 bg-gradient-to-r from-red-100 to-red-200 hover:from-red-200 hover:to-red-300 text-red-700 dark:from-red-900/30 dark:to-red-800/30 dark:hover:from-red-900/50 dark:hover:to-red-800/50 dark:text-red-400 rounded-xl transition-all duration-300 transform hover:scale-105 text-xs shadow-sm"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
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

      {/* Team Members Modal */}
      {showMembers && selectedTeam && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                    <UserIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      สมาชิกทีม: {selectedTeam.name}
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {teamMembers.length} สมาชิก
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowMembers(false);
                    setTeamMembers([]);
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                >
                  <span className="sr-only">ปิด</span>
                  ✕
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {loadingMembers ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                  <span className="ml-2 text-gray-600 dark:text-gray-400">กำลังโหลดรายชื่อสมาชิก...</span>
                </div>
              ) : teamMembers.length === 0 ? (
                <div className="text-center py-12">
                  <UserIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    ยังไม่มีสมาชิกในทีม
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    เมื่อมีสมาชิกเข้าร่วมทีม รายชื่อจะแสดงที่นี่
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {teamMembers.map((member, index) => (
                    <div key={member.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border border-gray-200/50 dark:border-gray-600/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 min-w-0 flex-1">
                          <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full shrink-0">
                            <UserIcon className="h-4 w-4 text-white" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <h4 className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                                {member.user?.username || member.user?.displayName || 'ไม่ระบุชื่อ'}
                              </h4>
                              {member.role === 'owner' && (
                                <span className="px-2 py-0.5 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs font-medium rounded-full shrink-0">
                                  👑
                                </span>
                              )}
                              {member.role === 'admin' && (
                                <span className="px-2 py-0.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs font-medium rounded-full shrink-0">
                                  🛡️
                                </span>
                              )}
                              {member.role === 'member' && (
                                <span className="px-2 py-0.5 bg-gradient-to-r from-green-500 to-blue-500 text-white text-xs font-medium rounded-full shrink-0">
                                  👤
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-3 text-xs text-gray-600 dark:text-gray-400">
                              <span className="truncate">{member.user?.email || 'ไม่ระบุอีเมล'}</span>
                              <span>•</span>
                              <span className="flex items-center shrink-0">
                                <CalendarIcon className="h-3 w-3 mr-1" />
                                {formatDate(member.joinedAt)}
                              </span>
                            </div>
                            <div className="flex items-center space-x-3 text-xs mt-1">
                              <span className="text-gray-600 dark:text-gray-400">
                                บทบาทในทีม: {member.role === 'owner' ? 'เจ้าของทีม' : 
                                            member.role === 'admin' ? 'ผู้ดูแลทีม' : 'สมาชิกทั่วไป'}
                              </span>
                              {member.user?.lastLogin && (
                                <>
                                  <span>•</span>
                                  <span className="text-gray-600 dark:text-gray-400">
                                    เข้าใช้: {(() => {
                                      try {
                                        let lastLoginDate;
                                        if (typeof member.user.lastLogin.toDate === 'function') {
                                          lastLoginDate = member.user.lastLogin.toDate();
                                        } else if (member.user.lastLogin.seconds) {
                                          lastLoginDate = new Date(member.user.lastLogin.seconds * 1000);
                                        } else if (member.user.lastLogin instanceof Date) {
                                          lastLoginDate = member.user.lastLogin;
                                        } else {
                                          lastLoginDate = new Date(member.user.lastLogin);
                                        }
                                        return formatDate(lastLoginDate);
                                      } catch (error) {
                                        return 'ไม่ระบุ';
                                      }
                                    })()}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2 shrink-0">
                          <div className={`px-2 py-1 rounded-full text-xs font-medium border flex items-center space-x-1 ${
                            member.status === 'active' 
                              ? 'bg-green-100 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400'
                              : 'bg-gray-100 border-gray-200 text-gray-700 dark:bg-gray-700/30 dark:border-gray-600 dark:text-gray-400'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              member.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                            }`}></div>
                            <span>{member.status === 'active' ? 'ใช้งาน' : 'ปิด'}</span>
                          </div>
                          
                          {member.role !== 'owner' && (
                            <button
                              onClick={() => handleRemoveMember(member.id, member.user?.username || member.user?.displayName || 'สมาชิก')}
                              disabled={deletingMember === member.id}
                              className="p-2 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 rounded-lg transition-all duration-300 transform hover:scale-105 text-xs disabled:opacity-50"
                              title="ลบสมาชิกออกจากทีม"
                            >
                              {deletingMember === member.id ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600"></div>
                              ) : (
                                <TrashIcon className="h-3 w-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg transform transition-all duration-300 animate-in slide-in-from-bottom-4 scale-in-95 border border-white/20 dark:border-gray-700/50">
            {/* Header with gradient background */}
            <div className="relative bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500 rounded-t-3xl p-6 text-white overflow-hidden">
              {/* Decorative elements */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
              <div className="absolute -bottom-2 -left-2 w-16 h-16 bg-white/10 rounded-full blur-lg"></div>
              
              <div className="relative z-10 flex items-center space-x-3">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                  <UserGroupIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">เพิ่มสมาชิกใหม่</h3>
                  <p className="text-white/80 text-sm">เพิ่มสมาชิกเข้าทีม {selectedTeam?.name}</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="space-y-6">
                <div className="relative">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    <span className="flex items-center space-x-2">
                      <MagnifyingGlassIcon className="h-4 w-4 text-blue-500" />
                      <span>ค้นหาผู้ใช้หรือกรอกชื่อผู้ใช้</span>
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      className="block w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white pr-12 placeholder-gray-500 dark:placeholder-gray-400 transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-500"
                      placeholder="พิมพ์ชื่อผู้ใช้เพื่อค้นหาหรือเพิ่มเข้าทีม..."
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      {loadingUsers ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
                      ) : (
                        <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </div>
                  
                  {/* User Search Results */}
                  {showUserList && searchUsersResults.length > 0 && (
                    <div className="absolute z-20 mt-2 w-full bg-white dark:bg-gray-700 shadow-2xl max-h-64 rounded-2xl py-2 text-base ring-1 ring-black/5 dark:ring-white/10 overflow-auto focus:outline-none border border-gray-100 dark:border-gray-600">
                      <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-600">
                        ผู้ใช้ที่พบ ({searchUsersResults.length})
                      </div>
                      {searchUsersResults.map((user: any, index: number) => (
                        <div
                          key={user.id}
                          onClick={() => selectUser(user)}
                          className={`cursor-pointer select-none relative py-3 px-4 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 dark:hover:from-blue-900/20 dark:hover:to-purple-900/20 transition-all duration-200 ${
                            index !== searchUsersResults.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className="relative flex-shrink-0">
                              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-500 flex items-center justify-center shadow-lg">
                                <span className="text-sm font-semibold text-white">
                                  {getUserAvatarInitial(user)}
                                </span>
                              </div>
                              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white dark:border-gray-700 flex items-center justify-center">
                                <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {getUserDisplayName(user)}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {user.email}
                              </div>
                              <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-1">
                                คลิกเพื่อเลือก
                              </div>
                            </div>
                            <div className="flex-shrink-0">
                              <PlusIcon className="h-5 w-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* No Results Message */}
                  {showUserList && searchUsersResults.length === 0 && searchQuery.length >= 2 && !loadingUsers && (
                    <div className="absolute z-20 mt-2 w-full bg-white dark:bg-gray-700 shadow-2xl rounded-2xl py-6 text-center border border-gray-100 dark:border-gray-600">
                      <div className="flex flex-col items-center space-y-3">
                        <div className="w-12 h-12 bg-gray-100 dark:bg-gray-600 rounded-full flex items-center justify-center">
                          <MagnifyingGlassIcon className="h-6 w-6 text-gray-400" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">ไม่พบผู้ใช้</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">ลองค้นหาด้วยคำอื่น หรือกรอกอีเมลโดยตรง</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Info Card */}
                <div className="relative bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 overflow-hidden">
                  <div className="absolute -top-2 -right-2 w-16 h-16 bg-blue-500/10 rounded-full blur-2xl"></div>
                  <div className="relative flex items-start space-x-3">
                    <div className="flex-shrink-0 w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                      <span className="text-lg">ℹ️</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">
                        เกี่ยวกับการเชิญสมาชิก
                      </h4>
                      <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                        <div className="flex items-center space-x-2">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                          <span>สมาชิกจะมีบทบาทเป็น 'user' ในทีม</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                          <span>Admin สามารถแก้ไขบทบาทได้ภายหลัง</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => {
                    setShowInviteModal(false);
                    setSearchQuery('');
                    setInviteEmail('');
                    setSelectedUser(null);
                    setShowUserList(false);
                    setSearchUsersResults([]);
                  }}
                  className="px-6 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 border border-gray-200 dark:border-gray-500"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={addMemberDirectly}
                  disabled={!selectedUser && !inviteEmail?.trim()}
                  className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none flex items-center space-x-2"
                >
                  <UserPlusIcon className="h-4 w-4" />
                  <span>เพิ่มสมาชิก</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default AdminTeamsPage; 