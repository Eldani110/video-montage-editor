import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Cpu,
  Key,
  Globe,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Brain,
  Sparkles,
  ExternalLink,
  Sliders,
  Send,
  Loader2,
  HardDrive,
  Film,
  Download,
  Search,
  ShieldCheck,
  FolderSearch,
  Cloud,
  Laptop,
  Monitor,
  Check,
  DownloadCloud,
  ArrowUpCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getCurrentDeviceInfo } from '../services/deviceService';
import { saveUserGeneralSettings, saveDeviceMediaDir, getUserDevices, loadUserSettings, STORAGE_KEY_GEMINI } from '../services/userSettingsService';
import { isElectronDesktop, pickDesktopFolder } from '../services/localProjectService';
import { getAutosaveConfig, saveAutosaveConfig } from '../utils/autosaveConfig';
import { FolderPickerModal } from './FolderPickerModal';
import {
  getSavedAiConfig,
  saveAiConfig,
  fetchAvailableModels,
  sendAiChatCompletion,
  PROVIDER_PRESETS
} from '../utils/aiClient';
import {
  getSavedStockConfig,
  saveStockConfig,
  getStorageDiskInfo,
  searchStockMedia,
  getDiskMediaFolders,
  updateBaseMediaDir
} from '../utils/stockMediaClient';

