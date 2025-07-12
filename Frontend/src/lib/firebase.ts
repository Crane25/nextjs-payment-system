import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator, enableNetwork, disableNetwork } from 'firebase/firestore';
import { config } from '../config/env';

const firebaseConfig = config.firebase;

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

// Connection management
let isConnected = true;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000; // 2 seconds

// Connection state management
export const connectionState = {
  isConnected: true,
  listeners: new Set<string>(),
  reconnectAttempts: 0
};

try {
  // Initialize Firebase
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  
  // Configure Firestore settings for better connection handling
  if (typeof window !== 'undefined') {
    // Enable offline persistence (helps with connection issues)
    // This is handled automatically by Firebase SDK v9+
  }
  
  // Only log success in development
  if (config.app.isDevelopment) {
    console.log('✅ Firebase initialized successfully');
  }
} catch (error) {
  // Log error but don't expose sensitive details
  if (config.app.isDevelopment) {
    console.error('❌ Firebase initialization error:', error);
  } else {
    console.error('❌ Firebase initialization failed');
  }
  
  // Throw generic error for production
  throw new Error('Service initialization failed');
}

// Enhanced connection management functions
export const handleConnectionError = async (error: any, retryCallback?: () => void) => {
  console.error('Firebase connection error:', error);
  
  if (error.code === 'cancelled' || error.message?.includes('CANCELLED')) {
    // Handle idle stream disconnection
    console.log('🔄 Handling idle stream disconnection...');
    
    // Mark as disconnected
    connectionState.isConnected = false;
    connectionState.reconnectAttempts++;
    
    // Retry connection if not exceeded max attempts
    if (connectionState.reconnectAttempts < MAX_RECONNECT_ATTEMPTS && retryCallback) {
      setTimeout(() => {
        console.log(`🔄 Reconnecting... (Attempt ${connectionState.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        retryCallback();
      }, RECONNECT_DELAY * connectionState.reconnectAttempts);
    }
    
    return true; // Indicates this was a handled connection error
  }
  
  return false; // Not a connection error
};

export const resetConnectionState = () => {
  connectionState.isConnected = true;
  connectionState.reconnectAttempts = 0;
};

// Enhanced real-time listener wrapper with automatic reconnection
export const createResilientListener = (
  listenerName: string,
  queryFn: () => any,
  onData: (snapshot: any) => void,
  onError?: (error: any) => void
) => {
  let unsubscribe: (() => void) | null = null;
  let isActive = true;
  
  const setupListener = () => {
    if (!isActive) return;
    
    try {
      const query = queryFn();
      
      unsubscribe = query.onSnapshot(
        (snapshot: any) => {
          resetConnectionState();
          connectionState.listeners.add(listenerName);
          onData(snapshot);
        },
        (error: any) => {
          console.error(`Real-time listener error (${listenerName}):`, error);
          
          // Handle connection errors with retry logic
          const wasHandled = handleConnectionError(error, () => {
            if (isActive) {
              setupListener();
            }
          });
          
          if (!wasHandled && onError) {
            onError(error);
          }
        }
      );
    } catch (error) {
      console.error(`Failed to setup listener (${listenerName}):`, error);
      if (onError) {
        onError(error);
      }
    }
  };
  
  // Initial setup
  setupListener();
  
  // Return cleanup function
  return () => {
    isActive = false;
    connectionState.listeners.delete(listenerName);
    
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
};

// Monitor connection state
export const monitorConnection = () => {
  if (typeof window !== 'undefined') {
    // Monitor online/offline state
    window.addEventListener('online', () => {
      console.log('🟢 Network back online');
      resetConnectionState();
    });
    
    window.addEventListener('offline', () => {
      console.log('🔴 Network offline');
      connectionState.isConnected = false;
    });
  }
};

// Test connection function สำหรับ development
export const testFirebaseConnection = async () => {
  if (!config.app.isDevelopment) return;
  
  try {
    // Test Firestore connection
    const { collection, getDocs } = await import('firebase/firestore');
    const testCollection = collection(db, '__test__');
    await getDocs(testCollection);
    
    console.log('✅ Firebase connection test passed');
    return true;
  } catch (error) {
    console.error('❌ Firebase connection test failed:', error);
    
    if (error instanceof Error) {
      console.error('Connection error details:', {
        message: error.message,
        code: (error as any).code,
        customData: (error as any).customData
      });
    }
    
    return false;
  }
};

// Initialize connection monitoring
if (typeof window !== 'undefined') {
  monitorConnection();
}

export { app, auth, db }; 