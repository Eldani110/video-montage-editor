import React, { useState, useEffect } from 'react';
import { HomePage } from './components/HomePage';
import { EditorPage } from './components/EditorPage';
import { AuthPage } from './components/AuthPage';
import { UpdateNotificationBanner } from './components/UpdateNotificationBanner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RouterProvider, useRouter } from './context/RouterContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Film, AlertCircle, RefreshCw, FolderPlus, ArrowLeft } from 'lucide-react';
import {
  getCachedProject,
  saveProjectToCache,
  getStoredDirectoryHandle,
  saveStoredDirectoryHandle
} from './utils/storage';
import { normalizeProject } from './utils/timelineOps';
import { createNewProjectTemplate } from './utils/sampleData';
import './App.css';

function MainAppContent() {
  const { user, loading: authLoading } = useAuth();
  const { route, projectId, navigate, goToHome, goToProject, goToAuth } = useRouter();

  const [activeProject, setActiveProject] = useState(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [projectLoadError, setProjectLoadError] = useState(null);
  const [currentDirHandle, setCurrentDirHandle] = useState(null);

  // If user logs in while on auth screen, return to projects or previous route
  useEffect(() => {
    if (user && route === 'auth') {
      goToHome();
    }
  }, [user, route, goToHome]);

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

  // Synchronize route `/project/:id` with project state:
  // Loads project by ID from IndexedDB or localStorage backup if opened directly or refreshed
  useEffect(() => {
    if (route !== 'project' || !projectId) {
      setLoadingProject(false);
      setProjectLoadError(null);
      return;
    }

    // Already loaded in memory and matches current URL
    if (activeProject && (activeProject.id === projectId || activeProject.fileName === projectId)) {
      setLoadingProject(false);
      setProjectLoadError(null);
      return;
    }

    let isMounted = true;
    async function loadProjectFromRoute() {
      setLoadingProject(true);
      setProjectLoadError(null);

      // Special convenience route: `/project/new` generates and saves a blank template
      if (projectId === 'new') {
        try {
          const newProj = createNewProjectTemplate('Nuevo Proyecto');
          await saveProjectToCache(newProj);
          if (isMounted) {
            setActiveProject(normalizeProject(newProj));
            setLoadingProject(false);
            navigate(`/project/${newProj.id}`, { replace: true });
          }
        } catch (createErr) {
          console.error('Error creating new project from route:', createErr);
          if (isMounted) {
            setProjectLoadError('No se pudo inicializar un nuevo proyecto.');
            setLoadingProject(false);
          }
        }
        return;
      }

      try {
        // 1. IndexedDB lookup
        let loaded = await getCachedProject(projectId);

        // 2. localStorage backup fallback
        if (!loaded && typeof localStorage !== 'undefined') {
          const rawBackup = localStorage.getItem('montage_cached_projects_backup');
          if (rawBackup) {
            try {
              const list = JSON.parse(rawBackup);
              const found = list.find(p => p && (p.id === projectId || p.fileName === projectId));
              if (found) loaded = found;
            } catch (_) {}
          }
          if (!loaded) {
            const curRaw = localStorage.getItem('montage_current_project');
            if (curRaw) {
              try {
                const cur = JSON.parse(curRaw);
                if (cur && (cur.id === projectId || cur.fileName === projectId)) loaded = cur;
              } catch (_) {}
            }
          }
        }

        if (isMounted) {
          if (loaded) {
            const normalized = normalizeProject(loaded);
            setActiveProject(normalized);
            try {
              localStorage.setItem('montage_last_active_project_id', normalized.id);
            } catch (_) {}
          } else {
            setProjectLoadError(`No se encontró el proyecto con ID "${projectId}". Puede haber sido eliminado o creado en otro navegador.`);
          }
          setLoadingProject(false);
        }
      } catch (err) {
        console.error('Error loading project for route:', err);
        if (isMounted) {
          setProjectLoadError('Ocurrió un error inesperado al leer el proyecto desde la base de datos local.');
          setLoadingProject(false);
        }
      }
    }

    loadProjectFromRoute();
    return () => { isMounted = false; };
  }, [route, projectId, activeProject, navigate]);

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
    goToProject(normalized.id);
  };

  // Loading state while Firebase restores auth session
  if (authLoading) {
    return (
      <div className="app-loading-screen">
        <div className="loading-logo-box">
          <Film size={36} className="text-white animate-pulse" />
        </div>
        <p className="loading-text">Iniciando Montage Pro Studio...</p>
      </div>
    );
  }

  // 1. Auth View: `/auth` or `/login`
  if (route === 'auth') {
    return (
      <AuthPage
        onContinueGuest={goToHome}
      />
    );
  }

  // 2. Project Editor Loading State
  if (route === 'project' && loadingProject) {
    return (
      <div className="app-loading-screen" style={{ background: '#1d1d1d' }}>
        <div className="loading-logo-box">
          <Film size={36} className="text-white animate-pulse" />
        </div>
        <p className="loading-text">Cargando proyecto...</p>
        <span style={{ fontSize: '11px', color: '#787878' }}>ID: {projectId}</span>
      </div>
    );
  }

  // 3. Project Not Found Error State: `/project/:id` where ID does not exist
  if (route === 'project' && projectLoadError) {
    return (
      <div className="app-loading-screen" style={{ background: '#1d1d1d', gap: '16px' }}>
        <div className="loading-logo-box" style={{ background: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.35)' }}>
          <AlertCircle size={32} style={{ color: '#ef4444' }} />
        </div>
        <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '18px', fontWeight: 700 }}>
          Proyecto no encontrado
        </h3>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px', maxWidth: '440px', textAlign: 'center', lineHeight: 1.5 }}>
          {projectLoadError}
        </p>
        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
          <button className="btn-secondary btn-sm" onClick={goToHome} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={14} />
            Volver a Mis Proyectos
          </button>
          <button className="btn-primary btn-sm" onClick={() => goToProject('new')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FolderPlus size={14} />
            Crear Nuevo Proyecto
          </button>
        </div>
      </div>
    );
  }

  // 4. Main Views: Home (`/` or `/projects`) vs Project Editor (`/project/:id`)
  return (
    <ErrorBoundary onReset={goToHome}>
      <div className="app-root">
        {route === 'project' && activeProject ? (
          <EditorPage
            key={activeProject.id || projectId || 'editor-instance'}
            initialProject={activeProject}
            onBackToHome={goToHome}
            currentDirHandle={currentDirHandle}
            onGoToAuth={goToAuth}
          />
        ) : (
          <HomePage
            onOpenProject={handleOpenProject}
            currentDirHandle={currentDirHandle}
            setCurrentDirHandle={handleUpdateDirHandle}
            onGoToAuth={goToAuth}
          />
        )}
        <UpdateNotificationBanner />
      </div>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <RouterProvider>
        <AuthProvider>
          <MainAppContent />
        </AuthProvider>
      </RouterProvider>
    </ErrorBoundary>
  );
}
