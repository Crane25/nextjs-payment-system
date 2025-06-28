import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, doc, getDoc, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/contexts/UserContext';
import { usePermission } from './usePermission';

export interface TeamData {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  ownerId: string;
  ownerName?: string; // ชื่อเจ้าของทีมปัจจุบัน
  memberCount: number;
  totalWebsites: number;
  totalBalance: number;
  dailyTopup: number;
  apiKey?: string; // API Key ของทีม
}

// Cache system
interface CacheData {
  teams: TeamData[];
  timestamp: number;
}

const cacheMap = new Map<string, CacheData>();
const CACHE_DURATION = 30000; // 30 seconds

export const useMultiTeam = (mode: 'all' | 'owned' = 'all') => {
  const { user } = useAuth();
  const { userProfile } = useUserProfile();
  const { hasPermission } = usePermission();
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTeamsOptimized = useCallback(async (force = false) => {
    if (!user || !userProfile) {
      setLoading(false);
      return;
    }

    // Check cache first
    const cacheKey = `${user.uid}-${mode}`;
    const cachedData = cacheMap.get(cacheKey);
    if (!force && cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
      setTeams(cachedData.teams);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      


      
      let teamsQuery;
      let snapshot;

      if (userProfile.role === 'admin') {
        if (mode === 'owned') {
          // Admin: ดูเฉพาะทีมที่ตัวเองเป็นเจ้าของ (สำหรับหน้า team management)
          teamsQuery = query(
            collection(db, 'teams'),
            where('ownerId', '==', user.uid)
          );
          snapshot = await getDocs(teamsQuery);
        } else {
          // Admin: ดูทุกทีมที่ตัวเองเป็นสมาชิก (สำหรับ dashboard และ topup-history)
          // ใช้ userId ก่อน เพราะแม่นยำกว่า
          const membersByUserIdQuery = query(
            collection(db, 'teamMembers'),
            where('userId', '==', user.uid),
            where('status', '==', 'active')
          );
          
          let membersSnapshot = await getDocs(membersByUserIdQuery);
          let userTeamIds = membersSnapshot.docs.map(doc => doc.data().teamId);
          
          // Fallback: ถ้าไม่เจอด้วย userId ให้ลองใช้ email
          if (userTeamIds.length === 0) {
            const membersByEmailQuery = query(
              collection(db, 'teamMembers'),
              where('email', '==', userProfile.email),
              where('status', '==', 'active')
            );
            
            membersSnapshot = await getDocs(membersByEmailQuery);
            userTeamIds = membersSnapshot.docs.map(doc => doc.data().teamId);
          }
          

          
          if (userTeamIds.length > 0) {
            if (userTeamIds.length === 1) {
              const teamDoc = await getDoc(doc(db, 'teams', userTeamIds[0]));
              snapshot = { docs: teamDoc.exists() ? [teamDoc] : [] };
            } else {
              // Handle multiple teams - chunk if more than 10 (Firestore 'in' limitation)
              const chunks = [];
              for (let i = 0; i < userTeamIds.length; i += 10) {
                chunks.push(userTeamIds.slice(i, i + 10));
              }
              
              const allDocs = [];
              for (const chunk of chunks) {
                teamsQuery = query(
                  collection(db, 'teams'),
                  where(documentId(), 'in', chunk)
                );
                const chunkSnapshot = await getDocs(teamsQuery);
                allDocs.push(...chunkSnapshot.docs);
              }
              snapshot = { docs: allDocs };
            }
          } else {
            setTeams([]);
            setLoading(false);
            return;
          }
        }
      } else if (userProfile.role === 'manager') {
        if (mode === 'owned') {
          // Manager: ดูเฉพาะทีมที่ตัวเองเป็นเจ้าของ (สำหรับหน้า team management)
          teamsQuery = query(
            collection(db, 'teams'),
            where('ownerId', '==', user.uid)
          );
          snapshot = await getDocs(teamsQuery);
        } else {
          // Manager: ดูทุกทีมที่ตัวเองเป็นสมาชิก (สำหรับ dashboard และ topup-history)
          // ใช้ userId ก่อน เพราะแม่นยำกว่า
          const membersByUserIdQuery = query(
            collection(db, 'teamMembers'),
            where('userId', '==', user.uid),
            where('status', '==', 'active')
          );
          
          let membersSnapshot = await getDocs(membersByUserIdQuery);
          let userTeamIds = membersSnapshot.docs.map(doc => doc.data().teamId);
          
          // Fallback: ถ้าไม่เจอด้วย userId ให้ลองใช้ email
          if (userTeamIds.length === 0) {
            const membersByEmailQuery = query(
              collection(db, 'teamMembers'),
              where('email', '==', userProfile.email),
              where('status', '==', 'active')
            );
            
            membersSnapshot = await getDocs(membersByEmailQuery);
            userTeamIds = membersSnapshot.docs.map(doc => doc.data().teamId);
          }
          
          if (userTeamIds.length > 0) {
            if (userTeamIds.length === 1) {
              const teamDoc = await getDoc(doc(db, 'teams', userTeamIds[0]));
              snapshot = { docs: teamDoc.exists() ? [teamDoc] : [] };
            } else {
              // Handle multiple teams - chunk if more than 10 (Firestore 'in' limitation)
              const chunks = [];
              for (let i = 0; i < userTeamIds.length; i += 10) {
                chunks.push(userTeamIds.slice(i, i + 10));
              }
              
              const allDocs = [];
              for (const chunk of chunks) {
                teamsQuery = query(
                  collection(db, 'teams'),
                  where(documentId(), 'in', chunk)
                );
                const chunkSnapshot = await getDocs(teamsQuery);
                allDocs.push(...chunkSnapshot.docs);
              }
              snapshot = { docs: allDocs };
            }
          } else {
            setTeams([]);
            setLoading(false);
            return;
          }
        }
      } else if (userProfile.role === 'user' && user) {
        // User: ค้นหาทีมที่ตัวเองเป็นสมาชิก
        // ใช้ userId ก่อน เพราะแม่นยำกว่า
        const membersByUserIdQuery = query(
          collection(db, 'teamMembers'),
          where('userId', '==', user.uid),
          where('status', '==', 'active')
        );
        
        let membersSnapshot = await getDocs(membersByUserIdQuery);
        let userTeamIds = membersSnapshot.docs.map(doc => doc.data().teamId);
        
        // Fallback: ถ้าไม่เจอด้วย userId ให้ลองใช้ email
        if (userTeamIds.length === 0) {
          const membersByEmailQuery = query(
            collection(db, 'teamMembers'),
            where('email', '==', userProfile.email),
            where('status', '==', 'active')
          );
          
          membersSnapshot = await getDocs(membersByEmailQuery);
          userTeamIds = membersSnapshot.docs.map(doc => doc.data().teamId);
        }
        
        if (userTeamIds.length > 0) {
          // ดึงข้อมูลทีมทั้งหมดที่ user เป็นสมาชิก
          if (userTeamIds.length === 1) {
            // ถ้ามีทีมเดียว ใช้ getDoc
            const teamDoc = await getDoc(doc(db, 'teams', userTeamIds[0]));
            snapshot = { docs: teamDoc.exists() ? [teamDoc] : [] };
          } else {
            // ถ้ามีหลายทีม ใช้ query with documentId - handle Firestore 'in' limitation
            const chunks = [];
            for (let i = 0; i < userTeamIds.length; i += 10) {
              chunks.push(userTeamIds.slice(i, i + 10));
            }
            
            const allDocs = [];
            for (const chunk of chunks) {
              teamsQuery = query(
                collection(db, 'teams'),
                where(documentId(), 'in', chunk)
              );
              const chunkSnapshot = await getDocs(teamsQuery);
              allDocs.push(...chunkSnapshot.docs);
            }
            snapshot = { docs: allDocs };
          }
        } else {
          // User: ไม่มีทีม
          setTeams([]);
          setLoading(false);
          return;
        }
      } else {
        // User: ไม่มีทีม
        setTeams([]);
        setLoading(false);
        return;
      }

      if (!snapshot.docs.length) {
        setTeams([]);
        setLoading(false);
        return;
      }

      // Batch queries - Execute all queries in parallel
      const teamIds = snapshot.docs.map(doc => doc.id);
      const ownerIds = Array.from(new Set(snapshot.docs.map(doc => doc.data().ownerId).filter(Boolean)));
      
      const [membersSnapshot, websitesSnapshot, ownersSnapshot] = await Promise.all([
        getDocs(collection(db, 'teamMembers')),
        getDocs(collection(db, 'websites')),
        ownerIds.length > 0 ? getDocs(query(collection(db, 'users'), where(documentId(), 'in', ownerIds))) : Promise.resolve({ docs: [] })
      ]);

      // Create efficient lookup maps
      const membersMap = new Map<string, number>();
      membersSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.teamId && teamIds.includes(data.teamId)) {
          membersMap.set(data.teamId, (membersMap.get(data.teamId) || 0) + 1);
        }
      });

      // Create owners map for current display names
      const ownersMap = new Map<string, string>();
      ownersSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        ownersMap.set(doc.id, userData.displayName || userData.email || 'ไม่ระบุชื่อ');
      });

      const websitesMap = new Map<string, { count: number; totalBalance: number; dailyTopup: number }>();
      const today = new Date().toISOString().split('T')[0];
      
      websitesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.teamId && teamIds.includes(data.teamId)) {
          const existing = websitesMap.get(data.teamId) || { count: 0, totalBalance: 0, dailyTopup: 0 };
          
          existing.count += 1;
          existing.totalBalance += data.balance || 0;
          
          // คำนวณยอดเติมรวมวันนี้
          if (data.lastTopupDate === today) {
            existing.dailyTopup += data.dailyTopup || 0;
          }
          
          websitesMap.set(data.teamId, existing);
        }
      });

      // Process teams with efficient lookups
      const teamsData: TeamData[] = snapshot.docs.map(docSnap => {
        const teamData = docSnap.data();
        const teamId = docSnap.id;
        
        const memberCount = membersMap.get(teamId) || 0;
        const websiteData = websitesMap.get(teamId) || { count: 0, totalBalance: 0, dailyTopup: 0 };
        const ownerName = ownersMap.get(teamData.ownerId) || 'ไม่ระบุชื่อ';

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
          createdAt: createdAtDate,
          ownerId: teamData.ownerId || '',
          ownerName,
          memberCount,
          totalWebsites: websiteData.count,
          totalBalance: websiteData.totalBalance,
          dailyTopup: websiteData.dailyTopup,
          apiKey: teamData.apiKey || '' // เพิ่ม API Key
        };
      });

      // Sort teams by createdAt (oldest first)
      teamsData.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());


      // Ensure we have valid data before setting
      if (Array.isArray(teamsData)) {
        setTeams(teamsData);
      } else {
        console.error('useMultiTeam: Invalid teams data', teamsData);
        setTeams([]);
      }
      
      // Update cache
      cacheMap.set(cacheKey, {
        teams: teamsData,
        timestamp: Date.now()
      });
      
      setLoading(false);
    } catch (err) {
      console.error('useMultiTeam: Error occurred', {
        error: err,
        userId: user?.uid,
        userRole: userProfile?.role,
        mode
      });
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูลทีม');
      setLoading(false);
    }
  }, [user, userProfile, hasPermission, mode]);

  useEffect(() => {
    // Clear cache when user or role changes to prevent stale data
    cacheMap.clear();
    fetchTeamsOptimized();
  }, [user?.uid, userProfile?.role, userProfile?.email, mode]);

  return {
    teams,
    loading,
    error,
    canViewTeams: hasPermission('teams', 'read') || !!userProfile?.teamId,
    refreshTeams: () => {
      cacheMap.clear(); // Clear all cache
      fetchTeamsOptimized(true);
    }
  };
}; 