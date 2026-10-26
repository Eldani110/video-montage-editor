import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const RouterContext = createContext(null);

/**
 * Parses pathname and search parameters into structured route metadata.
 * Supported URL schemas:
 * - / or /projects or /home -> { route: 'home', projectId: null }
 * - /auth or /login -> { route: 'auth', projectId: null }
 * - /project/:id or /editor/:id or /p/:id -> { route: 'project', projectId: id }
 */
export function parseRoute(pathname, search = (typeof window !== 'undefined' ? window.location.search : '')) {
  let cleanPath = pathname || '/';
  if (cleanPath.length > 1 && cleanPath.endsWith('/')) {
    cleanPath = cleanPath.slice(0, -1);
  }

  const queryParams = new URLSearchParams(search);

  // 1. Auth routes
  if (cleanPath === '/auth' || cleanPath === '/login') {
    return {
      route: 'auth',
      projectId: null,
      pathname: cleanPath,
      search: search || '',
      queryParams
    };
  }

  // 2. Project / Editor routes: /project/:id, /editor/:id, /p/:id
  const projectMatch = cleanPath.match(/^\/(?:project|editor|p)\/([^/]+)/i);
  if (projectMatch) {
    const rawId = decodeURIComponent(projectMatch[1]);
    return {
      route: 'project',
      projectId: rawId,
      pathname: cleanPath,
      search: search || '',
      queryParams
    };
  }

  // 3. Default: Home / Projects Dashboard
  return {
    route: 'home',
    projectId: null,
    pathname: cleanPath === '/' ? '/projects' : cleanPath,
    search: search || '',
    queryParams
  };
}

export function RouterProvider({ children }) {
  const [currentLocation, setCurrentLocation] = useState(() => ({
    pathname: typeof window !== 'undefined' ? window.location.pathname : '/',
    search: typeof window !== 'undefined' ? window.location.search : ''
  }));

  // Listen to browser Back/Forward (popstate)
  useEffect(() => {
    const handlePopState = () => {
      setCurrentLocation({
        pathname: window.location.pathname,
        search: window.location.search
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const routeInfo = useMemo(() => {
    return parseRoute(currentLocation.pathname, currentLocation.search);
  }, [currentLocation.pathname, currentLocation.search]);

  /**
   * Programmatic navigation: pushes or replaces history entry and updates route state synchronously
   */
  const navigate = useCallback((to, options = {}) => {
    if (typeof window === 'undefined') return;

    const { replace = false, state = null } = options;
    let targetPath = to;

    // Handle relative or full path
    if (!targetPath.startsWith('/') && !targetPath.startsWith('http')) {
      targetPath = '/' + targetPath;
    }

    const url = new URL(targetPath, window.location.origin);
    const newPath = url.pathname;
    const newSearch = url.search;

    if (
      window.location.pathname !== newPath ||
      window.location.search !== newSearch
    ) {
      if (replace) {
        window.history.replaceState(state, '', url.pathname + url.search);
      } else {
        window.history.pushState(state, '', url.pathname + url.search);
      }
    }

    setCurrentLocation({
      pathname: newPath,
      search: newSearch
    });
  }, []);

  const goToHome = useCallback(() => {
    navigate('/projects');
  }, [navigate]);

  const goToProject = useCallback((projectId, queryParams = {}, options = {}) => {
    if (!projectId) return;
    const searchStr = new URLSearchParams(queryParams).toString();
    const target = `/project/${encodeURIComponent(projectId)}${searchStr ? '?' + searchStr : ''}`;
    navigate(target, options);
  }, [navigate]);

  const goToAuth = useCallback(() => {
    navigate('/auth');
  }, [navigate]);

  const setQueryParam = useCallback((key, value, options = { replace: true }) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (value === null || value === undefined || value === '') {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
    navigate(url.pathname + url.search, options);
  }, [navigate]);

  const copyShareUrl = useCallback((projectId = null) => {
    if (typeof window === 'undefined') return '';
    const targetId = projectId || routeInfo.projectId;
    const fullUrl = targetId
      ? `${window.location.origin}/project/${encodeURIComponent(targetId)}`
      : window.location.href;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fullUrl);
      }
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
    return fullUrl;
  }, [routeInfo.projectId]);

  const value = useMemo(() => ({
    ...routeInfo,
    navigate,
    goToHome,
    goToProject,
    goToAuth,
    setQueryParam,
    copyShareUrl
  }), [routeInfo, navigate, goToHome, goToProject, goToAuth, setQueryParam, copyShareUrl]);

  return (
    <RouterContext.Provider value={value}>
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter() {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
}

/**
 * Accessible, SEO-friendly link component that renders an <a href="..."> tag.
 * Performs SPA navigation on standard click, while allowing browser-native
 * Ctrl+Click, Cmd+Click, middle-click, and right-click "Open in new tab".
 */
export function Link({
  to,
  children,
  className,
  style,
  onClick,
  replace = false,
  target,
  rel,
  ...rest
}) {
  const { navigate } = useRouter();

  const handleClick = (e) => {
    if (onClick) onClick(e);

    // If external link or target is set, let default browser behavior handle it
    if (target && target !== '_self') return;
    if (to.startsWith('http://') || to.startsWith('https://')) return;

    // Only intercept unadorned primary left-clicks
    if (
      !e.defaultPrevented &&
      e.button === 0 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.shiftKey &&
      !e.altKey
    ) {
      e.preventDefault();
      navigate(to, { replace });
    }
  };

  return (
    <a
      href={to}
      className={className}
      style={style}
      onClick={handleClick}
      target={target}
      rel={rel}
      {...rest}
    >
      {children}
    </a>
  );
}
