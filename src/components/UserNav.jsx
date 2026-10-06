import React, { useState, useRef, useEffect } from 'react';
import {
  User,
  LogIn,
  LogOut,
  ChevronDown,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuthModal } from './AuthModal';

export const UserNav = React.memo(function UserNav({ onGoToAuth }) {
  const { user, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenAuth = (mode) => {
    if (onGoToAuth) {
      onGoToAuth();
      return;
    }
    setAuthMode(mode);
    setShowAuthModal(true);
    setShowDropdown(false);
  };

  const handleLogout = async () => {
    try {
      await logout();
      setShowDropdown(false);
      if (onGoToAuth) onGoToAuth();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Get user display label and initials
  const getDisplayName = () => {
    if (!user) return '';
    return user.displayName || user.email?.split('@')[0] || 'Usuario';
  };

  const getInitials = () => {
    if (!user) return 'U';
    if (user.displayName) {
      const parts = user.displayName.trim().split(' ');
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return parts[0].substring(0, 2).toUpperCase();
    }
    if (user.email) {
      return user.email.substring(0, 2).toUpperCase();
    }
    return 'U';
  };

  return (
    <>
      <div className="user-nav-container" ref={dropdownRef}>
        {!user ? (
          <button
            className="btn-secondary btn-sm user-nav-login-btn"
            onClick={() => handleOpenAuth('login')}
            title="Iniciar sesión con tu correo en Firebase"
          >
            <LogIn size={15} className="text-indigo" />
            <span>Iniciar Sesión</span>
          </button>
        ) : (
          <div className="user-nav-profile-wrapper">
            <button
              className="user-nav-profile-btn"
              onClick={() => setShowDropdown(!showDropdown)}
              title="Cuenta de usuario"
            >
              <div className="user-nav-avatar">
                {getInitials()}
              </div>
              <span className="user-nav-name">{getDisplayName()}</span>
              <ChevronDown size={14} className={`user-nav-chevron ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showDropdown && (
              <div className="user-nav-dropdown-menu">
                <div className="dropdown-user-header">
                  <div className="dropdown-avatar-large">
                    {getInitials()}
                  </div>
                  <div className="dropdown-user-details">
                    <span className="dropdown-user-name">{getDisplayName()}</span>
                    <span className="dropdown-user-email" title={user.email}>{user.email}</span>
                  </div>
                </div>

                <div className="dropdown-cloud-badge">
                  <ShieldCheck size={13} className="text-emerald" />
                  <span>Conectado a Firebase</span>
                </div>

                <div className="dropdown-divider"></div>

                <button
                  className="dropdown-menu-item dropdown-logout-btn"
                  onClick={handleLogout}
                >
                  <LogOut size={15} />
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        initialMode={authMode}
      />
    </>
  );
});
