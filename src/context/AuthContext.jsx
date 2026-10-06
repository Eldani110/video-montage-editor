import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged
} from 'firebase/auth';
import { auth } from '../firebase/config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Timeout safeguard: never block the app for more than 1.2s if Firebase is slow/blocked/offline
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1200);

    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        clearTimeout(timer);
        setUser(currentUser);
        setLoading(false);
      },
      (error) => {
        console.warn('Firebase onAuthStateChanged notice:', error);
        clearTimeout(timer);
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    return await signInWithEmailAndPassword(auth, email, password);
  };

  const register = async (email, password, displayName) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName && userCredential.user) {
      await updateProfile(userCredential.user, { displayName });
      // Update local state with latest user profile
      setUser({ ...userCredential.user, displayName });
    }
    return userCredential;
  };

  const logout = async () => {
    return await signOut(auth);
  };

  const resetPassword = async (email) => {
    return await sendPasswordResetEmail(auth, email);
  };

  const getFriendlyErrorMessage = (error) => {
    if (!error) return '';
    const code = error.code || '';
    switch (code) {
      case 'auth/invalid-credential':
        return 'El correo o la contraseña no son válidos.';
      case 'auth/user-not-found':
        return 'No existe ninguna cuenta registrada con este correo.';
      case 'auth/wrong-password':
        return 'La contraseña es incorrecta.';
      case 'auth/email-already-in-use':
        return 'Ya existe una cuenta registrada con este correo.';
      case 'auth/weak-password':
        return 'La contraseña debe tener al menos 6 caracteres.';
      case 'auth/invalid-email':
        return 'El correo electrónico ingresado no tiene un formato válido.';
      case 'auth/too-many-requests':
        return 'Demasiados intentos fallidos. Inténtalo más tarde.';
      case 'auth/network-request-failed':
        return 'Error de red. Verifica tu conexión a internet.';
      case 'auth/operation-not-allowed':
        return 'El proveedor de correo y contraseña no está habilitado en la consola de Firebase.';
      default:
        return error.message || 'Ocurrió un error inesperado al autenticar.';
    }
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    resetPassword,
    getFriendlyErrorMessage
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
