import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiry: number;
}

interface DashboardData {
  websites: any[];
  teams: any[];
  users: any[];
  topupHistory: any[];
  withdrawHistory: any[];
  stats: {
    totalBalance: number;
    todayTopup: number;
    todayWithdraw: number;
    todayTopupByWebsite: Record<string, number>;
    todayWithdrawByWebsite: Record<string, number>;
  };
}

class DashboardDataManager {
  private static instance: DashboardDataManager;
  private cache: Map<string, CacheEntry<any>> = new Map();
  
  // Cache durations in milliseconds
  private readonly CACHE_DURATIONS = {
    websites: 2 * 60 * 1000,      // 2 minutes
    teams: 5 * 60 * 1000,         // 5 minutes
    users: 10 * 60 * 1000,        // 10 minutes
    topupHistory: 30 * 1000,      // 30 seconds
    withdrawHistory: 30 * 1000,   // 30 seconds
    dashboardData: 1 * 60 * 1000  // 1 minute for combined data
  };

  private constructor() {}

  static getInstance(): DashboardDataManager {
    if (!DashboardDataManager.instance) {
      DashboardDataManager.instance = new DashboardDataManager();
    }
    return DashboardDataManager.instance;
  }

  private isValidCache<T>(key: string): boolean {
    const cached = this.cache.get(key);
    if (!cached) return false;
    return Date.now() < cached.expiry;
  }

