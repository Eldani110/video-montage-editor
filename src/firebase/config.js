import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Web app's Firebase configuration with optional environment variable overrides
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBDT5IbK_WyGOAvuA7FxPXZMVn8-rUcsQw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "montage-pro-studio.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "montage-pro-studio",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "montage-pro-studio.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "223880692091",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:223880692091:web:755a8e60db8dd84e717dde"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication
export const auth = getAuth(app);