export function GlobalSettingsModal({ isOpen, onClose }) {
  const { user } = useAuth();
  const [config, setConfig] = useState(getSavedAiConfig());
  const [stockConfig, setStockConfig] = useState(getSavedStockConfig());
  const [autosaveConfig, setAutosaveConfig] = useState(getAutosaveConfig);
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    return typeof localStorage !== 'undefined' ? (localStorage.getItem(STORAGE_KEY_GEMINI) || '') : '';
  });
  const [currentDevice, setCurrentDevice] = useState(null);
  const [userDevices, setUserDevices] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [diskInfo, setDiskInfo] = useState(null);
  const [diskFolders, setDiskFolders] = useState([]);
  const [baseDirInput, setBaseDirInput] = useState('');
  const [isUpdatingBaseDir, setIsUpdatingBaseDir] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isTestingStock, setIsTestingStock] = useState(false);
  const [stockTestResult, setStockTestResult] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('ai'); // 'ai' | 'stock' | 'storage' | 'updates'
  const [isManualModel, setIsManualModel] = useState(false);
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateCheckResult, setUpdateCheckResult] = useState(null);
  const [liveUpdateStatus, setLiveUpdateStatus] = useState(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then(v => {
        if (v) setAppVersion(v);
      }).catch(() => {});
    }
    if (typeof window !== 'undefined' && window.electronAPI?.getUpdateStatus) {
      window.electronAPI.getUpdateStatus().then(st => {
        if (st) setLiveUpdateStatus(st);
      }).catch(() => {});
    }
    if (typeof window !== 'undefined' && window.electronAPI?.onUpdateStatus) {
      const unsub = window.electronAPI.onUpdateStatus(data => {
        if (data) setLiveUpdateStatus(data);
      });
      return () => {
        if (typeof unsub === 'function') unsub();
      };
    }
  }, []);

  const handleCheckUpdatesManually = async () => {
    if (!window.electronAPI?.checkForUpdates) {
      setUpdateCheckResult({
        type: 'info',
        message: 'Las actualizaciones automáticas en segundo plano están activas en las versiones empaquetadas de escritorio (Windows, Linux, macOS).'
      });
      return;
    }
    setCheckingUpdates(true);
    setUpdateCheckResult(null);
    try {
      const res = await window.electronAPI.checkForUpdates();
      if (res?.status === 'dev-mode') {
        setUpdateCheckResult({
          type: 'info',
          message: 'Modo desarrollo activo: En producción empaquetada, la app consulta directamente GitHub Releases y descarga la actualización automáticamente.'
        });
      } else if (res?.success) {
        setUpdateCheckResult({
          type: 'success',
          message: res.version
            ? `Versión encontrada en GitHub Releases: v${res.version}. Si es más reciente que v${appVersion}, se descargará automáticamente.`
            : 'Comprobación enviada a GitHub Releases con éxito. Si hay una nueva versión, se descargará en segundo plano.'
        });
      } else {
        setUpdateCheckResult({
          type: 'info',
          message: res?.error || 'Tu aplicación está en la versión más reciente.'
        });
      }
    } catch (err) {
      setUpdateCheckResult({
        type: 'error',
        message: err?.message || 'Error al conectar con GitHub Releases'
      });
    } finally {
      setCheckingUpdates(false);
    }
  };


  useEffect(() => {
    if (isOpen) {
      setConfig(getSavedAiConfig());
      setStockConfig(getSavedStockConfig());
      setAutosaveConfig(getAutosaveConfig());
      if (typeof localStorage !== 'undefined') {
        setGeminiApiKey(localStorage.getItem(STORAGE_KEY_GEMINI) || '');
      }
      setTestResult(null);
      setStockTestResult(null);
      setErrorMessage(null);

      // Refresh from Cloud Firestore and local disk backup
      loadUserSettings(user).then(loaded => {
        if (loaded) {
          setConfig(getSavedAiConfig());
          setStockConfig(getSavedStockConfig());
          setAutosaveConfig(getAutosaveConfig());
          if (typeof localStorage !== 'undefined') {
            setGeminiApiKey(localStorage.getItem(STORAGE_KEY_GEMINI) || '');
          }
        }
      }).catch(err => {
        console.warn('[GlobalSettingsModal] Error loading cloud settings:', err);
      });

      getCurrentDeviceInfo().then(dev => setCurrentDevice(dev));
      if (user) {
        getUserDevices(user).then(devs => setUserDevices(devs));
      }
      getStorageDiskInfo().then(info => {
        setDiskInfo(info);
        const userSavedDir = typeof localStorage !== 'undefined' ? localStorage.getItem('montage_device_local_dir') : null;
        if (user && userSavedDir) {
          setBaseDirInput(userSavedDir);
        } else if (!user) {
          setBaseDirInput('');
        } else if (info?.mediaDir) {
          setBaseDirInput(info.mediaDir);
        }
      });
      getDiskMediaFolders().then(folders => setDiskFolders(folders));
      setSuccessMessage(null);
    }

    const handleSettingsSynced = () => {
      setConfig(getSavedAiConfig());
      setStockConfig(getSavedStockConfig());
      setAutosaveConfig(getAutosaveConfig());
      if (typeof localStorage !== 'undefined') {
        setGeminiApiKey(localStorage.getItem(STORAGE_KEY_GEMINI) || '');
      }
    };
    window.addEventListener('montage_user_settings_synced', handleSettingsSynced);
    return () => {
      window.removeEventListener('montage_user_settings_synced', handleSettingsSynced);
    };
  }, [isOpen, user]);

  if (!isOpen) return null;

  const currentPreset = PROVIDER_PRESETS.find(p => p.id === config.provider) || PROVIDER_PRESETS[0];

  const updateActiveProviderConfig = (updates) => {
    setConfig(prev => {
      const activeProvider = prev.provider || 'ollama_cloud';
      const currentConfigs = prev.providerConfigs || {};
      const activeProviderData = {
        ...(currentConfigs[activeProvider] || {}),
        apiKey: updates.apiKey !== undefined ? updates.apiKey : prev.apiKey,
        baseUrl: updates.baseUrl !== undefined ? updates.baseUrl : prev.baseUrl,
        selectedModel: updates.selectedModel !== undefined ? updates.selectedModel : prev.selectedModel,
        availableModels: updates.availableModels !== undefined ? updates.availableModels : prev.availableModels
      };
      return {
        ...prev,
        ...updates,
        providerConfigs: {
          ...currentConfigs,
          [activeProvider]: activeProviderData
        }
      };
    });
  };

  const handleProviderChange = (newProviderId) => {
    const preset = PROVIDER_PRESETS.find(p => p.id === newProviderId) || PROVIDER_PRESETS[0];

    // 1. Snapshot current provider's settings into providerConfigs
    const activeProviderId = config.provider || 'ollama_cloud';
    const updatedProviderConfigs = {
      ...(config.providerConfigs || {}),
      [activeProviderId]: {
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        selectedModel: config.selectedModel,
        availableModels: config.availableModels
      }
    };

    // 2. Load settings for the new target provider
    const targetData = updatedProviderConfigs[newProviderId] || {};
    const targetBaseUrl = targetData.baseUrl || preset.defaultUrl;
    const targetApiKey = targetData.apiKey !== undefined ? targetData.apiKey : '';
    const targetAvailableModels = (Array.isArray(targetData.availableModels) && targetData.availableModels.length > 0)
      ? targetData.availableModels
      : (preset.defaultModels.length > 0 ? preset.defaultModels : []);
    const targetSelectedModel = targetData.selectedModel || (targetAvailableModels[0] || '');

    const newConfig = {
      ...config,
      provider: newProviderId,
      baseUrl: targetBaseUrl,
      apiKey: targetApiKey,
      selectedModel: targetSelectedModel,
      availableModels: targetAvailableModels,
      providerConfigs: updatedProviderConfigs
    };

    setConfig(newConfig);
    setErrorMessage(null);
    setSuccessMessage(null);
    setTestResult(null);
  };

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const models = await fetchAvailableModels(config.baseUrl, config.apiKey);
      const selected = models.includes(config.selectedModel) ? config.selectedModel : models[0];
      updateActiveProviderConfig({
        availableModels: models,
        selectedModel: selected
      });
      setSuccessMessage(`¡Conexión exitosa! Se encontraron ${models.length} modelos disponibles en tu API.`);
    } catch (err) {
      console.error('Error fetching models:', err);
      setErrorMessage(err.message || 'Error al conectar y listar modelos.');
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setErrorMessage(null);
    try {
      const start = Date.now();
      const res = await sendAiChatCompletion({
        systemPrompt: 'Eres un asistente breve.',
        userPrompt: 'Responde exactamente: "Conexión de IA verificada correctamente."',
        config,
        jsonMode: false
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      setTestResult({
        success: true,
        message: res.content || 'Conexión verificada',
        thinking: res.thinking,
        elapsed,
        model: res.model
      });
    } catch (err) {
      console.error('Test connection error:', err);
      setTestResult({
        success: false,
        error: err.message || 'No se pudo comunicar con el modelo.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestStockConnection = async () => {
    setIsTestingStock(true);
    setStockTestResult(null);
    try {
      const isWeb = stockConfig.preferredProvider === 'web';
      const res = await searchStockMedia({
        query: isWeb ? 'Steve Jobs Apple' : 'data center technology',
        type: isWeb ? 'image' : 'video',
        provider: stockConfig.preferredProvider,
        apiKey: stockConfig.preferredProvider === 'pexels' ? stockConfig.pexelsApiKey : stockConfig.pixabayApiKey,
        perPage: 3
      });
      setStockTestResult({
        success: true,
        count: res.results.length,
        provider: res.provider,
        hasApiKey: res.hasApiKey
      });
    } catch (err) {
      setStockTestResult({
        success: false,
        error: err.message
      });
    } finally {
      setIsTestingStock(false);
    }
  };

  const handleSaveBaseDir = async (e, explicitDir = null) => {
    e?.preventDefault();
    const targetDir = (explicitDir || baseDirInput).trim();
    if (!targetDir) return;
    setIsUpdatingBaseDir(true);
    setErrorMessage(null);
    try {
      const res = await saveDeviceMediaDir(user, targetDir);
      const activePath = res?.baseMediaDir || targetDir;
      setSuccessMessage(
        user
          ? `Ruta guardada y vinculada a este equipo (${currentDevice?.deviceName || 'Local'}) en tu cuenta: ${activePath}`
          : `Ruta base de medios actualizada a: ${activePath}`
      );
      const info = await getStorageDiskInfo();
      setDiskInfo(info);
      const folders = await getDiskMediaFolders();
      setDiskFolders(folders);
      if (user) {
        getUserDevices(user).then(devs => setUserDevices(devs));
      }
    } catch (err) {
      setErrorMessage(`Error al actualizar ruta: ${err.message}`);
    } finally {
      setIsUpdatingBaseDir(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const activeProvider = config.provider || 'ollama_cloud';
      const finalConfig = {
        ...config,
        providerConfigs: {
          ...(config.providerConfigs || {}),
          [activeProvider]: {
            apiKey: config.apiKey || '',
            baseUrl: config.baseUrl || '',
            selectedModel: config.selectedModel || '',
            availableModels: Array.isArray(config.availableModels) ? config.availableModels : []
          }
        }
      };

      await saveUserGeneralSettings(user, {
        aiConfig: finalConfig,
        stockConfig,
        autosaveConfig,
        geminiApiKey
      });
      setSuccessMessage(
        user
          ? 'Configuración guardada y sincronizada en tu cuenta en la nube para todos tus dispositivos.'
          : 'Configuración guardada localmente.'
      );
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      setErrorMessage(`Error al guardar configuración: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container modal-large">
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge" style={{ background: '#6366f126' }}>
              <Settings size={20} style={{ color: '#6366f1' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Configuración General del Editor</h3>
                {user ? (
                  <span className="badge badge-emerald" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Cloud size={11} /> Conectado ({user.email})
                  </span>
                ) : (
                  <span className="badge" style={{ fontSize: '11px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
                    Modo Local (Inicia sesión para guardar en la nube)
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0 0' }}>Gestiona la IA Agéntica Editora (DeepSeek, Ollama), Stock Media y almacenamiento por dispositivo</p>
            </div>
          </div>
          <button className="btn-ghost icon-only" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="settings-tab-bar" style={{ display: 'flex', gap: '8px', padding: '0 24px', borderBottom: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'ai' ? '2px solid #6366f1' : '2px solid transparent',
              color: activeTab === 'ai' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: 500,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <Brain size={15} style={{ color: '#8b5cf6' }} />
            IA Agéntica Editora (Cloud API)
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === 'stock' ? 'active' : ''}`}
            onClick={() => setActiveTab('stock')}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'stock' ? '2px solid #06b6d4' : '2px solid transparent',
              color: activeTab === 'stock' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: 500,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <Film size={15} style={{ color: '#06b6d4' }} />
            Stock Media & Descargas (Pexels / Pixabay)
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === 'storage' ? 'active' : ''}`}
            onClick={() => setActiveTab('storage')}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'storage' ? '2px solid #6366f1' : '2px solid transparent',
              color: activeTab === 'storage' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: 500,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <HardDrive size={15} style={{ color: '#10b981' }} />
            Almacenamiento Local & Privacidad
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === 'updates' ? 'active' : ''}`}
            onClick={() => setActiveTab('updates')}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'updates' ? '2px solid #8b5cf6' : '2px solid transparent',
              color: activeTab === 'updates' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: 500,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <DownloadCloud size={15} style={{ color: '#8b5cf6' }} />
            Actualizaciones & Sistema
          </button>
        </div>

        <div className="modal-form" style={{ maxHeight: 'calc(80vh - 150px)', overflowY: 'auto' }}>
          {errorMessage && (
            <div className="alert-box alert-error" style={{ marginBottom: '14px' }}>
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="alert-box alert-success" style={{ marginBottom: '14px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399' }}>
              <CheckCircle2 size={16} />
              <span>{successMessage}</span>
            </div>
          )}

          {activeTab === 'ai' && (
            <>
              {/* Provider Selection */}
              <div className="form-group">
                <label>Proveedor de IA / Endpoint Cloud</label>
                <div className="aspect-ratio-selector" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                  {PROVIDER_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`ratio-btn ${config.provider === p.id ? 'active' : ''}`}
                      onClick={() => handleProviderChange(p.id)}
                      style={{ padding: '8px 4px', minHeight: '64px' }}
                    >
                      <span className="ratio-label" style={{ fontSize: '11px', textAlign: 'center', lineHeight: 1.2 }}>{p.name}</span>
                      <span className="ratio-sub" style={{ fontSize: '9px', textAlign: 'center' }}>
                        {p.id === 'deepseek' ? 'DeepSeek R1 / V3' : (p.id === 'ollama_cloud' ? 'Cloud & Local' : 'Multi-modelo')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Endpoint URL & API Key */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Globe size={13} style={{ color: '#6366f1' }} /> URL Base del Endpoint
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="https://api.deepseek.com o https://ollama.com"
                    value={config.baseUrl}
                    onChange={(e) => updateActiveProviderConfig({ baseUrl: e.target.value })}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '3px' }}>
                    {currentPreset.description}
                  </span>
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Key size={13} style={{ color: '#f59e0b' }} /> Clave API (API Key)
                    </label>
                    {currentPreset.keyHelpUrl && (
                      <a
                        href={currentPreset.keyHelpUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: '11px', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '3px', textDecoration: 'none' }}
                      >
                        Obtener clave <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                  <input
                    type="password"
                    className="input-field"
                    placeholder={currentPreset.keyPlaceholder}
                    value={config.apiKey}
                    onChange={(e) => updateActiveProviderConfig({ apiKey: e.target.value })}
                    style={{ marginTop: '6px' }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '3px' }}>
                    {config.provider === 'ollama_cloud'
                      ? '✓ Las consultas a Ollama Cloud se canalizan por proxy local para evitar bloqueos CORS.'
                      : 'Se almacena de forma segura y privada en tu navegador.'}
                  </span>
                </div>
              </div>

              {/* Model Discovery & Selection */}
              <div className="form-group" style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Cpu size={14} style={{ color: '#06b6d4' }} /> Modelo de IA para Edición
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn-ghost btn-xs"
                      onClick={() => setIsManualModel(!isManualModel)}
                      style={{ fontSize: '11px', color: 'var(--text-secondary)' }}
                    >
                      {isManualModel ? '📋 Elegir de la lista' : '✏️ Escribir manual'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-xs"
                      onClick={handleFetchModels}
                      disabled={isFetchingModels || !config.baseUrl}
                      title="Consultar la API para obtener la lista actualizada de modelos disponibles"
                      style={{ background: 'rgba(6, 182, 212, 0.1)', borderColor: 'rgba(6, 182, 212, 0.3)', color: '#38bdf8' }}
                    >
                      <RefreshCw size={12} className={isFetchingModels ? 'spinner' : ''} />
                      {isFetchingModels ? 'Consultando API...' : 'Enlistar Todos los Modelos'}
                    </button>
                  </div>
                </div>

                {!isManualModel ? (
                  <select
                    className="input-field"
                    value={config.selectedModel}
                    onChange={(e) => updateActiveProviderConfig({ selectedModel: e.target.value })}
                    style={{ width: '100%', fontWeight: 500 }}
                  >
                    {(config.availableModels || []).map((m) => (
                      <option key={m} value={m}>
                        {m} {m.includes('reasoner') || m.includes('r1') ? '🧠 (Razonamiento / Thinking)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Escribe el nombre del modelo (ej. deepseek-v4-pro:0813, gemma4:31b)..."
                    value={config.selectedModel}
                    onChange={(e) => updateActiveProviderConfig({ selectedModel: e.target.value })}
                  />
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                    {config.availableModels?.length || 0} modelos en lista. Pulsa &quot;Enlistar Todos los Modelos&quot; para sincronizar con tu servidor.
                  </span>
                  {config.selectedModel && (
                    <span className="badge badge-emerald" style={{ fontSize: '10px' }}>
                      Activo: {config.selectedModel}
                    </span>
                  )}
                </div>
              </div>

              {/* DeepSeek Thinking / Reasoning Settings */}
              <div className="form-group" style={{ background: 'rgba(139, 92, 246, 0.05)', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(139, 92, 246, 0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Brain size={18} style={{ color: '#8b5cf6' }} />
                    <div>
                      <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                        Pensamiento Profundo (DeepSeek Thinking / Reasoning)
                      </strong>
                      <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                        Permite que el modelo analice y razone detalladamente la estructura y cortes antes de responder.
                      </p>
                    </div>
                  </div>

                  <label className="toggle-switch" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.enableThinking}
                      onChange={(e) => setConfig({ ...config, enableThinking: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: 500, color: config.enableThinking ? '#a78bfa' : 'var(--text-muted)' }}>
                      {config.enableThinking ? 'Activado' : 'Desactivado'}
                    </span>
                  </label>
                </div>

                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(139, 92, 246, 0.15)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Modo de Pensamiento Predeterminado:</label>
                    <select
                      className="input-field"
                      value={config.thinkingMode || (config.enableThinking ? (config.thinkingEffort === 'high' ? 'deep' : 'normal') : 'none')}
                      onChange={(e) => {
                        const val = e.target.value;
                        setConfig({
                          ...config,
                          thinkingMode: val,
                          enableThinking: val !== 'none',
                          thinkingEffort: val === 'deep' ? 'high' : 'low'
                        });
                      }}
                      style={{ height: '32px', fontSize: '12px' }}
                    >
                      <option value="none">⚡ Sin Pensamiento (Ultra Rápido, sin monólogo interno)</option>
                      <option value="normal">🧠 Pensamiento Normal (Recomendado - Ágil y conciso)</option>
                      <option value="deep">🔮 Ultra Profundo (Cinematográfico exhaustivo)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Temperatura Creativa ({config.temperature}):</label>
                    <input
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.05"
                      value={config.temperature}
                      onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                      style={{ width: '100%', accentColor: '#8b5cf6' }}
                    />
                  </div>
                </div>
              </div>

              {/* Connection Test & Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={handleTestConnection}
                  disabled={isTesting || !config.baseUrl}
                >
                  {isTesting ? <Loader2 size={13} className="spinner" /> : <Send size={13} />}
                  {isTesting ? 'Probando conexión...' : 'Probar Conexión con IA'}
                </button>

                {testResult && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                    {testResult.success ? (
                      <span className="badge badge-emerald">
                        <CheckCircle2 size={12} /> Conectado en {testResult.elapsed}s ({testResult.model})
                      </span>
                    ) : (
                      <span className="badge badge-danger" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                        <AlertCircle size={12} /> {testResult.error}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Thinking Result Preview (if tested) */}
              {testResult?.thinking && (
                <div style={{ background: 'rgba(139, 92, 246, 0.08)', borderRadius: '6px', padding: '10px', marginTop: '8px', fontSize: '11px' }}>
                  <div style={{ color: '#a78bfa', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Brain size={12} /> Pensamiento del Modelo Capturado:
                  </div>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                    {testResult.thinking}
                  </pre>
                </div>
              )}

              {/* Google Gemini API Key (Multimodal Audio Transcription & Subtitles) */}
              <div className="form-group" style={{ background: 'rgba(99, 102, 241, 0.05)', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(99, 102, 241, 0.25)', marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={14} style={{ color: '#818cf8' }} /> Clave API de Google Gemini (Transcripción & Subtítulos)
                  </label>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '11px', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '3px', textDecoration: 'none' }}
                  >
                    Obtener clave en Google AI Studio <ExternalLink size={10} />
                  </a>
                </div>
                <input
                  type="password"
                  className="input-field"
                  placeholder="AIzaSy..."
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  style={{ marginTop: '8px' }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
                  Sincronizada con tu cuenta en la nube. Se utiliza para generar transcripciones de audio y subtítulos automáticos en la línea de tiempo.
                </span>
              </div>
            </>
          )}

          {activeTab === 'stock' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Local Disk Folder Configuration */}
              <div style={{
                background: 'rgba(6, 182, 212, 0.06)',
                border: '1px solid rgba(6, 182, 212, 0.25)',
                borderRadius: '8px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#06b6d4', fontWeight: 600, fontSize: '13px' }}>
                    <HardDrive size={15} />
                    <span>Ruta Base en Disco ({currentDevice?.deviceName || 'Este Dispositivo'}):</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {user && (
                      <span className="badge badge-indigo" style={{ fontSize: '10px' }}>
                        ✓ Guardada por dispositivo
                      </span>
                    )}
                    <span className="badge badge-emerald" style={{ fontSize: '10px' }}>
                      ✓ Subcarpetas por Proyecto
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="input-field"
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      color: '#38bdf8',
                      background: 'rgba(0,0,0,0.4)',
                      flex: 1
                    }}
                    value={baseDirInput}
                    onChange={(e) => setBaseDirInput(e.target.value)}
                    placeholder="/ruta/hacia/carpeta_de_medios"
                  />
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={async () => {
                      if (isElectronDesktop()) {
                        const nativeDir = await pickDesktopFolder();
                        if (nativeDir) {
                          setBaseDirInput(nativeDir);
                          handleSaveBaseDir(null, nativeDir);
                          return;
                        }
                      }
                      setShowFolderPicker(true);
                    }}
                    title="Explorar carpetas del disco"
                  >
                    <FolderSearch size={13} /> Elegir...
                  </button>
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    disabled={isUpdatingBaseDir || !baseDirInput.trim()}
                    onClick={handleSaveBaseDir}
                  >
                    {isUpdatingBaseDir ? <Loader2 size={13} className="animate-spin" /> : 'Guardar Ruta'}
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  <span>
                    Espacio total ocupado: <strong>{diskInfo?.formattedSize || '0.00 MB'}</strong> ({diskInfo?.totalFiles || 0} archivos en {diskFolders.length} carpetas)
                  </span>
                  <span style={{ color: '#10b981' }}>
                    ✓ Streaming con HTTP Range habilitado
                  </span>
                </div>

                {/* List of project subfolders */}
                {diskFolders.length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                      Carpetas de proyectos detectadas en disco:
                    </span>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                      gap: '6px',
                      maxHeight: '120px',
                      overflowY: 'auto'
                    }}>
                      {diskFolders.map((df) => (
                        <div
                          key={df.name}
                          style={{
                            background: 'rgba(0,0,0,0.3)',
                            padding: '6px 10px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-subtle)',
                            fontSize: '11px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <span style={{ color: '#38bdf8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            📁 {df.name}
                          </span>
                          <span style={{ color: 'var(--text-dim)', fontSize: '10px', whiteSpace: 'nowrap', marginLeft: '6px' }}>
                            {df.fileCount} arch. ({df.formattedSize})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Provider Selection */}
              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>
                  Banco de Stock Predeterminado:
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <label style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: stockConfig.preferredProvider === 'pexels' ? '1px solid #06b6d4' : '1px solid var(--border-subtle)',
                    background: stockConfig.preferredProvider === 'pexels' ? 'rgba(6, 182, 212, 0.08)' : 'var(--bg-card)',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}>
                    <input
                      type="radio"
                      name="preferredProvider"
                      checked={stockConfig.preferredProvider === 'pexels'}
                      onChange={() => setStockConfig({ ...stockConfig, preferredProvider: 'pexels' })}
                    />
                    <div>
                      <strong style={{ display: 'block' }}>Pexels API (Recomendado)</strong>
                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Videos cinematográficos 4K y HD gratis</span>
                    </div>
                  </label>

                  <label style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: stockConfig.preferredProvider === 'pixabay' ? '1px solid #06b6d4' : '1px solid var(--border-subtle)',
                    background: stockConfig.preferredProvider === 'pixabay' ? 'rgba(6, 182, 212, 0.08)' : 'var(--bg-card)',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}>
                    <input
                      type="radio"
                      name="preferredProvider"
                      checked={stockConfig.preferredProvider === 'pixabay'}
                      onChange={() => setStockConfig({ ...stockConfig, preferredProvider: 'pixabay' })}
                    />
                    <div>
                      <strong style={{ display: 'block' }}>Pixabay API</strong>
                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Videos, fotos e ilustraciones libres</span>
                    </div>
                  </label>

                  <label style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: stockConfig.preferredProvider === 'web' ? '1px solid #06b6d4' : '1px solid var(--border-subtle)',
                    background: stockConfig.preferredProvider === 'web' ? 'rgba(6, 182, 212, 0.08)' : 'var(--bg-card)',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}>
                    <input
                      type="radio"
                      name="preferredProvider"
                      checked={stockConfig.preferredProvider === 'web'}
                      onChange={() => setStockConfig({ ...stockConfig, preferredProvider: 'web' })}
                    />
                    <div>
                      <strong style={{ display: 'block' }}>🌐 Búsqueda Web Abierta</strong>
                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Imágenes de toda la web. 100% libre sin API Keys</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Pexels API Key Input */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>
                    Clave API de Pexels:
                  </label>
                  <a
                    href="https://www.pexels.com/api/"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '11px', color: '#06b6d4', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                  >
                    Obtener clave gratis en pexels.com <ExternalLink size={10} />
                  </a>
                </div>
                <input
                  type="password"
                  value={stockConfig.pexelsApiKey || ''}
                  onChange={(e) => setStockConfig({ ...stockConfig, pexelsApiKey: e.target.value })}
                  placeholder="Ej: 563492ad6f91700001000001xxxxxxxxxxxxxxxxxxxx"
                  style={{ width: '100%', height: '36px', fontSize: '12px' }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Generación instantánea y gratuita. Permite hasta 20,000 solicitudes mensuales.
                </span>
              </div>

              {/* Pixabay API Key Input */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>
                    Clave API de Pixabay (Opcional):
                  </label>
                  <a
                    href="https://pixabay.com/api/docs/"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '11px', color: '#06b6d4', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                  >
                    Obtener clave Pixabay <ExternalLink size={10} />
                  </a>
                </div>
                <input
                  type="password"
                  value={stockConfig.pixabayApiKey || ''}
                  onChange={(e) => setStockConfig({ ...stockConfig, pixabayApiKey: e.target.value })}
                  placeholder="Ej: 12345678-abcdef12345678abcdef"
                  style={{ width: '100%', height: '36px', fontSize: '12px' }}
                />
              </div>

              {/* Target Track & Audio Behavior */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>
                    Tipo de Recursos (Formato):
                  </label>
                  <select
                    value={stockConfig.preferredMediaType || 'mixed'}
                    onChange={(e) => setStockConfig({ ...stockConfig, preferredMediaType: e.target.value })}
                    style={{ width: '100%', height: '36px', fontSize: '12px', borderRadius: '6px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                  >
                    <option value="mixed">⚡ Combinada (Híbrida)</option>
                    <option value="video">🎬 Solo Videos (MP4)</option>
                    <option value="image">🖼️ Solo Imágenes (Fotos HD)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>
                    Pista de Montaje Destino:
                  </label>
                  <select
                    value={stockConfig.targetTrack || 'v2'}
                    onChange={(e) => setStockConfig({ ...stockConfig, targetTrack: e.target.value })}
                    style={{ width: '100%', height: '36px', fontSize: '12px', borderRadius: '6px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                  >
                    <option value="v2">Pista V2 (B-Roll Overlay)</option>
                    <option value="v1">Pista V1 (Principal)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>
                    Orientación Predilecta:
                  </label>
                  <select
                    value={stockConfig.preferredOrientation || 'landscape'}
                    onChange={(e) => setStockConfig({ ...stockConfig, preferredOrientation: e.target.value })}
                    style={{ width: '100%', height: '36px', fontSize: '12px', borderRadius: '6px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                  >
                    <option value="landscape">Horizontal (16:9)</option>
                    <option value="portrait">Vertical (9:16)</option>
                  </select>
                </div>
              </div>

              {/* Test Stock API Button */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={handleTestStockConnection}
                  disabled={isTestingStock}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {isTestingStock ? <Loader2 size={13} className="spinner" /> : <Search size={13} />}
                  {isTestingStock ? 'Consultando catálogo de stock...' : 'Probar Búsqueda de Stock Media'}
                </button>

                {stockTestResult && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                    {stockTestResult.success ? (
                      <span className="badge badge-emerald">
                        <CheckCircle2 size={12} /> {stockTestResult.count} videos encontrados ({stockTestResult.provider})
                      </span>
                    ) : (
                      <span className="badge badge-danger" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                        <AlertCircle size={12} /> {stockTestResult.error}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'storage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Autosave Settings Card */}
              <div className="form-group" style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={16} className="text-emerald" />
                    Sistema de Autoguardado Continuo
                  </h4>
                  <button
                    type="button"
                    className={`switch-toggle ${autosaveConfig.enabled ? 'is-on' : ''}`}
                    onClick={() => {
                      const updated = saveAutosaveConfig({ enabled: !autosaveConfig.enabled });
                      setAutosaveConfig(updated);
                    }}
                    role="switch"
                    aria-checked={autosaveConfig.enabled}
                  >
                    <span className="switch-handle" />
                  </button>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                  Guarda automáticamente tus proyectos en la base de datos IndexedDB local y en el archivo .vproj en disco sin bloquear la interfaz.
                </p>
                {autosaveConfig.enabled && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Frecuencia de consolidación periódica:</span>
                    <div className="interval-buttons-group">
                      {[5, 15, 30, 60].map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`btn-interval ${autosaveConfig.intervalSeconds === s ? 'active' : ''}`}
                          onClick={() => {
                            const updated = saveAutosaveConfig({ intervalSeconds: s });
                            setAutosaveConfig(updated);
                          }}
                        >
                          {s}s
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Multi-Device Identification & Cloud Sync Card */}
              <div className="form-group" style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Laptop size={16} className="text-indigo" />
                    Identificación de Dispositivo & Sincronización en la Nube
                  </h4>
                  {currentDevice && (
                    <span className="badge badge-indigo" style={{ fontSize: '10px' }}>
                      {currentDevice.platformName}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                  Tu configuración de IA, modelos y preferencias persiste en la nube para tu cuenta. La carpeta de proyectos en disco se guarda de forma independiente para cada dispositivo para que cada máquina (Mac, Windows, Linux) conserve su ruta local óptima.
                </p>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '6px', fontSize: '12px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Dispositivo Actual:</span>
                    <strong style={{ color: '#38bdf8' }}>{currentDevice?.deviceName || 'Detectando...'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>ID de Dispositivo:</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-secondary)' }}>{currentDevice?.deviceId || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Carpeta Vinculada a este Equipo:</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#10b981' }}>
                      {user
                        ? (typeof localStorage !== 'undefined' && localStorage.getItem('montage_device_local_dir')
                            ? localStorage.getItem('montage_device_local_dir')
                            : 'Sin vincular')
                        : 'Sin vincular (modo invitado)'}
                    </span>
                  </div>
                </div>

                {user && userDevices.length > 0 && (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                      Dispositivos guardados en tu cuenta ({userDevices.length}):
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {userDevices.map(d => (
                        <div key={d.deviceId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: '4px', fontSize: '11px' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Monitor size={12} style={{ color: d.deviceId === currentDevice?.deviceId ? '#10b981' : '#818cf8' }} />
                            <span>{d.deviceName || d.deviceId}</span>
                            {d.deviceId === currentDevice?.deviceId && (
                              <span className="badge badge-emerald" style={{ fontSize: '9px', padding: '1px 4px' }}>Este equipo</span>
                            )}
                          </span>
                          <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                            {d.baseMediaDir || 'projects_media'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group" style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '13px' }}>Arquitectura 100% Local (Estilo Clipchamp)</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                  Todos los recursos multimedia, pistas de audio, videos y proyectos se almacenan en tu disco local a través de la API File System Access e IndexedDB de tu navegador. Ningún archivo de video se sube a servidores externos sin tu consentimiento.
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span className="badge badge-emerald">✓ Almacenamiento Local en Disco</span>
                  <span className="badge badge-indigo">✓ Exportación .vproj Compatible</span>
                </div>
              </div>

              <div className="form-group" style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '13px' }}>Claves API y Privacidad</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Tus claves API para DeepSeek, Ollama Cloud y Google Gemini se guardan exclusivamente en el almacenamiento local (LocalStorage) de tu propio navegador. No se comparten con intermediarios ni se envían a ningún servidor de terceros.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'updates' && (
            <div className="tab-pane" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div className="form-group" style={{ background: 'var(--bg-input)', padding: '18px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '10px',
                      background: 'rgba(99, 102, 241, 0.15)',
                      border: '1px solid rgba(99, 102, 241, 0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#818cf8'
                    }}>
                      <ArrowUpCircle size={24} />
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', color: 'var(--text-primary)' }}>
                        Montage Studio Desktop
                      </h4>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Versión instalada: <strong style={{ color: '#a5b4fc' }}>v{appVersion}</strong>
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleCheckUpdatesManually}
                    disabled={checkingUpdates}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 16px',
                      fontSize: '12.5px',
                      fontWeight: 600
                    }}
                  >
                    <RefreshCw size={14} className={checkingUpdates ? 'spin' : ''} />
                    {checkingUpdates ? 'Buscando...' : 'Buscar Actualizaciones'}
                  </button>
                </div>

                {liveUpdateStatus?.status === 'downloading' && (
                  <div style={{ marginTop: '14px', padding: '12px', background: 'rgba(99, 102, 241, 0.08)', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#c7d2fe', marginBottom: '6px' }}>
                      <span>Descargando actualización en segundo plano...</span>
                      <strong>{liveUpdateStatus.progress || 0}%</strong>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${liveUpdateStatus.progress || 0}%`, height: '100%', background: 'linear-gradient(90deg, #6366f1, #06b6d4)', transition: 'width 0.2s' }} />
                    </div>
                  </div>
                )}

                {liveUpdateStatus?.status === 'downloaded' && (
                  <div style={{
                    marginTop: '14px',
                    padding: '12px 14px',
                    borderRadius: '6px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}>
                    <span style={{ fontSize: '12.5px', color: '#6ee7b7', fontWeight: 500 }}>
                      ¡Nueva versión v{liveUpdateStatus.newVersion} descargada y lista para aplicar!
                    </span>
                    <button
                      type="button"
                      onClick={() => window.electronAPI?.quitAndInstallUpdate && window.electronAPI.quitAndInstallUpdate()}
                      style={{
                        padding: '6px 14px',
                        background: '#10b981',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        fontWeight: 600,
                        fontSize: '11.5px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Reiniciar y Actualizar
                    </button>
                  </div>
                )}

                {updateCheckResult && (
                  <div style={{
                    marginTop: '14px',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    lineHeight: 1.5,
                    background: updateCheckResult.type === 'error' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(99, 102, 241, 0.12)',
                    border: `1px solid ${updateCheckResult.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`,
                    color: updateCheckResult.type === 'error' ? '#fca5a5' : '#c7d2fe'
                  }}>
                    {updateCheckResult.message}
                  </div>
                )}
              </div>

              <div className="form-group" style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Globe size={14} style={{ color: '#06b6d4' }} />
                  Canal de Distribución Oficial
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                  Las nuevas versiones se publican de forma automática a través de GitHub Releases con integración continua de GitHub Actions para Linux, Windows y macOS.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <a
                    href="https://github.com/Eldani110/video-montage-editor/releases"
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      textDecoration: 'none',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <ExternalLink size={13} />
                    Ver Historial de Versiones en GitHub
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={handleSave}>
            Guardar Configuración
          </button>
        </div>
      </div>

      <FolderPickerModal
        isOpen={showFolderPicker}
        onClose={() => setShowFolderPicker(false)}
        initialPath={baseDirInput || diskInfo?.mediaDir || null}
        title="Elegir carpeta base de proyectos y recursos"
        onSelect={(selected) => {
          setBaseDirInput(selected);
          handleSaveBaseDir(null, selected);
        }}
      />
    </div>
  );
}
