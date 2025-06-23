'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_PERMISSIONS } from '../../types/user';
import type { Invitation } from '../../types/user';
import toast from 'react-hot-toast';
import { logTeamInvitationAccepted, logTeamInvitationRejected } from '../../utils/logger';
import { 
  UserGroupIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ClockIcon,
  ExclamationTriangleIcon 
} from '@heroicons/react/24/outline';

export default function JoinTeam() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired' | 'accepted' | 'rejected'>('loading');

  useEffect(() => {
    if (token) {
      loadInvitation();
    } else {
      setStatus('invalid');
      setLoading(false);
    }
  }, [token]);

  const loadInvitation = async () => {
    if (!token) return;

    try {
      setLoading(true);
      
      // Search for invitation across all users (this is a simplified approach)
      // In production, you might want to use a more efficient search method
      
      // For now, we'll assume the invitation is stored in a global collection
      const inviteDoc = await getDoc(doc(db, 'invitations', token));
      
      if (!inviteDoc.exists()) {
        setStatus('invalid');
        return;
      }

      const inviteData = inviteDoc.data() as Invitation;
      
      // Check if invitation is expired
      if (new Date(inviteData.expiresAt) < new Date()) {
        setStatus('expired');
        return;
      }

      // Check if invitation is already accepted or rejected
      if (inviteData.status !== 'pending') {
        setStatus(inviteData.status as any);
        return;
      }

      setInvitation(inviteData);
      setStatus('valid');
      
    } catch (error) {
      // Error loading invitation
      setStatus('invalid');
    } finally {
      setLoading(false);
    }
  };

  const acceptInvitation = async () => {
    if (!invitation || !user) return;

    try {
      setProcessing(true);

      // Update invitation status
      await updateDoc(doc(db, 'invitations', token!), {
        status: 'accepted',
        acceptedAt: new Date().toISOString()
      });

      // Add user to team owner's team members (เข้าทีมในฐานะ user เสมอ)
      const teamMemberData = {
        id: user.uid,
        email: user.email,
        displayName: user.displayName || user.email,
        role: 'user' as const,
        permissions: ROLE_PERMISSIONS.user.permissions,
        invitedAt: invitation.createdAt,
        acceptedAt: new Date().toISOString(),
        invitedBy: invitation.ownerId,
        status: 'active'
      };

      await setDoc(doc(db, 'users', invitation.ownerId, 'teamMembers', user.uid), teamMemberData);

      // Update user's profile to include ownerId and teamId (ไม่แก้ไข Role)
      await updateDoc(doc(db, 'users', user.uid), {
        ownerId: invitation.ownerId,
        teamId: invitation.teamId
      });

      // Log team invitation acceptance
      if (user) {
        await logTeamInvitationAccepted(
          user.uid,
          user.email || 'user@system.local',
          user.displayName || user.email || 'User',
          invitation.ownerName,
          'user'
        );
      }

      setStatus('accepted');
      toast.success('เข้าร่วมทีมเรียบร้อย!');
      
      // Redirect to dashboard after a delay
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 2000);
      
    } catch (error) {
      // Error accepting invitation
      toast.error('ไม่สามารถเข้าร่วมทีมได้');
    } finally {
      setProcessing(false);
    }
  };

  const rejectInvitation = async () => {
    if (!invitation) return;

    try {
      setProcessing(true);

      await updateDoc(doc(db, 'invitations', token!), {
        status: 'rejected'
      });

      // Log team invitation rejection
      if (user) {
        await logTeamInvitationRejected(
          user.uid,
          user.email || 'user@system.local',
          user.displayName || user.email || 'User',
          invitation.ownerName
        );
      }

      setStatus('rejected');
      toast.success('ปฏิเสธคำเชิญเรียบร้อย');
      
    } catch (error) {
      // Error rejecting invitation
      toast.error('ไม่สามารถปฏิเสธคำเชิญได้');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
        <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-md border border-white/30 dark:border-gray-700/30">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">กำลังตรวจสอบคำเชิญ</h2>
            <p className="text-gray-600 dark:text-gray-400">กรุณารอสักครู่...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-md border border-white/30 dark:border-gray-700/30">
        
        {status === 'valid' && invitation && (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserGroupIcon className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">คำเชิญเข้าร่วมทีม</h2>
              <p className="text-gray-600 dark:text-gray-400">คุณได้รับคำเชิญให้เข้าร่วมทีม</p>
            </div>

            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-4 mb-6 border border-blue-200/50 dark:border-blue-800/50">
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{invitation.ownerName}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">เชิญคุณเข้าร่วมในฐานะ</p>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                  {ROLE_PERMISSIONS.user.label}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {ROLE_PERMISSIONS.user.description}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center space-x-3">
              <button
                onClick={rejectInvitation}
                disabled={processing}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium disabled:opacity-50"
              >
                ปฏิเสธ
              </button>
              <button
                onClick={acceptInvitation}
                disabled={processing}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium disabled:opacity-50"
              >
                {processing ? 'กำลังดำเนินการ...' : 'ยอมรับ'}
              </button>
            </div>
          </>
        )}

        {status === 'invalid' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircleIcon className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">คำเชิญไม่ถูกต้อง</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">ลิงก์คำเชิญนี้ไม่ถูกต้องหรือไม่มีอยู่</p>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium"
            >
              กลับสู่แดชบอร์ด
            </button>
          </div>
        )}

        {status === 'expired' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <ClockIcon className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">คำเชิญหมดอายุ</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">คำเชิญนี้หมดอายุแล้ว กรุณาติดต่อเจ้าของทีมเพื่อส่งคำเชิญใหม่</p>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium"
            >
              กลับสู่แดชบอร์ด
            </button>
          </div>
        )}

        {status === 'accepted' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">เข้าร่วมทีมสำเร็จ!</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">ยินดีต้อนรับสู่ทีม กำลังนำคุณไปยังแดชบอร์ด...</p>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto"></div>
          </div>
        )}

        {status === 'rejected' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircleIcon className="h-8 w-8 text-gray-600 dark:text-gray-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">ปฏิเสธคำเชิญแล้ว</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">คุณได้ปฏิเสธคำเชิญเข้าร่วมทีมแล้ว</p>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium"
            >
              กลับสู่แดชบอร์ด
            </button>
          </div>
        )}

      </div>
    </div>
  );
} 