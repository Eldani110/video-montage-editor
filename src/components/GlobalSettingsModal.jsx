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
  Save
} from 'lucide-react';
import { getAutosaveConfig, saveAutosaveConfig } from '../utils/autosaveConfig';
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
  updateBaseMediaDir,
  setRemoteMediaUrl,
  getRemoteMediaStatus,
  getStorageConfig
} from '../utils/stockMediaClient';

export function GlobalSettingsModal({ isOpen, onClose }) {
  const [config, setConfig] = useState(getSavedAiConfig());
  const [stockConfig, setStockConfig] = useState(getSavedStockConfig());
  const [autosaveConfig, setAutosaveConfig] = useState(getAutosaveConfig);
  const [diskInfo, setDiskInfo] = useState(null);
  const [diskFolders, setDiskFolders] = useState([]);
  const [baseDirInput, setBaseDirInput] = useState('');
  const [isUpdatingBaseDir, setIsUpdatingBaseDir] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isTestingStock, setIsTestingStock] = useState(false);
  const [stockTestResult, setStockTestResult] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('ai'); // 'ai' | 'stock' | 'storage'
  const [isManualModel, setIsManualModel] = useState(false);
  const [remoteUrlInput, setRemoteUrlInput] = useState('');
  const [remoteStatus, setRemoteStatus] = useState(null);
  const [isSavingRemote, setIsSavingRemote] = useState(false);
  const [isTestingRemote, setIsTestingRemote] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfig(getSavedAiConfig());
      setStockConfig(getSavedStockConfig());
      setAutosaveConfig(getAutosaveConfig());
      setTestResult(null);
      setStockTestResult(null);
      setErrorMessage(null);
      getStorageDiskInfo().then(info => {
        setDiskInfo(info);
        if (info?.mediaDir) setBaseDirInput(info.mediaDir);
      });
      getDiskMediaFolders().then(folders => setDiskFolders(folders));
      getStorageConfig().then(cfg => {
        if (cfg?.remoteMediaUrl) setRemoteUrlInput(cfg.remoteMediaUrl);
      });
      getRemoteMediaStatus().then(st => setRemoteStatus(st));
      setSuccessMessage(null);
    }
  }, [isOpen]);

  const handleSaveRemoteUrl = async () => {
    setIsSavingRemote(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await setRemoteMediaUrl(remoteUrlInput.trim());
      const st = await getRemoteMediaStatus();
      setRemoteStatus(st);
      setSuccessMessage(remoteUrlInput.trim()
        ? 'Servidor de medios remoto guardado.'
        : 'Servidor de medios remoto desactivado.');
    } catch (err) {
      setErrorMessage('No se pudo guardar: ' + (err.message || err));
    } finally {
      setIsSavingRemote(false);
    }
  };

  const handleTestRemote = async () => {
    setIsTestingRemote(true);
    try {
      const st = await getRemoteMediaStatus();
      setRemoteStatus(st);
    } finally {
      setIsTestingRemote(false);
    }
  };

  if (!isOpen) return null;

  const currentPreset = PROVIDER_PRESETS.find(p => p.id === config.provider) || PROVIDER_PRESETS[0];

  const handleProviderChange = (providerId) => {
    const preset = PROVIDER_PRESETS.find(p => p.id === providerId) || PROVIDER_PRESETS[0];
    const newConfig = {
      ...config,
      provider: providerId,
      baseUrl: preset.defaultUrl,
      selectedModel: preset.defaultModels[0] || config.selectedModel,
      availableModels: preset.defaultModels.length > 0 ? preset.defaultModels : config.availableModels
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
      setConfig(prev => ({
        ...prev,
        availableModels: models,
        selectedModel: models.includes(prev.selectedModel) ? prev.selectedModel : models[0]
      }));
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

  const handleSaveBaseDir = async (e) => {
    e?.preventDefault();
    if (!baseDirInput.trim()) return;
    setIsUpdatingBaseDir(true);
    setErrorMessage(null);
    try {
      const res = await updateBaseMediaDir(baseDirInput.trim());
      setSuccessMessage(`Ruta base de medios actualizada a: ${res.baseMediaDir}`);
      const info = await getStorageDiskInfo();
      setDiskInfo(info);
      const folders = await getDiskMediaFolders();
      setDiskFolders(folders);
    } catch (err) {
      setErrorMessage(`Error al actualizar ruta: ${err.message}`);
    } finally {
      setIsUpdatingBaseDir(false);
    }
  };

  const handleSave = () => {
    saveAiConfig(config);
    saveStockConfig(stockConfig);
    setSuccessMessage('Configuración de IA y Stock Media guardada exitosamente.');
    setTimeout(() => {
      onClose();
    }, 400);
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
              <h3>Configuración General del Editor</h3>
              <p>Gestiona la IA Agéntica Editora (DeepSeek, Ollama) y Stock Media (Pexels, Pixabay)</p>
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
                    onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
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
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
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
                    onChange={(e) => setConfig({ ...config, selectedModel: e.target.value })}
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
                    onChange={(e) => setConfig({ ...config, selectedModel: e.target.value })}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#06b6d4', fontWeight: 600, fontSize: '13px' }}>
                    <HardDrive size={15} />
                    <span>Ruta Base de Almacenamiento Multimedia:</span>
                  </div>
                  <span className="badge badge-emerald" style={{ fontSize: '10px' }}>
                    ✓ Subcarpetas por Proyecto
                  </span>
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
                    placeholder="/ruta/hacia/projects_media"
                  />
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

              <div className="form-group" style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <HardDrive size={16} className="text-cyan" />
                  Servidor de medios remoto (tu PC)
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                  Si esta app corre en un servidor (VPS) pero tus medios viven en tu PC, indica aquí la URL pública/túnel de tu servidor de medios local.
                  El servidor reenviará automáticamente los archivos que no tenga. Funciona desde cualquier dispositivo.
                </p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="input-field"
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px' }}
                    placeholder="https://mi-pc.trycloudflare.com"
                    value={remoteUrlInput}
                    onChange={(e) => setRemoteUrlInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={handleSaveRemoteUrl}
                    disabled={isSavingRemote}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {isSavingRemote ? <Loader2 size={13} className="spinner" /> : <Save size={13} />}
                    Guardar
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={handleTestRemote}
                    disabled={isTestingRemote}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {isTestingRemote ? <Loader2 size={13} className="spinner" /> : <RefreshCw size={13} />}
                    Probar
                  </button>
                </div>
                {remoteStatus && (
                  <div style={{ marginTop: '8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {remoteStatus.configured && remoteStatus.reachable ? (
                      <span style={{ color: '#34d399' }}>● Conectado a {remoteStatus.url}</span>
                    ) : remoteStatus.configured ? (
                      <span style={{ color: '#fbbf24' }}>● Configurado pero no responde ({remoteStatus.url})</span>
                    ) : (
                      <span style={{ color: 'var(--text-dim)' }}>● No configurado — se usa el disco del servidor</span>
                    )}
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
    </div>
  );
}
