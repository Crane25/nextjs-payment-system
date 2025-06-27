import { initializeApp, getApps, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
let adminApp: any;
let adminDb: any;

try {
  // Check if admin app is already initialized
  if (getApps().length === 0) {
    // For server-side (API routes), we can use simpler initialization
    // The Firebase Admin SDK will automatically detect the service account
    // from environment variables or the default service account
    adminApp = initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  } else {
    adminApp = getApps()[0];
  }
  
  adminDb = getFirestore(adminApp);
  // Firebase Admin SDK initialized successfully
} catch (error) {
  console.error('❌ Firebase Admin SDK initialization error:', error);
  throw new Error('Firebase Admin SDK initialization failed');
}

export { adminDb };