// Global cache manager for syncing data between pages
export class CacheManager {
  private static instance: CacheManager;
  private caches: Map<string, any> = new Map();
  private listeners: Map<string, Set<() => void>> = new Map();

  private constructor() {}

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  // Set cache data
  setCache(key: string, data: any): void {
    this.caches.set(key, data);
    this.notifyListeners(key);
  }

  // Get cache data
  getCache(key: string): any {
    return this.caches.get(key);
  }

  // Clear specific cache
  clearCache(key: string): void {
    this.caches.delete(key);
    this.notifyListeners(key);
  }

  // Clear all caches
  clearAllCaches(): void {
    this.caches.clear();
    // Notify all listeners
    Array.from(this.listeners.keys()).forEach(key => {
      this.notifyListeners(key);
    });
  }

  // Subscribe to cache changes
  subscribe(key: string, callback: () => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);

    // Return unsubscribe function
    return () => {
      const keyListeners = this.listeners.get(key);
      if (keyListeners) {
        keyListeners.delete(callback);
        if (keyListeners.size === 0) {
          this.listeners.delete(key);
        }
      }
    };
  }

  // Notify listeners of cache changes
  private notifyListeners(key: string): void {
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      keyListeners.forEach(callback => callback());
    }
  }

  // Check if cache exists and is valid
  isCacheValid(key: string, maxAge: number): boolean {
    const cache = this.caches.get(key);
    if (!cache || !cache.timestamp) return false;
    return Date.now() - cache.timestamp < maxAge;
  }
}

// Cache keys constants
export const CACHE_KEYS = {
  TOPUP_HISTORY: 'topup_history',
  WEBSITES: 'websites',
  TEAMS: 'teams',
  USERS: 'users'
} as const;

// Global cache instance
export const cacheManager = CacheManager.getInstance(); 