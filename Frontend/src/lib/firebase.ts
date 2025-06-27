import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { config } from '../config/env';

const firebaseConfig = config.firebase;

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

try {
  // Initialize Firebase
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  
  // Only log success in development
  if (config.app.isDevelopment) {
    // Firebase initialized successfully
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

// Test connection function สำหรับ development
export const testFirebaseConnection = async () => {
  if (!config.app.isDevelopment) return;
  
  try {
    // Test Firestore connection
    const { collection, getDocs } = await import('firebase/firestore');
    const testCollection = collection(db, '__test__');
    await getDocs(testCollection);
    
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

export { app, auth, db }; 