import { useEffect, useRef, useState, useCallback } from 'react';
import { onSnapshot, Query, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { createResilientListener, connectionState } from '../lib/firebase';

interface UseResilientFirestoreOptions {
  listenerName: string;
  enabled?: boolean;
  retryOnError?: boolean;
  debounceMs?: number;
}

interface FirestoreDocument {
  id: string;
  [key: string]: any;
}

interface UseResilientFirestoreResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  isConnected: boolean;
  reconnectAttempts: number;
  refresh: () => void;
}

export function useResilientFirestore<T extends FirestoreDocument = FirestoreDocument>(
  queryFn: () => Query<DocumentData> | null,
  options: UseResilientFirestoreOptions
): UseResilientFirestoreResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadRef = useRef(true);
  
  const { listenerName, enabled = true, retryOnError = true, debounceMs = 0 } = options;

  const cleanup = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
  }, []);

  const handleSnapshot = useCallback((snapshot: QuerySnapshot<DocumentData>) => {
    const processSnapshot = () => {
      try {
        const newData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as T[];
        
        setData(newData);
        setError(null);
        setLoading(false);
        setIsConnected(true);
        setReconnectAttempts(0);
        
        // Skip initial load notifications
        if (initialLoadRef.current) {
          initialLoadRef.current = false;
        }
      } catch (err) {
        console.error(`Error processing snapshot for ${listenerName}:`, err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      }
    };

    if (debounceMs > 0) {
      // Clear existing timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      
      // Set new timeout
      debounceTimeoutRef.current = setTimeout(processSnapshot, debounceMs);
    } else {
      processSnapshot();
    }
  }, [listenerName, debounceMs]);

  const handleError = useCallback((err: any) => {
    console.error(`Firestore listener error for ${listenerName}:`, err);
    
    setIsConnected(false);
    setReconnectAttempts(prev => prev + 1);
    
    // Only set error state for non-connection errors
    if (err.code !== 'cancelled' && !err.message?.includes('CANCELLED')) {
      setError(err.message || 'Connection error');
      setLoading(false);
    }
  }, [listenerName]);

  const setupListener = useCallback(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const query = queryFn();
    if (!query) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    
    // Clean up any existing listener
    cleanup();

    // Setup new resilient listener
    unsubscribeRef.current = createResilientListener(
      listenerName,
      () => query,
      handleSnapshot,
      retryOnError ? handleError : undefined
    );
  }, [enabled, queryFn, listenerName, retryOnError, handleSnapshot, handleError, cleanup]);

  const refresh = useCallback(() => {
    initialLoadRef.current = true;
    setReconnectAttempts(0);
    setupListener();
  }, [setupListener]);

  // Setup listener on mount and when dependencies change
  useEffect(() => {
    setupListener();
    return cleanup;
  }, [setupListener, cleanup]);

  // Monitor global connection state
  useEffect(() => {
    const interval = setInterval(() => {
      setIsConnected(connectionState.isConnected);
      setReconnectAttempts(connectionState.reconnectAttempts);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    data,
    loading,
    error,
    isConnected,
    reconnectAttempts,
    refresh
  };
}

// Specialized hook for real-time updates with change detection
export function useResilientFirestoreUpdates<T extends FirestoreDocument = FirestoreDocument>(
  queryFn: () => Query<DocumentData> | null,
  options: UseResilientFirestoreOptions & {
    onAdded?: (item: T) => void;
    onModified?: (item: T) => void;
    onRemoved?: (item: T) => void;
    trackChanges?: boolean;
  }
): UseResilientFirestoreResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const initialLoadRef = useRef(true);
  
  const { 
    listenerName, 
    enabled = true, 
    retryOnError = true,
    onAdded,
    onModified,
    onRemoved,
    trackChanges = true
  } = options;

  const cleanup = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
  }, []);

  const handleSnapshot = useCallback((snapshot: QuerySnapshot<DocumentData>) => {
    try {
      if (initialLoadRef.current) {
        // Initial load - set all data
        const newData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as T[];
        
        setData(newData);
        initialLoadRef.current = false;
      } else if (trackChanges) {
        // Process changes incrementally
        const changes = snapshot.docChanges();
        
        changes.forEach(change => {
          const item = {
            id: change.doc.id,
            ...change.doc.data()
          } as T;
          
                     if (change.type === 'added') {
             setData(prev => {
               // Check if item already exists
               if (prev.some((existing) => existing.id === item.id)) {
                 return prev;
               }
               return [...prev, item];
             });
             onAdded?.(item);
           } else if (change.type === 'modified') {
             setData(prev => prev.map((existing) => 
               existing.id === item.id ? item : existing
             ));
             onModified?.(item);
           } else if (change.type === 'removed') {
             setData(prev => prev.filter((existing) => existing.id !== item.id));
             onRemoved?.(item);
           }
        });
      } else {
        // Full reload
        const newData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as T[];
        
        setData(newData);
      }
      
      setError(null);
      setLoading(false);
      setIsConnected(true);
      setReconnectAttempts(0);
      
    } catch (err) {
      console.error(`Error processing snapshot for ${listenerName}:`, err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  }, [listenerName, trackChanges, onAdded, onModified, onRemoved]);

  const handleError = useCallback((err: any) => {
    console.error(`Firestore listener error for ${listenerName}:`, err);
    
    setIsConnected(false);
    setReconnectAttempts(prev => prev + 1);
    
    // Only set error state for non-connection errors
    if (err.code !== 'cancelled' && !err.message?.includes('CANCELLED')) {
      setError(err.message || 'Connection error');
      setLoading(false);
    }
  }, [listenerName]);

  const setupListener = useCallback(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const query = queryFn();
    if (!query) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    
    // Clean up any existing listener
    cleanup();

    // Setup new resilient listener
    unsubscribeRef.current = createResilientListener(
      listenerName,
      () => query,
      handleSnapshot,
      retryOnError ? handleError : undefined
    );
  }, [enabled, queryFn, listenerName, retryOnError, handleSnapshot, handleError, cleanup]);

  const refresh = useCallback(() => {
    initialLoadRef.current = true;
    setReconnectAttempts(0);
    setupListener();
  }, [setupListener]);

  // Setup listener on mount and when dependencies change
  useEffect(() => {
    setupListener();
    return cleanup;
  }, [setupListener, cleanup]);

  // Monitor global connection state
  useEffect(() => {
    const interval = setInterval(() => {
      setIsConnected(connectionState.isConnected);
      setReconnectAttempts(connectionState.reconnectAttempts);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    data,
    loading,
    error,
    isConnected,
    reconnectAttempts,
    refresh
  };
} 