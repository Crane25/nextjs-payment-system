'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { usePermission } from '../../hooks/usePermission';
import { useUserProfile } from '../../contexts/UserContext';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ROLE_PERMISSIONS } from '../../types/user';
import type { User } from '../../types/user';
import { 
  UserIcon, 
  PencilIcon, 
  ShieldCheckIcon,
  XCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  UsersIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { logRoleChange } from '../../utils/logger';
import { getUserDisplayName, getUserAvatarInitial } from '../../utils/userDisplay';
import { useAuth } from '../../contexts/AuthContext';

interface UserWithId extends User {
  id: string;
}

export default function AdminPanel() {
  const { user } = useAuth();
  const { canAccessAdminPanel } = usePermission();
  const { userProfile } = useUserProfile();
  const [users, setUsers] = useState<UserWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithId | null>(null);
  const [newRole, setNewRole] = useState<'admin' | 'manager' | 'user'>('user');

  // Cache system
  interface UsersCacheData {
    users: UserWithId[];
    timestamp: number;
  }

  let usersCache: UsersCacheData | null = null;
  const USERS_CACHE_DURATION = 60000; // 1 minute

  // Check if user is admin
  useEffect(() => {
    if (!canAccessAdminPanel()) {
      toast.error('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
      window.location.href = '/dashboard';
      return;
    }
  }, [canAccessAdminPanel]);

  // Helper function to safely format dates
  const formatDate = (dateValue: any): string => {
    try {
      if (!dateValue) return 'ไม่ระบุ';
      
      let date: Date;
      
      // Handle Firestore Timestamp
      if (dateValue?.toDate && typeof dateValue.toDate === 'function') {
        date = dateValue.toDate();
      }
      // Handle ISO string
      else if (typeof dateValue === 'string') {
        date = new Date(dateValue);
      }
      // Handle Date object
      else if (dateValue instanceof Date) {
        date = dateValue;
      }
      // Handle timestamp number
      else if (typeof dateValue === 'number') {
        date = new Date(dateValue);
      }
      else {
        return 'ไม่ระบุ';
      }

      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'ไม่ระบุ';
      }

      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (error) {
      // Error formatting date
      return 'ไม่ระบุ';
    }
  };

  // Optimized user loading with improved caching
  const loadUsersOptimized = useCallback(async (isRefresh = false) => {
    // Check cache first
    if (!isRefresh && usersCache && Date.now() - usersCache.timestamp < USERS_CACHE_DURATION) {
      setUsers(usersCache.users);
      setLoading(false);
      return;
    }

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      
      // Use getDocs for efficient single query
      const usersSnapshot = await getDocs(collection(db, 'users'));
      
      const usersData: UserWithId[] = usersSnapshot.docs.map(doc => {
        const data = doc.data();
        
        return {
          id: doc.id,
          uid: data.uid || doc.id,
          email: data.email || 'ไม่ระบุ',
          displayName: getUserDisplayName(data),
          role: data.role || 'user',
          permissions: data.permissions || [],
          createdAt: data.createdAt || new Date().toISOString(),
          lastLogin: data.lastLogin || new Date().toISOString(),
          ownerId: data.ownerId,
          teamId: data.teamId
        };
      });
      
      // Sort on client side for better performance
      usersData.sort((a, b) => {
        // กำหนดลำดับสิทธิ์ (เลขน้อย = สิทธิ์สูง)
        const roleOrder: Record<string, number> = {
          'admin': 1,
          'manager': 2,
          'user': 3
        };
        
        const roleA = roleOrder[a.role] || 999;
        const roleB = roleOrder[b.role] || 999;
        
        // ถ้าสิทธิ์ต่างกัน เรียงตามสิทธิ์
        if (roleA !== roleB) {
          return roleA - roleB;
        }
        
        // ถ้าสิทธิ์เท่ากัน เรียงตามวันที่สมัคร (เก่าก่อน)
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateA - dateB;
      });
      
      setUsers(usersData);
      
      // Update cache
      usersCache = {
        users: usersData,
        timestamp: Date.now()
      };
      
    } catch (error) {
      // Error loading users
      toast.error('ไม่สามารถโหลดข้อมูลผู้ใช้ได้: ' + (error as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Force refresh function
  const handleRefreshUsers = useCallback(() => {
    usersCache = null; // Clear cache
    loadUsersOptimized(true);
  }, [loadUsersOptimized]);

  useEffect(() => {
    if (canAccessAdminPanel()) {
      loadUsersOptimized();
    }
  }, [canAccessAdminPanel, loadUsersOptimized]);

  // Update user role
  const updateUserRole = async () => {
    if (!editingUser || !user || !userProfile) return;

    // ป้องกันไม่ให้ Admin แก้ไขสิทธิ์ตัวเอง
    if (editingUser.id === userProfile.uid) {
      toast.error('ไม่สามารถแก้ไขสิทธิ์ตัวเองได้');
      return;
    }

    const oldRole = editingUser.role;

    try {
      await updateDoc(doc(db, 'users', editingUser.id), {
        role: newRole,
        permissions: ROLE_PERMISSIONS[newRole].permissions,
        lastLogin: new Date().toISOString()
      });

      // Log the role change
      await logRoleChange(
        user.uid,
        userProfile.email || user.email || '',
        userProfile.username || userProfile.displayName || 'admin',
        editingUser.id,
        editingUser.email,
        editingUser.displayName || editingUser.email?.split('@')[0] || 'ไม่ระบุชื่อ',
        ROLE_PERMISSIONS[oldRole]?.label || oldRole,
        ROLE_PERMISSIONS[newRole].label
      );

      // Update local state
      setUsers(users.map(user => 
        user.id === editingUser.id 
          ? { 
              ...user, 
              role: newRole, 
              permissions: ROLE_PERMISSIONS[newRole].permissions.map(p => ({
                resource: p.resource,
                actions: [...p.actions]
              }))
            }
          : user
      ));

      setEditingUser(null);
      toast.success(`อัพเดท Role ของ ${editingUser.displayName} เป็น ${ROLE_PERMISSIONS[newRole].label} เรียบร้อย`);
      
    } catch (error) {
      // Error updating user role
      toast.error('ไม่สามารถอัพเดท Role ได้');
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

  const getStatusIcon = (role: string) => {
    switch (role) {
      case 'admin': return <ShieldCheckIcon className="h-4 w-4" />;
      case 'manager': return <CheckCircleIcon className="h-4 w-4" />;
      case 'user': return <ClockIcon className="h-4 w-4" />;
      default: return <XCircleIcon className="h-4 w-4" />;
    }
  };

  if (!canAccessAdminPanel()) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <XCircleIcon className="mx-auto h-12 w-12 text-red-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">ไม่มีสิทธิ์เข้าถึง</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">เฉพาะ Admin เท่านั้นที่สามารถจัดการ Role ได้</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="จัดการสิทธิ์ผู้ใช้" 
      subtitle="จัดการ Role และสิทธิ์การเข้าถึงของผู้ใช้ทั้งหมด"
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
          </div>
          <button
            onClick={handleRefreshUsers}
            disabled={refreshing}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {refreshing ? 'กำลังโหลด...' : 'รีเฟรชข้อมูล'}
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          {/* Total Members Card */}
          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
                    <UsersIcon className="h-5 w-5 text-white" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      สมาชิกทั้งหมด
                    </dt>
                    <dd className="text-lg font-medium text-gray-900 dark:text-white">
                      {users.length} คน
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Role-specific Cards */}
          {Object.entries(ROLE_PERMISSIONS).map(([role, config]) => {
            const count = users.filter(user => user.role === role).length;
            return (
              <div key={role} className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getRoleColor(role)}`}>
                        {getStatusIcon(role)}
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                          {config.label}
                        </dt>
                        <dd className="text-lg font-medium text-gray-900 dark:text-white">
                          {count} คน
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Users Table */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">
              รายชื่อผู้ใช้ทั้งหมด ({users.length} คน)
            </h3>

            {loading ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-gray-200 dark:bg-gray-600 rounded-full"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-1/4"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-12">
                <UserIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">ไม่พบผู้ใช้</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">ยังไม่มีผู้ใช้ในระบบ</p>
                <div className="mt-6">
                  <button
                    onClick={handleRefreshUsers}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                  >
                    รีเฟรชข้อมูล
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 dark:ring-gray-600 md:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-600">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        ผู้ใช้
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Role ปัจจุบัน
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        สร้างเมื่อ
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        เข้าใช้ล่าสุด
                      </th>
                      <th className="relative px-6 py-3">
                        <span className="sr-only">การจัดการ</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                    {users.map((user) => (
                      <tr key={user.id} className={user.id === userProfile?.uid ? 'bg-red-50 dark:bg-red-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                <span className="text-sm font-medium text-white">
                                  {getUserAvatarInitial(user)}
                                </span>
                              </div>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center">
                                {getUserDisplayName(user)}
                                {user.id === userProfile?.uid && (
                                  <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
                                    คุณ (Admin)
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {user.email || 'ไม่ระบุอีเมล'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full border ${getRoleColor(user.role)}`}>
                            {getStatusIcon(user.role)}
                            <span className="ml-1">{ROLE_PERMISSIONS[user.role]?.label || user.role}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(user.lastLogin)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          {user.id === userProfile?.uid ? (
                            <div className="flex items-center space-x-2">
                              <span className="text-xs text-gray-400 dark:text-gray-500">ไม่สามารถแก้ไขตัวเองได้</span>
                              <button
                                disabled
                                className="text-gray-300 dark:text-gray-600 p-1 rounded-md cursor-not-allowed"
                                title="ไม่สามารถแก้ไขสิทธิ์ตัวเองได้"
                              >
                                <PencilIcon className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingUser(user);
                                setNewRole(user.role);
                              }}
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 p-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors duration-200"
                              title="แก้ไข Role"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Role Modal */}
      {editingUser && editingUser.id !== userProfile?.uid && (
        <div className="fixed inset-0 bg-gray-600 dark:bg-gray-900 bg-opacity-50 dark:bg-opacity-75 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border border-gray-200 dark:border-gray-600 w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">แก้ไข Role</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">ผู้ใช้</label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{editingUser.displayName} ({editingUser.email})</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role ปัจจุบัน</label>
                  <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full border ${getRoleColor(editingUser.role)} mt-1`}>
                    {ROLE_PERMISSIONS[editingUser.role]?.label || editingUser.role}
                  </span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role ใหม่</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="mt-1 block w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="admin">ผู้ดูแลระบบ (สิทธิ์สูงสุด)</option>
                    <option value="manager">ผู้จัดการ</option>
                    <option value="user">ผู้ใช้ (ยังไม่เข้าทีม)</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {ROLE_PERMISSIONS[newRole]?.description}
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={updateUserRole}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                >
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
} 