import React, { useState, useEffect } from 'react';
import { HomePage } from './components/HomePage';
import { EditorPage } from './components/EditorPage';
import { AuthPage } from './components/AuthPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Film } from 'lucide-react';
import { getStoredDirectoryHandle, saveStoredDirectoryHandle } from './utils/storage';
import { normalizeProject } from './utils/timelineOps';
import './App.css';

function MainAppContent() {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState('home'); // 'home' | 'editor' | 'auth'
  const [activeProject, setActiveProject] = useState(null);
  const [currentDirHandle, setCurrentDirHandle] = useState(null);

  // If user logs in while in auth view, return to home
  useEffect(() => {
    if (user && currentView === 'auth') {
      setCurrentView('home');
    }
  }, [user, currentView]);

  // Restore persistent directory handle from IndexedDB on startup
  useEffect(() => {
    let isMounted = true;
    async function restoreDirectory() {
      try {
        const stored = await getStoredDirectoryHandle();
        if (stored && stored.handle && isMounted) {
          setCurrentDirHandle(stored.handle);
        }
      } catch (err) {
        console.warn('Error restoring saved directory handle from IndexedDB:', err);
      }
    }
    restoreDirectory();
    return () => { isMounted = false; };
  }, []);

  const handleUpdateDirHandle = (dirHandle) => {
    setCurrentDirHandle(dirHandle);
    if (dirHandle) {
      saveStoredDirectoryHandle(dirHandle);
    }
  };

  const handleOpenProject = (project) => {
    if (!project) return;
    const normalized = normalizeProject(project);
    setActiveProject(normalized);
    try {
      localStorage.setItem('montage_last_active_project_id', normalized.id);
    } catch (_) {}
    setCurrentView('editor');
  };

  const handleBackToHome = () => {
    setCurrentView('home');
  };

  const handleGoToAuth = () => {
    setCurrentView('auth');
  };

  // Loading state while Firebase restores session
  if (loading) {
    return (
      <div className="app-loading-screen">
        <div className="loading-logo-box">
          <Film size={36} className="text-white animate-pulse" />
        </div>
        <p className="loading-text">Iniciando Montage Pro Studio...</p>
      </div>
    );
  }

  // If user explicitly navigated to the Auth screen
  if (currentView === 'auth') {
    return (
      <AuthPage
        onContinueGuest={() => setCurrentView('home')}
      />
    );
  }

  return (
    <ErrorBoundary onReset={() => setCurrentView('home')}>
      <div className="app-root">
        {currentView === 'home' ? (
          <HomePage
            onOpenProject={handleOpenProject}
            currentDirHandle={currentDirHandle}
            setCurrentDirHandle={handleUpdateDirHandle}
            onGoToAuth={handleGoToAuth}
          />
        ) : (
          <EditorPage
            key={activeProject?.id || 'editor-instance'}
            initialProject={activeProject}
            onBackToHome={handleBackToHome}
            currentDirHandle={currentDirHandle}
            onGoToAuth={handleGoToAuth}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <MainAppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
