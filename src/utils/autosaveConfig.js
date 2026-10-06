/**
 * Autosave Configuration & Persistence Store
 * Manages preferences for the automatic saving engine.
 */

const AUTOSAVE_STORAGE_KEY = 'video_montage_autosave_config';

export const DEFAULT_AUTOSAVE_CONFIG = {
  enabled: true,            // Autoguardado activado por defecto
  intervalSeconds: 15,      // Intervalo periódico en segundos (15s)
  debounceDelayMs: 1500,    // Retardo debounce tras edición activa (1.5s)
  saveToDiskIfHandle: true, // Sincronizar automáticamente en disco si hay archivo o carpeta vinculada
  showNotifications: true   // Mostrar indicador visual en la barra de herramientas
};

export function getAutosaveConfig() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUTOSAVE_CONFIG };
    return { ...DEFAULT_AUTOSAVE_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_AUTOSAVE_CONFIG };
  }
}

export function saveAutosaveConfig(updates) {
  try {
    const current = getAutosaveConfig();
    const next = { ...current, ...updates };
    localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('montage_autosave_config_changed', { detail: next }));
    return next;
  } catch {
    return { ...DEFAULT_AUTOSAVE_CONFIG };
  }
}
