'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useUserProfile } from '../../contexts/UserContext';
import { usePermission } from '../../hooks/usePermission';
import { useMultiTeam } from '../../hooks/useMultiTeam';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import toast from 'react-hot-toast';
import { 
  UserGroupIcon, 
  PlusIcon, 
  PencilIcon, 
  TrashIcon,
  XMarkIcon,
  UserPlusIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  ArrowRightIcon,
  UserIcon,
  EnvelopeIcon,
  CalendarIcon,
  CogIcon,
  EyeIcon,
  EyeSlashIcon,
  BuildingOfficeIcon,
  UsersIcon,
  ChartBarIcon,
  MagnifyingGlassIcon,
  ChatBubbleLeftEllipsisIcon,
  KeyIcon,
  ClipboardDocumentIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { 
  logTeamCreated,
  logTeamUpdated,
  logTeamDeleted,
  logTeamMemberAdded,
  logTeamMemberRemoved,
  logTeamMemberRoleChanged,
  logTeamInvitationCancelled
} from '../../utils/logger';
import { getUserDisplayName, getUserAvatarInitial } from '../../utils/userDisplay';
import type { TeamMember, Invitation } from '../../types/user';
import { ROLE_PERMISSIONS } from '../../types/user';
import { setDoc } from 'firebase/firestore';

// Cache system for users
interface UsersCacheData {
  users: any[];
  timestamp: number;
}

let usersCache: UsersCacheData | null = null;
const USERS_CACHE_DURATION = 300000; // 5 minutes

// Cache system for team data
interface TeamDataCache {
  [teamId: string]: {
    members: TeamMember[];
    invitations: Invitation[];
    timestamp: number;
  };
}

let teamDataCache: TeamDataCache = {};
const TEAM_DATA_CACHE_DURATION = 60000; // 1 minute

export default function TeamManagement() {
  const { userProfile, refreshUserProfile } = useUserProfile();
  const { canViewTeams, canManageTeams, isAdmin, isManager } = usePermission();
  const { teams, loading: teamsLoading, refreshTeams } = useMultiTeam('owned'); // แสดงเฉพาะทีมที่ตัวเองเป็นเจ้าของ
  
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersWithCurrentData, setMembersWithCurrentData] = useState<(TeamMember & { currentDisplayName?: string })[]>([]);
  
  // Invitation form
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  
  // User search with debouncing
  const [searchUsers, setSearchUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserList, setShowUserList] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  // Create team modal
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [newTeam, setNewTeam] = useState({
    name: '',
    description: ''
  });

  // API Key management
  const [showApiKey, setShowApiKey] = useState<{[teamId: string]: boolean}>({});
  const [resetApiKeyModal, setResetApiKeyModal] = useState<{
    show: boolean;
    teamId: string;
    teamName: string;
    newApiKey: string;
  }>({
    show: false,
    teamId: '',
    teamName: '',
    newApiKey: ''
  });

  // Generate random API key
  const generateApiKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) { // Generate 32 character API key
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Show reset API key modal
  const showResetApiKeyModal = (teamId: string, teamName: string) => {
    const newApiKey = generateApiKey();
    setResetApiKeyModal({
      show: true,
      teamId,
      teamName,
      newApiKey
    });
  };

  // Reset API key for team
  const confirmResetApiKey = async () => {
    try {
      const { teamId, newApiKey } = resetApiKeyModal;
      const teamRef = doc(db, 'teams', teamId);
      await updateDoc(teamRef, {
        apiKey: newApiKey,
        updatedAt: new Date().toISOString()
      });

      toast.success('รีเซ็ท API Key สำเร็จ');
      setResetApiKeyModal({ show: false, teamId: '', teamName: '', newApiKey: '' });
      refreshTeams(); // Refresh team data
    } catch (error) {
      console.error('Error resetting API key:', error);
      toast.error('เกิดข้อผิดพลาดในการรีเซ็ท API Key');
    }
  };

  // Toggle API key visibility
  const toggleApiKeyVisibility = (teamId: string) => {
    setShowApiKey(prev => ({
      ...prev,
      [teamId]: !prev[teamId]
    }));
  };

  // Generate API key for existing team without one
  const generateApiKeyForTeam = async (teamId: string, teamName: string) => {
    try {
      const newApiKey = generateApiKey();
      const teamRef = doc(db, 'teams', teamId);
      await updateDoc(teamRef, {
        apiKey: newApiKey,
        updatedAt: new Date().toISOString()
      });

      toast.success('สร้าง API Key สำเร็จ');
      refreshTeams(); // Refresh team data
    } catch (error) {
      console.error('Error generating API key:', error);
      toast.error('เกิดข้อผิดพลาดในการสร้าง API Key');
    }
  };

  // Copy API key to clipboard
  const copyApiKey = async (apiKey: string) => {
    try {
      await navigator.clipboard.writeText(apiKey);
      toast.success('คัดลอก API Key สำเร็จ');
    } catch (error) {
      toast.error('ไม่สามารถคัดลอกได้');
    }
  };

  // Remove member modal
  const [removeMemberModal, setRemoveMemberModal] = useState<{show: boolean, memberId: string, memberEmail: string, memberName: string}>({
    show: false,
    memberId: '',
    memberEmail: '',
    memberName: ''
  });

  // Delete team modal
  const [deleteTeamModal, setDeleteTeamModal] = useState<{show: boolean, teamId: string, teamName: string}>({
    show: false,
    teamId: '',
    teamName: ''
  });

  // Check permissions - redirect if no access
  useEffect(() => {
    if (userProfile && !canViewTeams()) {
      toast.error('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
      window.location.href = '/dashboard';
      return;
    }
  }, [userProfile, canViewTeams]);

  // Auto-select team for managers (their own team only)
  useEffect(() => {
    if (userProfile && isManager() && teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(teams[0].id);
    }
  }, [userProfile, teams, isManager, selectedTeamId]);

  // Sort members by role priority and join date
  const sortMembersByRoleAndDate = useCallback((members: any[]) => {
    const roleOrder = { 'admin': 1, 'manager': 2, 'user': 3 };
    
    return members.sort((a, b) => {
      // First sort by role priority (lower number = higher priority)
      const roleA = roleOrder[a.role as keyof typeof roleOrder] || 4;
      const roleB = roleOrder[b.role as keyof typeof roleOrder] || 4;
      
      if (roleA !== roleB) {
        return roleA - roleB;
      }
      
      // If roles are the same, sort by join date (earlier date first)
      const dateA = new Date(a.joinedAt || a.createdAt || '');
      const dateB = new Date(b.joinedAt || b.createdAt || '');
      
      return dateA.getTime() - dateB.getTime();
    });
  }, []);

  // Format join date with seconds
  const formatJoinDate = useCallback((timestamp: string) => {
    if (!timestamp) return 'ไม่ระบุ';
    
    const date = new Date(timestamp);
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }, []);

  // Load current user data for team members
  const loadMembersWithCurrentData = useCallback(async (members: TeamMember[]) => {

    
    if (members.length === 0) {
      setMembersWithCurrentData([]);
      return;
    }

    try {
      // Get user IDs and emails from members
      const userIds = members.filter(member => member.userId).map(member => member.userId);
      const emails = members.map(member => member.email).filter(Boolean);


      // Fetch current user data from users collection
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const currentUsersDataById = new Map();
      const currentUsersDataByEmail = new Map();
      
      usersSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        const userId = doc.id;
        
        // Map by userId if it's in our list
        if (userIds.includes(userId)) {
          currentUsersDataById.set(userId, userData);
        }
        
        // Map by email if it's in our list (case-insensitive)
        if (userData.email && emails.some(email => email.toLowerCase() === userData.email.toLowerCase())) {
          currentUsersDataByEmail.set(userData.email.toLowerCase(), userData);
        }
      });



      // Merge current data with team member data
      const membersWithCurrent = members.map(member => {
        let currentUserData = null;
        let matchMethod = '';
        
        // Try to find user data by userId first
        if (member.userId && currentUsersDataById.has(member.userId)) {
          currentUserData = currentUsersDataById.get(member.userId);
          matchMethod = 'userId';
        }
        // If not found by userId, try by email (case-insensitive)
        else if (member.email && currentUsersDataByEmail.has(member.email.toLowerCase())) {
          currentUserData = currentUsersDataByEmail.get(member.email.toLowerCase());
          matchMethod = 'email';
        }
        
        if (currentUserData) {
          const currentDisplayName = getUserDisplayName(currentUserData);
          return {
            ...member,
            currentDisplayName: currentDisplayName || member.displayName
          };
        }
        return {
          ...member,
          currentDisplayName: member.displayName
        };
      });

      // Sort members by role priority and join date
      const sortedMembers = sortMembersByRoleAndDate(membersWithCurrent);
      setMembersWithCurrentData(sortedMembers);
    } catch (error) {
              // Error loading current member data
      // Fallback to stored data
      const fallbackData = members.map(member => ({
        ...member,
        currentDisplayName: member.displayName
      }));
      const sortedFallbackData = sortMembersByRoleAndDate(fallbackData);
      setMembersWithCurrentData(sortedFallbackData);
    }
  }, []);

  // Optimized team data loading with caching
  const loadTeamDataOptimized = useCallback(async (teamId: string, force = false) => {
    if (!userProfile || !teamId) {
      return;
    }
    
    // Check cache first
    if (!force && teamDataCache[teamId] && Date.now() - teamDataCache[teamId].timestamp < TEAM_DATA_CACHE_DURATION) {
      setTeamMembers(teamDataCache[teamId].members);
      setInvitations(teamDataCache[teamId].invitations);
      // Load current user data even from cache
      await loadMembersWithCurrentData(teamDataCache[teamId].members);
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      
      // Batch queries - Execute in parallel
      const [membersSnapshot, invitationsSnapshot] = await Promise.all([
        getDocs(query(
          collection(db, 'teamMembers'),
          where('teamId', '==', teamId)
        )),
        getDocs(query(
          collection(db, 'invitations'),
          where('teamId', '==', teamId),
          where('status', '==', 'pending')
        ))
      ]);
      
      const membersData = membersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TeamMember[];

      const invitationsData = invitationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Invitation[];

      setTeamMembers(membersData);
      setInvitations(invitationsData);
      
      // Load current user data for members
      await loadMembersWithCurrentData(membersData);
      
      // Update cache
      teamDataCache[teamId] = {
        members: membersData,
        invitations: invitationsData,
        timestamp: Date.now()
      };
      
    } catch (error) {
      toast.error('ไม่สามารถโหลดข้อมูลทีมได้');
    } finally {
      setLoading(false);
    }
  }, [userProfile]);

  useEffect(() => {
    if (selectedTeamId) {
      // ล้างข้อมูลเก่าก่อนโหลดข้อมูลใหม่
      setTeamMembers([]);
      setInvitations([]);
      setMembersWithCurrentData([]); // ล้างข้อมูลปัจจุบันด้วย
      setLoading(true);
      
      loadTeamDataOptimized(selectedTeamId);
    } else {
      // ถ้าไม่มีทีมที่เลือก ให้ล้างข้อมูล
      setTeamMembers([]);
      setInvitations([]);
      setMembersWithCurrentData([]);
    }
  }, [selectedTeamId, loadTeamDataOptimized]);

  // Optimized user search with caching and debouncing
  const searchUsersOptimized = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchUsers([]);
      setShowUserList(false);
      return;
    }

    try {
      setLoadingUsers(true);
      
      // Check cache first
      let allUsers: any[];
      if (usersCache && Date.now() - usersCache.timestamp < USERS_CACHE_DURATION) {
        allUsers = usersCache.users;
      } else {
        // Load all users and cache them
        const usersSnapshot = await getDocs(collection(db, 'users'));
        allUsers = usersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Update cache
        usersCache = {
          users: allUsers,
          timestamp: Date.now()
        };
      }

      // Filter users based on search query
      const searchLower = query.toLowerCase();
      const filteredUsers = allUsers.filter((user: any) => {
        const matches = (
          user.displayName?.toLowerCase().includes(searchLower) ||
          user.email?.toLowerCase().includes(searchLower) ||
          user.username?.toLowerCase().includes(searchLower)
        );
        return matches;
      });

      // Exclude users who are already team members or have pending invitations
      const availableUsers = filteredUsers.filter((user: any) => {
        const isAlreadyMember = teamMembers.some(member => member.email === user.email);
        const hasPendingInvite = invitations.some(invite => invite.email === user.email);
        const isCurrentUser = user.email === userProfile?.email;
        
        return !isAlreadyMember && !hasPendingInvite && !isCurrentUser;
      });

      setSearchUsers(availableUsers.slice(0, 10)); // Limit to 10 results
      setShowUserList(availableUsers.length > 0);
    } catch (error) {
      // Error searching users
      toast.error('ไม่สามารถค้นหาผู้ใช้ได้');
    } finally {
      setLoadingUsers(false);
    }
  }, [teamMembers, invitations, userProfile?.email]);

  // Debounced search function
  const debouncedSearch = useCallback((query: string) => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    const timeout = setTimeout(() => {
      searchUsersOptimized(query);
    }, 300); // 300ms debounce
    
    setSearchTimeout(timeout);
  }, [searchUsersOptimized, searchTimeout]);

  // Select user from search results
  const selectUser = (user: any) => {
    // บันทึกข้อมูลผู้ใช้ที่เลือก
    setSelectedUser(user);
    setInviteEmail(user.email); // ยังคงเก็บ email สำหรับการตรวจสอบ
    
    // ใช้ utility function เพื่อได้ชื่อแสดงผลที่สม่ำเสมอ
    const displayName = getUserDisplayName(user);
    
    setSearchQuery(displayName);
    setShowUserList(false);
    setSearchUsers([]);
  };

  // Handle search input change with debouncing
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    
    if (value.trim().length >= 2) {
      debouncedSearch(value);
    } else {
      setSearchUsers([]);
      setShowUserList(false);
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    }
    
    // ล้างข้อมูลผู้ใช้ที่เลือกเมื่อเปลี่ยนการค้นหา
    if (selectedUser && value !== getUserDisplayName(selectedUser)) {
      setSelectedUser(null);
      setInviteEmail('');
    }
  };

  // Clear cache when component unmounts
  useEffect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [searchTimeout]);

  // Force refresh team data
  const refreshTeamData = useCallback(() => {
    if (selectedTeamId) {
      // Clear cache for selected team
      delete teamDataCache[selectedTeamId];
      // Clear users cache to get fresh data
      usersCache = null;
      // Force reload team members
      loadTeamDataOptimized(selectedTeamId, true);
    }
    // Refresh teams overview
    refreshTeams();
  }, [selectedTeamId, loadTeamDataOptimized, refreshTeams]);

  // Force refresh current display names only
  const refreshCurrentDisplayNames = useCallback(async () => {
    if (teamMembers.length > 0) {
      // Clear users cache
      usersCache = null;
      // Reload current data
      await loadMembersWithCurrentData(teamMembers);
      toast.success('รีเฟรชชื่อผู้ใช้เรียบร้อย');
    }
  }, [teamMembers, loadMembersWithCurrentData]);

  // Add member directly to team (no invitation needed)
  const addMemberDirectly = async () => {
    if (!userProfile || !selectedTeamId) {
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

      // สร้างข้อมูลสมาชิกใหม่
      // ผู้ใช้ที่ถูกเชิญเข้าทีมไม่แก้ไข Role เป็น 'user' เสมอ
      const memberRole: 'admin' | 'manager' | 'user' = 'user';
      
      const memberData: Omit<TeamMember, 'id'> = {
        email: targetEmail,
        displayName: targetDisplayName,
        role: memberRole,
        permissions: ROLE_PERMISSIONS[memberRole].permissions.map(p => ({
          resource: p.resource,
          actions: [...p.actions]
        })),
        invitedAt: new Date().toISOString(),
        acceptedAt: new Date().toISOString(),
        joinedAt: new Date().toISOString(),
        invitedBy: userProfile.uid,
        status: 'active',
        teamId: selectedTeamId,
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
      
      // Clear cache และรีเฟรชข้อมูล
      delete teamDataCache[selectedTeamId];
      
      // อัพเดท local state
      const newMember = { id: docRef.id, ...memberData };
      const updatedMembers = [...teamMembers, newMember];
      setTeamMembers(updatedMembers);
      
      // Load current data for updated members
      try {
        await loadMembersWithCurrentData(updatedMembers);
      } catch (error) {
        console.warn('Failed to load updated member data:', error);
      }
      
      // Log team member addition (ไม่ต้องรอผลลัพธ์)
      if (userProfile && selectedTeamId) {
        const selectedTeam = teams.find(t => t.id === selectedTeamId);
        if (selectedTeam) {
          // ทำแบบ fire-and-forget ไม่ block การทำงาน
          logTeamMemberAdded(
            userProfile.uid,
            userProfile.email,
            userProfile.displayName,
            targetEmail,
            targetDisplayName,
            selectedTeam.name,
            memberRole
          ).catch(error => {
            console.warn('Failed to log team member addition:', error);
          });
        }
      }

      // Refresh teams overview to update member count
      refreshTeams();

      // อัพเดท users collection ถ้าเป็นผู้ใช้ที่มีในระบบ (แบบ optional)
      if (targetUserId) {
        try {
          await setDoc(doc(db, 'users', targetUserId), {
            teamId: selectedTeamId,
            lastLogin: new Date()
          }, { merge: true });
          
          // ถ้าเป็นผู้ใช้ปัจจุบันที่ถูกเพิ่มเข้าทีม ให้ refresh profile
          if (targetUserId === userProfile.uid) {
            try {
              await refreshUserProfile();
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
          where('teamId', '==', selectedTeamId),
          where('status', '==', 'active')
        );
        const currentMembersSnapshot = await getDocs(currentMembersQuery);
        const actualMemberCount = currentMembersSnapshot.docs.length;
        
        const teamRef = doc(db, 'teams', selectedTeamId);
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
      setSearchUsers([]);
      setShowInviteModal(false);
      
      toast.success(`เพิ่ม ${targetDisplayName} เข้าทีมเรียบร้อย`);
      
      // Force refresh to ensure data is up-to-date
      setTimeout(() => refreshTeamData(), 500);
      
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการเพิ่มสมาชิก กรุณาลองใหม่อีกครั้ง');
    }
  };

  // Show remove member modal
  const showRemoveMemberModal = (memberId: string, memberEmail: string, memberName: string) => {
    setRemoveMemberModal({
      show: true,
      memberId,
      memberEmail,
      memberName
    });
  };

  // Hide remove member modal
  const hideRemoveMemberModal = () => {
    setRemoveMemberModal({
      show: false,
      memberId: '',
      memberEmail: '',
      memberName: ''
    });
  };

  // Remove team member
  const removeMember = async () => {
    if (!userProfile || !removeMemberModal.memberId) return;

    try {
      // ค้นหาข้อมูลสมาชิกที่จะลบ
      const memberToRemove = teamMembers.find(m => m.id === removeMemberModal.memberId);
      if (!memberToRemove) {
        toast.error('ไม่พบข้อมูลสมาชิก');
        return;
      }

      // ลบสมาชิกออกจากทีมนี้
      const memberRef = doc(db, 'teamMembers', removeMemberModal.memberId);
      await deleteDoc(memberRef);

      // ตรวจสอบว่าสมาชิกยังอยู่ในทีมอื่นหรือไม่
      const remainingMembershipsQuery = query(
        collection(db, 'teamMembers'),
        where('email', '==', memberToRemove.email),
        where('status', '==', 'active')
      );
      
      const remainingMembershipsSnapshot = await getDocs(remainingMembershipsQuery);
      const hasOtherTeams = !remainingMembershipsSnapshot.empty;

      // ถ้าไม่มีทีมอื่นแล้ว ให้อัปเดต user profile (ไม่แก้ไข Role)
      if (!hasOtherTeams && memberToRemove.userId) {
        try {
          const userRef = doc(db, 'users', memberToRemove.userId);
          await updateDoc(userRef, {
            teamId: null
          });
          

        } catch (updateError) {

          // ไม่ต้อง throw error เพราะการลบสมาชิกสำเร็จแล้ว
        }
      }

      // Clear cache และอัปเดต local state
      if (selectedTeamId) {
        delete teamDataCache[selectedTeamId];
      }
      const updatedMembers = teamMembers.filter(member => member.id !== removeMemberModal.memberId);
      setTeamMembers(updatedMembers);
      
      // Load current data for updated members
      await loadMembersWithCurrentData(updatedMembers);
      
      // อัพเดทจำนวนสมาชิกในทีม (ใช้ข้อมูลล่าสุดจาก Firestore)
      if (selectedTeamId) {
        const currentMembersQuery = query(
          collection(db, 'teamMembers'),
          where('teamId', '==', selectedTeamId),
          where('status', '==', 'active')
        );
        const currentMembersSnapshot = await getDocs(currentMembersQuery);
        const actualMemberCount = currentMembersSnapshot.docs.length;
        
        const teamRef = doc(db, 'teams', selectedTeamId);
        await updateDoc(teamRef, {
          memberCount: actualMemberCount
        });
      }
      
      // Log team member removal
      if (userProfile && selectedTeamId) {
        const selectedTeam = teams.find(t => t.id === selectedTeamId);
        if (selectedTeam) {
          await logTeamMemberRemoved(
            userProfile.uid,
            userProfile.email,
            userProfile.displayName,
            memberToRemove.email,
            memberToRemove.displayName,
            selectedTeam.name
          );
        }
      }

      // Refresh teams overview to update member count
      refreshTeams();
      
      if (hasOtherTeams) {
        toast.success(`ลบ ${removeMemberModal.memberName} ออกจากทีมนี้เรียบร้อย (ยังคงเป็นสมาชิกทีมอื่น)`);
      } else {
        toast.success(`ลบ ${removeMemberModal.memberName} ออกจากทีมเรียบร้อย`);
      }
      
      hideRemoveMemberModal();
      
    } catch (error) {
      // Error removing member
      toast.error('ไม่สามารถลบสมาชิกได้');
    }
  };

  // Cancel invitation
  const cancelInvitation = async (invitationId: string, email: string) => {
    if (!userProfile) return;

    try {
      const inviteRef = doc(db, 'invitations', invitationId);
      await deleteDoc(inviteRef);

      // Log invitation cancellation
      if (userProfile && selectedTeamId) {
        const selectedTeam = teams.find(t => t.id === selectedTeamId);
        if (selectedTeam) {
          await logTeamInvitationCancelled(
            userProfile.uid,
            userProfile.email,
            userProfile.displayName,
            email,
            selectedTeam.name
          );
        }
      }

      // Clear cache และอัปเดต local state
      if (selectedTeamId) {
        delete teamDataCache[selectedTeamId];
      }
      setInvitations(invitations.filter(invite => invite.id !== invitationId));
      toast.success(`ยกเลิกคำเชิญสำหรับ ${email} เรียบร้อย`);
      
    } catch (error) {
      // Error canceling invitation
      toast.error('ไม่สามารถยกเลิกคำเชิญได้');
    }
  };

  // Create new team
  const createTeam = async () => {
    if (!newTeam.name.trim()) {
      toast.error('กรุณากรอกชื่อทีม');
      return;
    }

    if (!userProfile?.uid) {
      toast.error('ไม่พบข้อมูลผู้ใช้');
      return;
    }

    try {
      const teamData = {
        name: newTeam.name.trim(),
        description: newTeam.description.trim(),
        ownerId: userProfile.uid,
        ownerName: userProfile.displayName || userProfile.email || 'Unknown',
        ownerEmail: userProfile.email || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        memberCount: 1,
        totalWebsites: 0,
        isActive: true,
        apiKey: generateApiKey()
      };

      const teamRef = await addDoc(collection(db, 'teams'), teamData);
      
      // Add owner as first member
      await addDoc(collection(db, 'teamMembers'), {
        teamId: teamRef.id,
        userId: userProfile.uid,
        email: userProfile.email || '',
        role: 'user', // Always set as 'user' for team membership
        status: 'active',
        joinedAt: new Date().toISOString(),
        invitedBy: userProfile.uid,
        invitedAt: new Date().toISOString()
      });

      // Log team creation
        await logTeamCreated(
          userProfile.uid,
        userProfile.email || '',
        userProfile.displayName || userProfile.email || 'Unknown',
          newTeam.name.trim(),
          newTeam.description.trim()
        );

      toast.success('สร้างทีมสำเร็จ');
      setShowCreateTeamModal(false);
      setNewTeam({ name: '', description: '' });
      
      // Refresh teams and select new team
      await refreshTeams();
      setSelectedTeamId(teamRef.id);
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการสร้างทีม กรุณาลองใหม่อีกครั้ง');
    }
  };

  // Show delete team modal
  const showDeleteTeamModal = (teamId: string, teamName: string) => {
    setDeleteTeamModal({
      show: true,
      teamId,
      teamName
    });
  };

  // Hide delete team modal
  const hideDeleteTeamModal = () => {
    setDeleteTeamModal({
      show: false,
      teamId: '',
      teamName: ''
    });
  };

  // Delete team function
  const deleteTeam = async () => {
    if (!deleteTeamModal.teamId || !userProfile?.uid) {
      toast.error('ข้อมูลไม่ครบถ้วน');
      return;
    }

    try {
      // Check if user is the owner of the team
      const selectedTeam = teams.find(t => t.id === deleteTeamModal.teamId);
      if (!selectedTeam || selectedTeam.ownerId !== userProfile.uid) {
        toast.error('คุณไม่มีสิทธิ์ลบทีมนี้');
        return;
      }

      // Delete all team members
      const membersQuery = query(
        collection(db, 'teamMembers'),
        where('teamId', '==', deleteTeamModal.teamId)
      );
      const membersSnapshot = await getDocs(membersQuery);
      
      for (const memberDoc of membersSnapshot.docs) {
        await deleteDoc(doc(db, 'teamMembers', memberDoc.id));
      }

      // Delete all invitations
      const invitationsQuery = query(
        collection(db, 'invitations'),
        where('teamId', '==', deleteTeamModal.teamId)
      );
      const invitationsSnapshot = await getDocs(invitationsQuery);
      
      for (const invitationDoc of invitationsSnapshot.docs) {
        await deleteDoc(doc(db, 'invitations', invitationDoc.id));
      }

      // Delete all websites in this team
      const websitesQuery = query(
        collection(db, 'websites'),
        where('teamId', '==', deleteTeamModal.teamId)
      );
      const websitesSnapshot = await getDocs(websitesQuery);
      
      for (const websiteDoc of websitesSnapshot.docs) {
        await deleteDoc(doc(db, 'websites', websiteDoc.id));
      }

      // Delete all topup history related to this team
      const topupHistoryQuery = query(
        collection(db, 'topupHistory'),
        where('teamId', '==', deleteTeamModal.teamId)
      );
      const topupHistorySnapshot = await getDocs(topupHistoryQuery);
      
      for (const topupDoc of topupHistorySnapshot.docs) {
        await deleteDoc(doc(db, 'topupHistory', topupDoc.id));
      }

      // Delete all withdraw history related to this team
      const withdrawHistoryQuery = query(
        collection(db, 'withdrawHistory'),
        where('teamId', '==', deleteTeamModal.teamId)
      );
      const withdrawHistorySnapshot = await getDocs(withdrawHistoryQuery);
      
      for (const withdrawDoc of withdrawHistorySnapshot.docs) {
        await deleteDoc(doc(db, 'withdrawHistory', withdrawDoc.id));
      }

      // Log team deletion
      if (userProfile) {
        await logTeamDeleted(
          userProfile.uid,
          userProfile.email || '',
          userProfile.displayName || userProfile.email || 'Unknown',
          deleteTeamModal.teamName,
          membersSnapshot.docs.length,
          websitesSnapshot.docs.length,
          0 // totalBalance - we don't have this info here
        );
      }

      // Delete the team
      await deleteDoc(doc(db, 'teams', deleteTeamModal.teamId));

      toast.success(`ลบทีม "${deleteTeamModal.teamName}" และข้อมูลที่เกี่ยวข้องทั้งหมดสำเร็จ`);
      hideDeleteTeamModal();
      
      // Refresh teams and clear selection if deleted team was selected
      await refreshTeams();
      if (selectedTeamId === deleteTeamModal.teamId) {
        setSelectedTeamId(null);
      }
    } catch (error) {
      console.error('Error deleting team:', error);
      toast.error('เกิดข้อผิดพลาดในการลบทีม กรุณาลองใหม่อีกครั้ง');
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800';
      case 'manager': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'user': return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800';
      default: return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-600';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800';
      case 'pending': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800';
      case 'inactive': return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-600';
      default: return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-600';
    }
  };

  if (!canViewTeams()) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <XCircleIcon className="mx-auto h-12 w-12 text-red-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">ไม่มีสิทธิ์เข้าถึง</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">คุณไม่มีสิทธิ์เข้าถึงหน้าจัดการทีม</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="จัดการทีม" 
      subtitle={userProfile?.role === 'admin' ? 'ดูและจัดการทีมทั้งหมด' : 'จัดการทีมของคุณ'}
    >
      <div className="space-y-6">

        {/* Header with Create Team Button */}
        {(isAdmin() || isManager()) && (
          <div className="flex justify-between items-center">
            <div className="flex-1"></div>
            <button
              onClick={() => setShowCreateTeamModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
            >
              <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
              สร้างทีมใหม่
            </button>
          </div>
        )}

        {/* Multi-team overview for Admin and Manager */}
        {(userProfile?.role === 'admin' || userProfile?.role === 'manager') && (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              {userProfile?.role === 'admin' ? 'ภาพรวมทีมทั้งหมด' : 'ทีมของคุณ'}
            </h2>
            {teamsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse">
                    <div className="bg-gray-200 dark:bg-gray-600 rounded-lg h-32"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams.map((team) => (
                  <div
                    key={team.id}
                    className={`relative border rounded-xl p-6 cursor-pointer transition-all duration-300 transform hover:scale-[1.02] hover:shadow-xl ${
                      selectedTeamId === team.id 
                        ? 'border-blue-500 bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-blue-900/30 dark:via-gray-800 dark:to-blue-900/20 dark:border-blue-400 shadow-xl ring-2 ring-blue-200 dark:ring-blue-800' 
                        : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gradient-to-br hover:from-gray-50 hover:to-white dark:hover:from-gray-700 dark:hover:to-gray-800 shadow-lg'
                    }`}
                    onClick={() => setSelectedTeamId(team.id)}
                  >
                    {/* Selected indicator overlay */}
                    {selectedTeamId === team.id && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center ring-4 ring-white dark:ring-gray-800">
                        <EyeIcon className="h-3 w-3 text-white" />
                      </div>
                    )}

                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center flex-1" onClick={() => setSelectedTeamId(team.id)}>
                        <div className="flex-shrink-0 p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                          <BuildingOfficeIcon className="h-6 w-6 text-white" />
                        </div>
                        <div className="ml-4 flex-1">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{team.name}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{team.description || 'ไม่มีคำอธิบาย'}</p>
                        </div>
                      </div>
                      
                      {/* Delete team button - only for team owner */}
                      {team.ownerId === userProfile?.uid && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            showDeleteTeamModal(team.id, team.name);
                          }}
                          className="ml-2 p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all duration-300 transform hover:scale-110"
                          title="ลบทีม"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    
                    {/* Team Info & API Key */}
                    <div className="mb-3 space-y-2">
                      {/* Owner info & Statistics */}
                      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center">
                          <UsersIcon className="h-4 w-4 text-purple-500 mr-2" />
                          <span>เจ้าของ: {team.ownerName || 'ไม่ระบุ'}</span>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center">
                            <UsersIcon className="h-4 w-4 text-green-500 mr-1" />
                            <span>{team.memberCount} สมาชิก</span>
                          </div>
                          <div className="flex items-center">
                            <ChartBarIcon className="h-4 w-4 text-blue-500 mr-1" />
                            <span>{team.totalWebsites} เว็บไซต์</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* API Key section - single line */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                          <KeyIcon className="h-4 w-4 text-orange-500 mr-2" />
                          <span>API Key:</span>
                          {team.apiKey ? (
                            <code className="ml-2 text-xs bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded font-mono text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                              {showApiKey[team.id] 
                                ? team.apiKey
                                : '•'.repeat(Math.min(team.apiKey.length, 32))
                              }
                            </code>
                          ) : (
                            <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">ยังไม่มี</span>
                          )}
                        </div>
                        <div className="flex items-center space-x-1">
                          {team.apiKey ? (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleApiKeyVisibility(team.id);
                                }}
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                title={showApiKey[team.id] ? 'ซ่อน API Key' : 'แสดง API Key'}
                              >
                                {showApiKey[team.id] ? (
                                  <EyeSlashIcon className="h-3.5 w-3.5 text-gray-500" />
                                ) : (
                                  <EyeIcon className="h-3.5 w-3.5 text-gray-500" />
                                )}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (team.apiKey) copyApiKey(team.apiKey);
                                }}
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                title="คัดลอก API Key"
                              >
                                <ClipboardDocumentIcon className="h-3.5 w-3.5 text-gray-500" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  showResetApiKeyModal(team.id, team.name);
                                }}
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                title="รีเซ็ท API Key"
                              >
                                <ArrowPathIcon className="h-3.5 w-3.5 text-gray-500" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                generateApiKeyForTeam(team.id, team.name);
                              }}
                              className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 rounded transition-colors"
                            >
                              สร้าง
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Team Details - Show only if team is selected */}
        {selectedTeamId && (
          <>
            {/* Team Members */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                      สมาชิกทีม: {teams.find(t => t.id === selectedTeamId)?.name || 'ไม่พบชื่อทีม'}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      จำนวนสมาชิก: {membersWithCurrentData.length} คน
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={refreshTeamData}
                      disabled={loading}
                      className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md shadow-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50"
                    >
                      <svg className={`-ml-1 mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      รีเฟรชทั้งหมด
                    </button>
                    <button
                      onClick={refreshCurrentDisplayNames}
                      disabled={loading || teamMembers.length === 0}
                      className="inline-flex items-center px-3 py-2 border border-green-300 dark:border-green-600 text-sm font-medium rounded-md shadow-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors disabled:opacity-50"
                    >
                      <UsersIcon className="-ml-1 mr-2 h-4 w-4" />
                      รีเฟรชชื่อ
                    </button>
                    {canManageTeams() && (
                      <button
                        onClick={() => setShowInviteModal(true)}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                      >
                        <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                        เพิ่มสมาชิกใหม่
                      </button>
                    )}
                  </div>
                </div>

                {loading ? (
                  <div className="animate-pulse space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-gray-200 dark:bg-gray-600 rounded-full"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-1/4"></div>
                          <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-1/2"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 dark:ring-gray-600 md:rounded-lg">
                    <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-600">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            สมาชิก
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            บทบาท
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            สถานะ
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            เข้าร่วมเมื่อ
                          </th>
                          {canManageTeams() && (
                            <th className="relative px-6 py-3">
                              <span className="sr-only">การจัดการ</span>
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                        {membersWithCurrentData.length === 0 ? (
                          <tr>
                            <td colSpan={canManageTeams() ? 5 : 4} className="px-6 py-8 text-center">
                              <div className="flex flex-col items-center">
                                <UsersIcon className="h-12 w-12 text-gray-400 dark:text-gray-500 mb-3" />
                                <p className="text-gray-500 dark:text-gray-400 text-sm">
                                  ยังไม่มีสมาชิกในทีมนี้
                                </p>
                                {canManageTeams() && (
                                  <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
                                    คลิก &quot;เพิ่มสมาชิกใหม่&quot; เพื่อเริ่มต้น
                                  </p>
                                )}
                              </div>
                            </td>
                          </tr>
                        ) : (
                          membersWithCurrentData.map((member) => (
                            <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-10 w-10">
                                    <div className="h-10 w-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        {(member.currentDisplayName || getUserDisplayName(member)).charAt(0).toUpperCase()}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="ml-4">
                                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                                      {member.currentDisplayName || getUserDisplayName(member)}
                                    </div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400">
                                      {member.email}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {(() => {
                                  const selectedTeam = teams.find(t => t.id === selectedTeamId);
                                  const isOwner = selectedTeam && member.userId === selectedTeam.ownerId;
                                  
                                  if (isOwner) {
                                    return (
                                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full border bg-gradient-to-r from-yellow-100 to-amber-100 text-amber-800 border-amber-300 dark:from-yellow-900/30 dark:to-amber-900/30 dark:text-amber-200 dark:border-amber-700">
                                        เจ้าของ
                                      </span>
                                    );
                                  }
                                  
                                  return (
                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getRoleColor(member.role)}`}>
                                      {ROLE_PERMISSIONS[member.role]?.label || member.role}
                                    </span>
                                  );
                                })()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColor(member.status)}`}>
                                  {member.status === 'active' ? 'ใช้งาน' : member.status === 'pending' ? 'รอดำเนินการ' : 'ไม่ใช้งาน'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {formatJoinDate(member.joinedAt || '')}
                              </td>
                              {canManageTeams() && (
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                  <div className="flex space-x-2">
                                    {/* ทั้ง Admin และ Manager ลบสมาชิกได้ แต่ไม่สามารถลบเจ้าของทีมได้ */}
                                    {(() => {
                                      const selectedTeam = teams.find(t => t.id === selectedTeamId);
                                      const isOwner = selectedTeam && member.userId === selectedTeam.ownerId;
                                      return !isOwner && (member.role !== 'manager' || member.invitedBy !== userProfile?.uid);
                                    })() && (
                                      <button
                                        onClick={() => showRemoveMemberModal(member.id, member.email, member.currentDisplayName || getUserDisplayName(member))}
                                        className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        title="ลบสมาชิก"
                                      >
                                        <TrashIcon className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Pending Invitations */}
            {invitations.length > 0 && (
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">
                    คำเชิญที่รอดำเนินการ
                  </h3>
                  <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 dark:ring-gray-600 md:rounded-lg">
                    <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-600">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            อีเมล
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            บทบาท
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            ส่งเมื่อ
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            หมดอายุ
                          </th>
                          {canManageTeams() && (
                            <th className="relative px-6 py-3">
                              <span className="sr-only">การจัดการ</span>
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                        {invitations.map((invitation) => (
                          <tr key={invitation.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <EnvelopeIcon className="h-5 w-5 text-gray-400 dark:text-gray-500 mr-2" />
                                <span className="text-sm text-gray-900 dark:text-white">{invitation.email}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getRoleColor(invitation.role)}`}>
                                {ROLE_PERMISSIONS[invitation.role]?.label || invitation.role}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                              {new Date(invitation.createdAt).toLocaleDateString('th-TH')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                              {new Date(invitation.expiresAt).toLocaleDateString('th-TH')}
                            </td>
                            {canManageTeams() && (
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <button
                                  onClick={() => cancelInvitation(invitation.id, invitation.email)}
                                  className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                >
                                  <XCircleIcon className="h-4 w-4" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* No team selected message for multi-team users */}
        {(userProfile?.role === 'admin' || userProfile?.role === 'manager') && !selectedTeamId && (
          <div className="text-center py-12">
            <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">เลือกทีมที่ต้องการจัดการ</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">คลิกที่การ์ดทีมด้านบนเพื่อดูรายละเอียดและจัดการสมาชิก</p>
          </div>
        )}
      </div>

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
                  <p className="text-white/80 text-sm">เพิ่มสมาชิกเข้าทีมของคุณ</p>
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
                  {showUserList && searchUsers.length > 0 && (
                    <div className="absolute z-20 mt-2 w-full bg-white dark:bg-gray-700 shadow-2xl max-h-64 rounded-2xl py-2 text-base ring-1 ring-black/5 dark:ring-white/10 overflow-auto focus:outline-none border border-gray-100 dark:border-gray-600">
                      <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-600">
                        ผู้ใช้ที่พบ ({searchUsers.length})
                      </div>
                      {searchUsers.map((user: any, index: number) => (
                        <div
                          key={user.id}
                          onClick={() => selectUser(user)}
                          className={`cursor-pointer select-none relative py-3 px-4 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 dark:hover:from-blue-900/20 dark:hover:to-purple-900/20 transition-all duration-200 ${
                            index !== searchUsers.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''
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
                  {showUserList && searchUsers.length === 0 && searchQuery.length >= 2 && !loadingUsers && (
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
                          <span>สมาชิกจะคงบทบาทเดิมที่มีอยู่ในระบบ</span>
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
                    setSearchUsers([]);
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

      {/* Remove Member Modal */}
      {removeMemberModal.show && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md transform transition-all duration-300 animate-in slide-in-from-bottom-4 scale-in-95 border border-white/20 dark:border-gray-700/50">
            {/* Header with gradient background */}
            <div className="relative bg-gradient-to-r from-red-500 via-pink-500 to-red-600 rounded-t-3xl p-6 text-white overflow-hidden">
              {/* Decorative elements */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
              <div className="absolute -bottom-2 -left-2 w-16 h-16 bg-white/10 rounded-full blur-lg"></div>
              
              <div className="relative z-10 flex items-center space-x-3">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                  <TrashIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">ลบสมาชิกออกจากทีม</h3>
                  <p className="text-white/80 text-sm">การดำเนินการนี้ไม่สามารถยกเลิกได้</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Member Info */}
              <div className="bg-gradient-to-r from-gray-50 to-red-50 dark:from-gray-800/50 dark:to-red-900/20 rounded-2xl p-4 mb-6 border border-red-200/50 dark:border-red-800/50">
                <div className="flex items-center space-x-3">
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 bg-gradient-to-br from-red-500 via-pink-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
                      <span className="text-white text-sm font-bold">
                        {removeMemberModal.memberName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center">
                      <TrashIcon className="w-2 h-2 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-lg font-bold text-gray-900 dark:text-white truncate">
                      {removeMemberModal.memberName}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                      {removeMemberModal.memberEmail}
                    </div>
                  </div>
                </div>
              </div>

              {/* Warning Message */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 mb-6">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center">
                      <span className="text-white text-sm">⚠️</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                      คำเตือนสำคัญ
                    </h4>
                    <div className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                      <div className="flex items-center space-x-2">
                        <div className="w-1.5 h-1.5 bg-yellow-600 rounded-full"></div>
                        <span>สมาชิกจะถูกลบออกจากทีมทันที</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-1.5 h-1.5 bg-yellow-600 rounded-full"></div>
                        <span>สิทธิ์การเข้าถึงเว็บไซต์ของทีมจะถูกยกเลิก</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-1.5 h-1.5 bg-yellow-600 rounded-full"></div>
                        <span>การกระทำนี้ไม่สามารถยกเลิกได้</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Confirmation */}
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
                <p className="text-sm text-red-700 dark:text-red-300 text-center">
                  <span className="font-semibold">กรุณายืนยัน:</span> คุณต้องการลบ &quot;{removeMemberModal.memberName}&quot; ออกจากทีมหรือไม่?
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={hideRemoveMemberModal}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={removeMember}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-red-500 to-red-600 rounded-xl hover:from-red-600 hover:to-red-700 transition-all duration-200 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 shadow-lg hover:shadow-xl flex items-center justify-center space-x-2"
                >
                  <TrashIcon className="h-4 w-4" />
                  <span>ลบสมาชิก</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Team Modal */}
      {showCreateTeamModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md transform transition-all duration-300 animate-in slide-in-from-bottom-4 scale-in-95">
            {/* Header with gradient background */}
            <div className="relative bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 rounded-t-3xl p-6 text-white overflow-hidden">
              {/* Decorative elements */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
              <div className="absolute -bottom-2 -left-2 w-16 h-16 bg-white/10 rounded-full blur-lg"></div>
              
              <div className="relative z-10 flex items-center space-x-3">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                  <UserGroupIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">สร้างทีมใหม่</h3>
                  <p className="text-white/80 text-sm">เริ่มต้นการทำงานร่วมกันของคุณ</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                {/* Team Name Input */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    <span className="flex items-center space-x-2">
                      <BuildingOfficeIcon className="h-4 w-4 text-green-500" />
                      <span>ชื่อทีม</span>
                      <span className="text-red-500">*</span>
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={newTeam.name}
                      onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-500"
                      placeholder="เช่น ทีมพัฒนา, ทีมการตลาด"
                      required
                    />
                    {newTeam.name && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <CheckCircleIcon className="h-5 w-5 text-green-500" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Team Description */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    <span className="flex items-center space-x-2">
                      <ChatBubbleLeftEllipsisIcon className="h-4 w-4 text-blue-500" />
                      <span>คำอธิบาย</span>
                      <span className="text-gray-400 text-xs">(ไม่บังคับ)</span>
                    </span>
                  </label>
                  <textarea
                    value={newTeam.description}
                    onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-500 resize-none"
                    placeholder="อธิบายเกี่ยวกับทีมของคุณ เป้าหมาย หรือหน้าที่รับผิดชอบ..."
                  />
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
                        สิทธิ์ของคุณ
                      </h4>
                      <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                        <div className="flex items-center space-x-2">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                          <span>เป็นผู้จัดการทีม (Manager)</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                          <span>เชิญและจัดการสมาชิก</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                          <span>จัดการเว็บไซต์และการเงิน</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => {
                    setShowCreateTeamModal(false);
                    setNewTeam({ name: '', description: '' });
                  }}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={createTeam}
                  disabled={!newTeam.name.trim()}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl hover:from-green-600 hover:to-emerald-600 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 shadow-lg hover:shadow-xl disabled:shadow-none flex items-center justify-center space-x-2"
                >
                  <UserGroupIcon className="h-4 w-4" />
                  <span>สร้างทีม</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Team Modal */}
      {deleteTeamModal.show && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md transform transition-all duration-300 animate-in slide-in-from-bottom-4 scale-in-95">
            {/* Header with gradient background */}
            <div className="relative bg-gradient-to-r from-red-500 via-pink-500 to-rose-500 rounded-t-3xl p-6 text-white overflow-hidden">
              {/* Decorative elements */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
              <div className="absolute -bottom-2 -left-2 w-16 h-16 bg-white/10 rounded-full blur-lg"></div>
              
              <div className="relative z-10 flex items-center space-x-3">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                  <TrashIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">ลบทีม</h3>
                  <p className="text-white/80 text-sm">การกระทำนี้ไม่สามารถยกเลิกได้</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Team Info */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-2xl p-4 mb-6">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center">
                      <span className="text-lg font-bold text-red-600 dark:text-red-400">
                        {deleteTeamModal.teamName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center">
                      <TrashIcon className="w-2 h-2 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-lg font-bold text-gray-900 dark:text-white truncate">
                      {deleteTeamModal.teamName}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      ทีมที่จะถูกลบ
                    </div>
                  </div>
                </div>
              </div>

              {/* Warning Message */}
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center">
                      <span className="text-white text-sm">⚠️</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
                      คำเตือนสำคัญ
                    </h4>
                    <div className="text-sm text-red-700 dark:text-red-300 space-y-1">
                      <div className="flex items-center space-x-2">
                        <div className="w-1.5 h-1.5 bg-red-600 rounded-full"></div>
                        <span>ทีมและข้อมูลทั้งหมดจะถูกลบถาวร</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-1.5 h-1.5 bg-red-600 rounded-full"></div>
                        <span>สมาชิกทั้งหมดจะถูกลบออกจากทีม</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-1.5 h-1.5 bg-red-600 rounded-full"></div>
                        <span>คำเชิญที่รออนุมัติจะถูกยกเลิก</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-1.5 h-1.5 bg-red-600 rounded-full"></div>
                        <span>การกระทำนี้ไม่สามารถยกเลิกได้</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Confirmation */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 mb-6">
                <p className="text-sm text-yellow-700 dark:text-yellow-300 text-center">
                  <span className="font-semibold">กรุณายืนยัน:</span> คุณต้องการลบทีม &quot;{deleteTeamModal.teamName}&quot; หรือไม่?
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={hideDeleteTeamModal}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={deleteTeam}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-red-500 to-red-600 rounded-xl hover:from-red-600 hover:to-red-700 transition-all duration-200 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 shadow-lg hover:shadow-xl flex items-center justify-center space-x-2"
                >
                  <TrashIcon className="h-4 w-4" />
                  <span>ลบทีม</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset API Key Modal */}
      {resetApiKeyModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 w-full max-w-lg mx-4 shadow-2xl border border-gray-200 dark:border-gray-700">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className="p-3 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl">
                  <KeyIcon className="h-6 w-6 text-white" />
                </div>
                <div className="ml-4">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    รีเซ็ท API Key
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    ทีม: {resetApiKeyModal.teamName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setResetApiKeyModal({ show: false, teamId: '', teamName: '', newApiKey: '' })}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <XMarkIcon className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Warning Message */}
            <div className="mb-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <div className="flex items-start">
                <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="ml-3">
                  <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    คำเตือน: การดำเนินการนี้ไม่สามารถย้อนกลับได้
                  </h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    • API Key เดิมจะไม่สามารถใช้งานได้อีก<br/>
                    • บริการที่ใช้ API Key เดิมจะหยุดทำงาน<br/>
                    • คุณจะต้องอัปเดต API Key ใหม่ในระบบทั้งหมด
                  </p>
                </div>
              </div>
            </div>

            {/* New API Key Preview */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                API Key ใหม่ที่จะถูกสร้าง:
              </label>
              <div className="relative">
                <code className="block w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 font-mono text-gray-700 dark:text-gray-300 break-all">
                  {resetApiKeyModal.newApiKey}
                </code>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    copyApiKey(resetApiKeyModal.newApiKey);
                  }}
                  className="absolute top-2 right-2 p-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors shadow-sm"
                  title="คัดลอก API Key ใหม่"
                >
                  <ClipboardDocumentIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                💡 คัดลอก API Key ใหม่ไว้ก่อนยืนยัน เพื่อใช้อัปเดตในระบบอื่นๆ
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setResetApiKeyModal({ show: false, teamId: '', teamName: '', newApiKey: '' })}
                className="px-6 py-3 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-300 font-medium"
              >
                ยกเลิก
              </button>
              <button
                onClick={confirmResetApiKey}
                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl hover:from-orange-600 hover:to-red-600 transition-all duration-300 font-medium shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                ยืนยัน รีเซ็ท API Key
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
} 