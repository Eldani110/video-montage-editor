import React, { useState } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function AuthModal({ isOpen, onClose, initialMode = 'login' }) {
  const { login, register, resetPassword, getFriendlyErrorMessage } = useAuth();

  const [mode, setMode] = useState(initialMode); // 'login' | 'register' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen) return null;

  const handleResetFields = () => {
    setError('');
    setSuccessMessage('');
  };

  const switchMode = (newMode) => {
    handleResetFields();
    setMode(newMode);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!email.trim()) {
      setError('Por favor ingresa tu correo electrónico.');
      return;
    }

    if (mode === 'reset') {
      try {
        setLoading(true);
        await resetPassword(email.trim());
        setSuccessMessage('¡Enlace de recuperación enviado! Revisa tu bandeja de entrada o spam.');
      } catch (err) {
        setError(getFriendlyErrorMessage(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password) {
      setError('Por favor ingresa tu contraseña.');
      return;
    }

    if (mode === 'register') {
      if (password.length < 6) {
        setError('La contraseña debe tener un mínimo de 6 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden.');
        return;
      }

      try {
        setLoading(true);
        await register(email.trim(), password, displayName.trim());
        onClose();
      } catch (err) {
        setError(getFriendlyErrorMessage(err));
      } finally {
        setLoading(false);
      }
    } else if (mode === 'login') {
      try {
        setLoading(true);
        await login(email.trim(), password);
        onClose();
      } catch (err) {
        setError(getFriendlyErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container auth-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="auth-icon-badge">
              {mode === 'login' && <LogIn size={20} className="text-indigo" />}
              {mode === 'register' && <UserPlus size={20} className="text-emerald" />}
              {mode === 'reset' && <KeyRound size={20} className="text-amber" />}
            </div>
            <div>
              <h3 className="modal-title">
                {mode === 'login' && 'Iniciar Sesión'}
                {mode === 'register' && 'Crear Cuenta'}
                {mode === 'reset' && 'Recuperar Contraseña'}
              </h3>
              <p className="modal-subtitle">
                {mode === 'login' && 'Accede con tu cuenta de correo a Montage Pro Studio'}
                {mode === 'register' && 'Crea tu usuario para acceder al ecosistema en la nube'}
                {mode === 'reset' && 'Te enviaremos un correo con instrucciones para restablecerla'}
              </p>
            </div>
          </div>
          <button className="btn-ghost icon-only" onClick={onClose} title="Cerrar">
            <X size={18} />
          </button>
        </div>

        {/* Tabs for Login / Register */}
        {mode !== 'reset' && (
          <div className="auth-tab-bar">
            <button
              type="button"
              className={`auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
              onClick={() => switchMode('login')}
            >
              Iniciar Sesión
            </button>
            <button
              type="button"
              className={`auth-tab-btn ${mode === 'register' ? 'active' : ''}`}
              onClick={() => switchMode('register')}
            >
              Crear Cuenta
            </button>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="auth-form-body">
          {error && (
            <div className="auth-alert auth-alert-error">
              <AlertCircle size={16} className="text-rose flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="auth-alert auth-alert-success">
              <CheckCircle2 size={16} className="text-emerald flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label">Nombre Completo o Apodo</label>
              <div className="auth-input-wrapper">
                <User size={16} className="auth-input-icon" />
                <input
                  type="text"
                  className="auth-input"
                  placeholder="Ej. Alex Creativo"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Correo Electrónico</label>
            <div className="auth-input-wrapper">
              <Mail size={16} className="auth-input-icon" />
              <input
                type="email"
                className="auth-input"
                placeholder="tu-correo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div className="form-group">
              <div className="auth-label-row">
                <label className="form-label">Contraseña</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    className="auth-forgot-link"
                    onClick={() => switchMode('reset')}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
              </div>
              <div className="auth-input-wrapper">
                <Lock size={16} className="auth-input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  required
                />
                <button
                  type="button"
                  className="auth-pw-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label">Confirmar Contraseña</label>
              <div className="auth-input-wrapper">
                <Lock size={16} className="auth-input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="Repite tu contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>
          )}

          <div className="auth-actions-group">
            <button
              type="submit"
              className="btn-primary auth-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  {mode === 'login' && <LogIn size={16} />}
                  {mode === 'register' && <UserPlus size={16} />}
                  {mode === 'reset' && <KeyRound size={16} />}
                  <span>
                    {mode === 'login' && 'Entrar al Estudio'}
                    {mode === 'register' && 'Crear mi Cuenta'}
                    {mode === 'reset' && 'Enviar Correo de Recuperación'}
                  </span>
                </>
              )}
            </button>

            {mode === 'reset' && (
              <button
                type="button"
                className="btn-ghost auth-back-btn"
                onClick={() => switchMode('login')}
              >
                Volver a Iniciar Sesión
              </button>
            )}
          </div>
        </form>

        {/* Footer Note */}
        <div className="auth-modal-footer">
          <Sparkles size={13} className="text-indigo" />
          <span>Tus proyectos y archivos multimedia continúan almacenados de forma local y segura en tu disco.</span>
        </div>
      </div>
    </div>
  );
}