  private setCache<T>(key: string, data: T, duration: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiry: Date.now() + duration
    });
  }

  private getCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached || Date.now() >= cached.expiry) {
      this.cache.delete(key);
      return null;
    }
    return cached.data;
  }

  // Load all websites with caching
  async loadWebsites(forceRefresh = false): Promise<any[]> {
    const cacheKey = 'websites';
    
    if (!forceRefresh && this.isValidCache(cacheKey)) {
      return this.getCache<any[]>(cacheKey) || [];
    }

    try {
      const websitesRef = collection(db, 'websites');
      const snapshot = await getDocs(websitesRef);
      
      const websites = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      this.setCache(cacheKey, websites, this.CACHE_DURATIONS.websites);
      return websites;
    } catch (error) {
      console.error('Error loading websites:', error);
      return this.getCache<any[]>(cacheKey) || [];
    }
  }

  // Load teams with caching
  async loadTeams(forceRefresh = false): Promise<any[]> {
    const cacheKey = 'teams';
    
    if (!forceRefresh && this.isValidCache(cacheKey)) {
      return this.getCache<any[]>(cacheKey) || [];
    }

    try {
      const teamsRef = collection(db, 'teams');
      const snapshot = await getDocs(teamsRef);
      
      const teams = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      this.setCache(cacheKey, teams, this.CACHE_DURATIONS.teams);
      return teams;
    } catch (error) {
      console.error('Error loading teams:', error);
      return this.getCache<any[]>(cacheKey) || [];
    }
  }

  // Load users with caching
  async loadUsers(forceRefresh = false): Promise<any[]> {
    const cacheKey = 'users';
    
    if (!forceRefresh && this.isValidCache(cacheKey)) {
      return this.getCache<any[]>(cacheKey) || [];
    }

    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      
      const users = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      this.setCache(cacheKey, users, this.CACHE_DURATIONS.users);
      return users;
    } catch (error) {
      console.error('Error loading users:', error);
      return this.getCache<any[]>(cacheKey) || [];
    }
  }

  // Load topup history with caching
  async loadTopupHistory(forceRefresh = false): Promise<any[]> {
    const cacheKey = 'topupHistory';
    
    if (!forceRefresh && this.isValidCache(cacheKey)) {
      return this.getCache<any[]>(cacheKey) || [];
    }

    try {
      const topupHistoryRef = collection(db, 'topupHistory');
      const snapshot = await getDocs(topupHistoryRef);
      
      const topupHistory = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      this.setCache(cacheKey, topupHistory, this.CACHE_DURATIONS.topupHistory);
      return topupHistory;
    } catch (error) {
      console.error('Error loading topup history:', error);
      return this.getCache<any[]>(cacheKey) || [];
    }
  }

  // Load withdraw history with caching
  async loadWithdrawHistory(forceRefresh = false): Promise<any[]> {
    const cacheKey = 'withdrawHistory';
    
    if (!forceRefresh && this.isValidCache(cacheKey)) {
      return this.getCache<any[]>(cacheKey) || [];
    }

    try {
      const withdrawHistoryRef = collection(db, 'withdrawHistory');
      const snapshot = await getDocs(withdrawHistoryRef);
      
      const withdrawHistory = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      this.setCache(cacheKey, withdrawHistory, this.CACHE_DURATIONS.withdrawHistory);
      return withdrawHistory;
    } catch (error) {
      console.error('Error loading withdraw history:', error);
      return this.getCache<any[]>(cacheKey) || [];
    }
  }

  // Load all dashboard data in a single consolidated call
  async loadDashboardData(
    userId: string,
    userTeamIds: string[],
    userRole: string,
    forceRefresh = false
  ): Promise<DashboardData> {
    const cacheKey = `dashboardData-${userId}`;
    
    if (!forceRefresh && this.isValidCache(cacheKey)) {
      return this.getCache<DashboardData>(cacheKey) || this.getEmptyDashboardData();
    }

    try {
      // Load all data in parallel to minimize total loading time
      const [websites, teams, users, topupHistory, withdrawHistory] = await Promise.all([
        this.loadWebsites(forceRefresh),
        this.loadTeams(forceRefresh),
        this.loadUsers(forceRefresh),
        this.loadTopupHistory(forceRefresh),
        this.loadWithdrawHistory(forceRefresh)
      ]);

      // Filter websites based on user permissions
      const filteredWebsites = websites.filter((website: any) => {
        if (website.userId === userId) return true;
        if (userRole === 'admin') return true;
        if (website.teamId && userTeamIds.includes(website.teamId)) return true;
        return false;
      });

      // Calculate today's statistics
      const today = new Date();
      const todayString = today.toDateString();
      
      let todayTopup = 0;
      let todayWithdraw = 0;
      const todayTopupByWebsite: Record<string, number> = {};
      const todayWithdrawByWebsite: Record<string, number> = {};

      // Process topup history
      topupHistory.forEach((record: any) => {
        // Fix timestamp conversion - handle Firestore Timestamp objects
        let timestamp = record.timestamp;
        if (timestamp && typeof timestamp === 'object' && timestamp.toDate) {
          // If it's a Firestore Timestamp, convert to Date
          timestamp = timestamp.toDate();
        } else if (timestamp && typeof timestamp === 'object' && timestamp.seconds) {
          // Handle Firestore Timestamp with seconds/nanoseconds
          timestamp = new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
        } else if (timestamp) {
          // If it's already a string or Date, convert to Date
          timestamp = new Date(timestamp);
        } else {
          // If no timestamp, skip this record
          return;
        }

        const recordDate = timestamp;
        if (recordDate.toDateString() === todayString) {
          // Check if user has permission to see this record
          if (userRole === 'admin' || 
              (record.teamId && userTeamIds.includes(record.teamId))) {
            const amount = record.amount || 0;
            const websiteId = record.websiteId;
            
            todayTopup += amount;
            
            if (websiteId) {
              todayTopupByWebsite[websiteId] = (todayTopupByWebsite[websiteId] || 0) + amount;
            }
          }
        }
      });

      // Process withdraw history
      withdrawHistory.forEach((record: any) => {
        // Fix timestamp conversion - handle Firestore Timestamp objects
        let timestamp = record.timestamp;
        if (timestamp && typeof timestamp === 'object' && timestamp.toDate) {
          // If it's a Firestore Timestamp, convert to Date
          timestamp = timestamp.toDate();
        } else if (timestamp && typeof timestamp === 'object' && timestamp.seconds) {
          // Handle Firestore Timestamp with seconds/nanoseconds
          timestamp = new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
        } else if (timestamp) {
          // If it's already a string or Date, convert to Date
          timestamp = new Date(timestamp);
        } else {
          // If no timestamp, skip this record
          return;
        }

        const recordDate = timestamp;
        if (recordDate.toDateString() === todayString) {
          // Check if user has permission to see this record
          if (userRole === 'admin' || 
              (record.teamId && userTeamIds.includes(record.teamId))) {
            const amount = record.amount || 0;
            const websiteId = record.websiteId;
            
            todayWithdraw += amount;
            
            if (websiteId) {
              todayWithdrawByWebsite[websiteId] = (todayWithdrawByWebsite[websiteId] || 0) + amount;
            }
          }
        }
      });

      // Calculate total balance
      const totalBalance = filteredWebsites.reduce((sum: number, site: any) => 
        sum + (site.balance || 0), 0);

      const dashboardData: DashboardData = {
        websites: filteredWebsites,
        teams,
        users,
        topupHistory,
        withdrawHistory,
        stats: {
          totalBalance,
          todayTopup,
          todayWithdraw,
          todayTopupByWebsite,
          todayWithdrawByWebsite
        }
      };

      this.setCache(cacheKey, dashboardData, this.CACHE_DURATIONS.dashboardData);
      return dashboardData;

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      return this.getCache<DashboardData>(cacheKey) || this.getEmptyDashboardData();
    }
  }

  private getEmptyDashboardData(): DashboardData {
    return {
      websites: [],
      teams: [],
      users: [],
      topupHistory: [],
      withdrawHistory: [],
      stats: {
        totalBalance: 0,
        todayTopup: 0,
        todayWithdraw: 0,
        todayTopupByWebsite: {},
        todayWithdrawByWebsite: {}
      }
    };
  }

  // Clear specific cache
  clearCache(key: string): void {
    this.cache.delete(key);
  }

  // Clear all cache
  clearAllCache(): void {
    this.cache.clear();
  }

  // Clear user-specific cache
  clearUserCache(userId: string): void {
    const keysToDelete = Array.from(this.cache.keys()).filter(key => 
      key.includes(userId)
    );
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  // Get cache statistics for debugging
  getCacheStats(): { [key: string]: { size: number; validEntries: number } } {
    const stats: { [key: string]: { size: number; validEntries: number } } = {};
    
    this.cache.forEach((entry, key) => {
      const isValid = Date.now() < entry.expiry;
      const keyType = key.split('-')[0];
      
      if (!stats[keyType]) {
        stats[keyType] = { size: 0, validEntries: 0 };
      }
      
      stats[keyType].size++;
      if (isValid) {
        stats[keyType].validEntries++;
      }
    });

    return stats;
  }
}

export const dashboardDataManager = DashboardDataManager.getInstance(); 