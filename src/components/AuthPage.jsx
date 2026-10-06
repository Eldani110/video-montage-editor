import React, { useState } from 'react';
import {
  Film,
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
  Sparkles,
  Layers,
  HardDrive,
  ShieldCheck,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function AuthPage({ onContinueGuest }) {
  const { login, register, resetPassword, getFriendlyErrorMessage } = useAuth();

  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const switchMode = (newMode) => {
    setError('');
    setSuccessMessage('');
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
      } catch (err) {
        setError(getFriendlyErrorMessage(err));
      } finally {
        setLoading(false);
      }
    } else if (mode === 'login') {
      try {
        setLoading(true);
        await login(email.trim(), password);
      } catch (err) {
        setError(getFriendlyErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="auth-page-root">
      {/* Background Ambient Glows */}
      <div className="auth-bg-glow glow-1" />
      <div className="auth-bg-glow glow-2" />

      <div className="auth-page-container">
        {/* Left Side: Brand Showcase & Features */}
        <div className="auth-hero-column">
          <div className="auth-hero-header">
            <div className="brand-logo-large">
              <Film size={34} className="text-white" />
            </div>
            <div>
              <h1 className="auth-brand-name">Montage Pro Studio</h1>
              <p className="auth-brand-tagline">Editor de Video Inteligente para Creadores</p>
            </div>
          </div>

          <div className="auth-hero-main">
            <h2 className="auth-hero-title">
              Crea montajes de alto impacto <br />
              <span className="text-gradient-purple">a la velocidad de tus ideas.</span>
            </h2>
            <p className="auth-hero-desc">
              Organiza tus secuencias, transcribe audio con IA en tu equipo y sincroniza tu perfil en la nube de forma segura.
            </p>

            <div className="auth-feature-list">
              <div className="auth-feature-item">
                <div className="feature-icon-circle bg-indigo">
                  <Layers size={18} className="text-indigo" />
                </div>
                <div>
                  <h4 className="feature-title">Línea de Tiempo Multipista</h4>
                  <p className="feature-desc">Edición no lineal con pistas fijas de guion IA y capas dinámicas de video y audio.</p>
                </div>
              </div>

              <div className="auth-feature-item">
                <div className="feature-icon-circle bg-cyan">
                  <Sparkles size={18} className="text-cyan" />
                </div>
                <div>
                  <h4 className="feature-title">Director de Escenas IA</h4>
                  <p className="feature-desc">Detección y segmentación visual automática de tu guion para acelerar el ritmo del montaje.</p>
                </div>
              </div>

              <div className="auth-feature-item">
                <div className="feature-icon-circle bg-emerald">
                  <HardDrive size={18} className="text-emerald" />
                </div>
                <div>
                  <h4 className="feature-title">Tus Proyectos se Quedan en tu Disco</h4>
                  <p className="feature-desc">100% privacidad y máximo rendimiento local. Tus archivos pesados nunca se suben sin tu permiso.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="auth-hero-footer">
            <div className="auth-security-badge">
              <ShieldCheck size={16} className="text-emerald" />
              <span>Autenticación y seguridad de cuenta protegida por Firebase</span>
            </div>
          </div>
        </div>

        {/* Right Side: Authentication Card */}
        <div className="auth-form-column">
          <div className="auth-card">
            {/* Card Header */}
            <div className="auth-card-header">
              <div className="auth-card-title-group">
                <div className="auth-badge-icon">
                  {mode === 'login' && <LogIn size={20} className="text-indigo" />}
                  {mode === 'register' && <UserPlus size={20} className="text-emerald" />}
                  {mode === 'reset' && <KeyRound size={20} className="text-amber" />}
                </div>
                <div>
                  <h3 className="auth-card-title">
                    {mode === 'login' && 'Iniciar Sesión'}
                    {mode === 'register' && 'Crear Cuenta'}
                    {mode === 'reset' && 'Recuperar Contraseña'}
                  </h3>
                  <p className="auth-card-subtitle">
                    {mode === 'login' && 'Ingresa tus credenciales para acceder al estudio'}
                    {mode === 'register' && 'Regístrate con tu correo para empezar a crear'}
                    {mode === 'reset' && 'Ingresa tu correo para recibir el enlace de cambio'}
                  </p>
                </div>
              </div>
            </div>

            {/* Mode Switcher Tabs */}
            {mode !== 'reset' && (
              <div className="auth-page-tabs">
                <button
                  type="button"
                  className={`auth-page-tab ${mode === 'login' ? 'active' : ''}`}
                  onClick={() => switchMode('login')}
                >
                  <LogIn size={15} />
                  <span>Iniciar Sesión</span>
                </button>
                <button
                  type="button"
                  className={`auth-page-tab ${mode === 'register' ? 'active' : ''}`}
                  onClick={() => switchMode('register')}
                >
                  <UserPlus size={15} />
                  <span>Crear Cuenta</span>
                </button>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="auth-card-form">
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
                      placeholder="Ej. Alex Creador"
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
                      placeholder="Repite la contraseña"
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
                      <span>Conectando...</span>
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
                      <ArrowRight size={15} />
                    </>
                  )}
                </button>

                {mode === 'reset' && (
                  <button
                    type="button"
                    className="btn-ghost auth-back-btn"
                    onClick={() => switchMode('login')}
                  >
                    <ArrowLeft size={14} />
                    <span>Volver a Iniciar Sesión</span>
                  </button>
                )}
              </div>
            </form>

            {/* Guest / Offline Local Option */}
            {onContinueGuest && (
              <div className="auth-guest-section">
                <div className="auth-or-divider">
                  <span>o bien</span>
                </div>
                <button
                  type="button"
                  className="btn-secondary auth-guest-btn"
                  onClick={onContinueGuest}
                  title="Continuar usando el editor localmente sin iniciar sesión"
                >
                  <HardDrive size={15} className="text-indigo" />
                  <span>Continuar en Modo Local (Sin cuenta)</span>
                </button>
              </div>
            )}

            <div className="auth-card-footer-note">
              <Sparkles size={13} className="text-indigo" />
              <span>Tus proyectos y archivos multimedia siempre se guardan de forma local y segura en tu equipo.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
