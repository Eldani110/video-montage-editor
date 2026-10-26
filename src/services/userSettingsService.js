/**
 * User Settings & Cross-Device Cloud Synchronization Service
 * 
 * Manages the persistence of user configurations:
 * 1. General Account Settings: AI configurations (providers, models, keys, parameters),
 *    Stock Media preferences, and Autosave parameters persist strictly under each
 *    authenticated user account (in Cloud Firestore and isolated account store).
 *    When logged out or in guest mode, settings revert to clean default values
 *    with empty API keys to prevent any credential leakage.
 * 2. Device-Specific Local Project Folder: Identifies the active hardware device / OS
 *    and associates each device with its own local filesystem path in the database.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { getCurrentDeviceInfo, invalidateDeviceCache } from './deviceService';
import { getSavedAiConfig, saveAiConfig, DEFAULT_AI_CONFIG, STORAGE_KEY_AI_CONFIG } from '../utils/aiClient';
import { getSavedStockConfig, saveStockConfig, DEFAULT_STOCK_CONFIG, getStorageConfig, updateBaseMediaDir, invalidateStorageConfigCache } from '../utils/stockMediaClient';
import { getAutosaveConfig, saveAutosaveConfig, DEFAULT_AUTOSAVE_CONFIG } from '../utils/autosaveConfig';

export const STORAGE_KEY_GEMINI = 'montage_pro_gemini_api_key';
export const STORAGE_KEY_STOCK = 'montage_stock_config';
export const LOCAL_STUDIO_UID = 'local_studio_default';

/**
 * Helper to merge AI configs without overwriting non-empty keys with empty defaults
 */
function mergeAiConfigs(primary, fallback) {
  if (!primary && !fallback) return { ...DEFAULT_AI_CONFIG };
  const base = { ...DEFAULT_AI_CONFIG, ...(fallback || {}), ...(primary || {}) };
  if (!base.apiKey && fallback?.apiKey) {
    base.apiKey = fallback.apiKey;
  }

  // Deep merge providerConfigs so switching providers never loses saved API keys
  const mergedProviderConfigs = {};
  const allProviders = new Set([
    ...Object.keys(fallback?.providerConfigs || {}),
    ...Object.keys(primary?.providerConfigs || {})
  ]);
  for (const prov of allProviders) {
    const fbProv = fallback?.providerConfigs?.[prov] || {};
    const prProv = primary?.providerConfigs?.[prov] || {};
    mergedProviderConfigs[prov] = {
      ...fbProv,
      ...prProv,
      apiKey: (prProv.apiKey && String(prProv.apiKey).trim()) ? prProv.apiKey : (fbProv.apiKey || ''),
      baseUrl: prProv.baseUrl || fbProv.baseUrl || '',
      selectedModel: prProv.selectedModel || fbProv.selectedModel || '',
      availableModels: (Array.isArray(prProv.availableModels) && prProv.availableModels.length > 0)
        ? prProv.availableModels
        : (Array.isArray(fbProv.availableModels) ? fbProv.availableModels : [])
    };
  }
  base.providerConfigs = mergedProviderConfigs;

  // Ensure active provider's apiKey is populated if stored in providerConfigs
  if (!base.apiKey && base.provider && mergedProviderConfigs[base.provider]?.apiKey) {
    base.apiKey = mergedProviderConfigs[base.provider].apiKey;
  }

  return base;
}

/**
 * Helper to merge Stock configs without losing API keys
 */
function mergeStockConfigs(primary, fallback) {
  if (!primary && !fallback) return { ...DEFAULT_STOCK_CONFIG };
  const base = { ...DEFAULT_STOCK_CONFIG, ...(fallback || {}), ...(primary || {}) };
  if (!base.pexelsApiKey && fallback?.pexelsApiKey) base.pexelsApiKey = fallback.pexelsApiKey;
  if (!base.pixabayApiKey && fallback?.pixabayApiKey) base.pixabayApiKey = fallback.pixabayApiKey;
  return base;
}

/**
 * Helper to check if a settings object has any meaningful user-configured keys
 */
function hasConfiguredCredentials(settings) {
  if (!settings) return false;
  const ai = settings.aiConfig;
  const stock = settings.stockConfig;
  const hasAiKey = Boolean(
    (ai?.apiKey && String(ai.apiKey).trim()) ||
    (ai?.providerConfigs && Object.values(ai.providerConfigs).some(p => Boolean(p?.apiKey && String(p.apiKey).trim())))
  );
  const hasStockKey = Boolean(stock?.pexelsApiKey || stock?.pixabayApiKey);
  const hasGemini = Boolean(settings.geminiApiKey && String(settings.geminiApiKey).trim());
  return hasAiKey || hasStockKey || hasGemini;
}

/**
 * Fetches account-isolated settings from the local backend API.
 */
export async function fetchAccountSettingsFromBackend(uid) {
  if (!uid || typeof uid !== 'string') return null;
  try {
    const res = await fetch(`/api/media/account-settings?uid=${encodeURIComponent(uid)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.exists) {
        return data;
      }
    }
  } catch (err) {
    console.warn('[userSettings] Notice fetching account settings from backend:', err.message);
  }
  return null;
}

/**
 * Persists account-isolated settings to the local backend API.
 */
export async function saveAccountSettingsToBackend(uid, email, { generalSettings, devices } = {}) {
  if (!uid || typeof uid !== 'string') return false;
  try {
    const payload = { uid, email };
    if (generalSettings) payload.generalSettings = generalSettings;
    if (devices) payload.devices = devices;

    const res = await fetch('/api/media/account-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch (err) {
    console.warn('[userSettings] Notice saving account settings to backend:', err.message);
    return false;
  }
}

/**
 * Completely clears all user-specific API keys and configurations from localStorage and memory.
 * Invoked on user logout, when no session is active, or when switching accounts.
 * Ensures NO private API keys remain visible or active when logged out.
 */
export function clearUserSessionSettings() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_AI_CONFIG);
      localStorage.removeItem(STORAGE_KEY_STOCK);
      localStorage.removeItem(STORAGE_KEY_GEMINI);
      localStorage.removeItem('montage_device_local_dir');
      localStorage.removeItem('montage_saved_dir_name');
    }
  } catch (_) {}

  // Apply default clean configs with EMPTY API keys
  saveAiConfig(DEFAULT_AI_CONFIG);
  saveStockConfig(DEFAULT_STOCK_CONFIG);
  saveAutosaveConfig(DEFAULT_AUTOSAVE_CONFIG);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('montage_user_settings_synced', {
      detail: {
        aiConfig: DEFAULT_AI_CONFIG,
        stockConfig: DEFAULT_STOCK_CONFIG,
        autosaveConfig: DEFAULT_AUTOSAVE_CONFIG,
        geminiApiKey: ''
      }
    }));
    window.dispatchEvent(new CustomEvent('montage_device_folder_synced', {
      detail: { baseMediaDir: null }
    }));
  }
}

/**
 * Loads and applies all settings for the authenticated user or local workstation profile.
 * Tries Cloud Firestore first (if logged in), then local backend database (/api/media/account-settings),
 * and merges with any existing local credentials so API keys and folders are never lost.
 */
export async function loadUserSettings(user) {
  const effectiveUid = (user && user.uid) ? user.uid : LOCAL_STUDIO_UID;
  const effectiveEmail = (user && user.email) ? user.email : 'local@studio.workstation';

  // Capture current localStorage state before overwriting so we never lose newly entered keys
  const currentLocalSettings = {
    aiConfig: getSavedAiConfig(),
    stockConfig: getSavedStockConfig(),
    autosaveConfig: getAutosaveConfig(),
    geminiApiKey: (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_GEMINI) : '') || ''
  };

  let cloudSettings = null;
  let backendAccountData = null;

  // 1. Load from Cloud Firestore if authenticated user
  if (user && user.uid) {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userDocRef);

      if (snap.exists()) {
        const data = snap.data() || {};
        const rawGeneral = data.generalSettings || {};

        const general = {
          aiConfig: rawGeneral.aiConfig || data['generalSettings.aiConfig'],
          stockConfig: rawGeneral.stockConfig || data['generalSettings.stockConfig'],
          autosaveConfig: rawGeneral.autosaveConfig || data['generalSettings.autosaveConfig'],
          geminiApiKey: rawGeneral.geminiApiKey || data['generalSettings.geminiApiKey']
        };

        const hasCloudData = Boolean(
          general.aiConfig || general.stockConfig || general.autosaveConfig || general.geminiApiKey
        );

        if (hasCloudData) {
          cloudSettings = general;
          console.log('[userSettings] Restored settings from Cloud Firestore for user:', user.email);
        }
      }
    } catch (cloudErr) {
      console.warn('[userSettings] Firestore read notice (rules or offline):', cloudErr?.code || cloudErr?.message);
    }
  }

  // 2. Fetch from isolated account store on local disk backend (both for logged-in user and fallback to local_studio_default)
  try {
    backendAccountData = await fetchAccountSettingsFromBackend(effectiveUid);
    if (!backendAccountData && effectiveUid !== LOCAL_STUDIO_UID) {
      const localDefaultData = await fetchAccountSettingsFromBackend(LOCAL_STUDIO_UID);
      if (localDefaultData?.generalSettings && !cloudSettings) {
        backendAccountData = localDefaultData;
      }
    }
  } catch (backendErr) {
    console.warn('[userSettings] Backend account read notice:', backendErr);
  }

  const backendGeneral = backendAccountData?.generalSettings || null;

  // 3. Merge settings intelligently: Cloud > Backend Account > Current LocalStorage > Defaults
  const mergedAiConfig = mergeAiConfigs(
    cloudSettings?.aiConfig || backendGeneral?.aiConfig,
     mergeAiConfigs(backendGeneral?.aiConfig, currentLocalSettings.aiConfig)
  );
  const mergedStockConfig = mergeStockConfigs(
    cloudSettings?.stockConfig || backendGeneral?.stockConfig,
    mergeStockConfigs(backendGeneral?.stockConfig, currentLocalSettings.stockConfig)
  );
  const mergedAutosaveConfig = {
    ...DEFAULT_AUTOSAVE_CONFIG,
    ...(currentLocalSettings.autosaveConfig || {}),
    ...(backendGeneral?.autosaveConfig || {}),
    ...(cloudSettings?.autosaveConfig || {})
  };
  const mergedGeminiKey =
    cloudSettings?.geminiApiKey ||
    backendGeneral?.geminiApiKey ||
    currentLocalSettings.geminiApiKey ||
    '';

  const finalSettings = {
    aiConfig: mergedAiConfig,
    stockConfig: mergedStockConfig,
    autosaveConfig: mergedAutosaveConfig,
    geminiApiKey: mergedGeminiKey
  };

  // Apply merged settings to localStorage
  saveAiConfig(finalSettings.aiConfig);
  saveStockConfig(finalSettings.stockConfig);
  saveAutosaveConfig(finalSettings.autosaveConfig);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_GEMINI, finalSettings.geminiApiKey || '');
    }
  } catch (_) {}

  // Persist back to backend database (and Firestore if logged in) if we recovered keys from local state
  if (hasConfiguredCredentials(finalSettings)) {
    try {
      await saveAccountSettingsToBackend(effectiveUid, effectiveEmail, { generalSettings: finalSettings });
    } catch (_) {}
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('montage_user_settings_synced', { detail: finalSettings }));
  }

  // 4. Restore or Register Device-Specific Local Project Folder
  try {
    const currentDevice = await getCurrentDeviceInfo(true);
    const currentStorage = await getStorageConfig(true);
    const diskDir = currentStorage?.baseMediaDir;

    let savedDevice = backendAccountData?.devices?.[currentDevice.deviceId];
    if (!savedDevice && user && user.uid) {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userDocRef);
        if (snap.exists()) {
          const data = snap.data() || {};
          savedDevice = data?.devices?.[currentDevice.deviceId] || data?.[`devices.${currentDevice.deviceId}`];
        }
      } catch (_) {}
    }

    let effectiveDir = null;

    if (savedDevice && savedDevice.baseMediaDir && typeof savedDevice.baseMediaDir === 'string' && savedDevice.baseMediaDir.trim()) {
      effectiveDir = savedDevice.baseMediaDir.trim();
      try {
        await updateBaseMediaDir(effectiveDir);
      } catch (_) {}
    } else if (diskDir && typeof diskDir === 'string' && diskDir.trim()) {
      effectiveDir = diskDir.trim();
    }

    if (effectiveDir) {
      try {
        localStorage.setItem('montage_device_local_dir', effectiveDir);
      } catch (_) {}
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('montage_device_folder_synced', {
          detail: { baseMediaDir: effectiveDir, deviceId: currentDevice.deviceId }
        }));
      }
    }
  } catch (devErr) {
    console.warn('[userSettings] Device registration notice:', devErr);
  }

  return finalSettings;
}

/**
 * Saves general configuration updates locally, in the local backend database,
 * and in Cloud Firestore for cross-device sync when authenticated.
 */
export async function saveUserGeneralSettings(user, { aiConfig, stockConfig, autosaveConfig, geminiApiKey } = {}) {
  // 1. Save locally in localStorage for active session
  if (aiConfig) saveAiConfig(aiConfig);
  if (stockConfig) saveStockConfig(stockConfig);
  if (autosaveConfig) saveAutosaveConfig(autosaveConfig);
  if (geminiApiKey !== undefined) {
    try {
      localStorage.setItem(STORAGE_KEY_GEMINI, geminiApiKey);
    } catch (_) {}
  }

  const effectiveUid = (user && user.uid) ? user.uid : LOCAL_STUDIO_UID;
  const effectiveEmail = (user && user.email) ? user.email : 'local@studio.workstation';

  const generalSettings = {
    aiConfig: aiConfig || getSavedAiConfig(),
    stockConfig: stockConfig || getSavedStockConfig(),
    autosaveConfig: autosaveConfig || getAutosaveConfig(),
    geminiApiKey: geminiApiKey !== undefined
      ? geminiApiKey
      : ((typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_GEMINI) : '') || '')
  };

  // 2. Always persist to local disk database (/api/media/account-settings)
  try {
    await saveAccountSettingsToBackend(effectiveUid, effectiveEmail, { generalSettings });
    // Also mirror to LOCAL_STUDIO_UID so offline/local workstation sessions always have the latest config
    if (effectiveUid !== LOCAL_STUDIO_UID) {
      await saveAccountSettingsToBackend(LOCAL_STUDIO_UID, effectiveEmail, { generalSettings });
    }
    console.log('[userSettings] Persisted general settings to local disk database for:', effectiveEmail);
  } catch (bErr) {
    console.warn('[userSettings] Could not persist to backend account store:', bErr);
  }

  // 3. Save to Cloud Firestore if authenticated
  if (user && user.uid) {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const updateData = {
        updatedAt: new Date().toISOString(),
        email: user.email || '',
        generalSettings
      };

      await setDoc(userDocRef, updateData, { merge: true });
      console.log('[userSettings] Successfully saved general settings to Cloud Firestore for:', user.email);
    } catch (err) {
      console.warn('[userSettings] Firestore write notice (rules or offline):', err?.code || err?.message);
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('montage_user_settings_synced', {
      detail: generalSettings
    }));
  }
}

/**
 * Updates the local project directory on the machine and persists it for the specific device.
 */
export async function saveDeviceMediaDir(user, newBaseMediaDir) {
  if (!newBaseMediaDir || typeof newBaseMediaDir !== 'string') return null;
  const cleanDir = newBaseMediaDir.trim();
  if (!cleanDir) return null;

  // 1. Update the local machine filesystem configuration
  const localRes = await updateBaseMediaDir(cleanDir);

  // 2. Invalidate in-memory caches
  invalidateDeviceCache();
  invalidateStorageConfigCache();

  // 3. Save to localStorage for immediate UI binding
  try {
    localStorage.setItem('montage_device_local_dir', cleanDir);
  } catch (_) {}

  const effectiveUid = (user && user.uid) ? user.uid : LOCAL_STUDIO_UID;
  const effectiveEmail = (user && user.email) ? user.email : 'local@studio.workstation';

  // 4. Persist under the device profile in local backend database and Firestore
  try {
    const currentDevice = await getCurrentDeviceInfo(true);
    const deviceEntry = {
      deviceId: currentDevice.deviceId,
      deviceName: currentDevice.deviceName,
      hostname: currentDevice.hostname,
      platform: currentDevice.platform,
      platformName: currentDevice.platformName,
      baseMediaDir: cleanDir,
      updatedAt: new Date().toISOString()
    };

    // A. Save to backend account store
    await saveAccountSettingsToBackend(effectiveUid, effectiveEmail, {
      devices: {
        [currentDevice.deviceId]: deviceEntry
      }
    });
    if (effectiveUid !== LOCAL_STUDIO_UID) {
      await saveAccountSettingsToBackend(LOCAL_STUDIO_UID, effectiveEmail, {
        devices: {
          [currentDevice.deviceId]: deviceEntry
        }
      });
    }

    // B. Save to Cloud Firestore if authenticated
    if (user && user.uid) {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
          devices: {
            [currentDevice.deviceId]: deviceEntry
          },
          lastActiveDevice: currentDevice.deviceId,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log(`[userSettings] Successfully persisted device directory in Firestore for ${currentDevice.deviceName}:`, cleanDir);
      } catch (fErr) {
        console.warn('[userSettings] Firestore write notice for device:', fErr?.code || fErr?.message);
      }
    }
  } catch (err) {
    console.warn('[userSettings] Could not persist device directory:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('montage_device_folder_synced', {
      detail: { baseMediaDir: cleanDir }
    }));
  }

  return localRes;
}

/**
 * Fetches all devices registered under the user account or local studio profile.
 */
export async function getUserDevices(user) {
  const effectiveUid = (user && user.uid) ? user.uid : LOCAL_STUDIO_UID;

  // 1. Try Firestore if logged in
  if (user && user.uid) {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const devicesMap = snap.data()?.devices || {};
        const list = Object.values(devicesMap);
        if (list.length > 0) return list;
      }
    } catch (_) {}
  }

  // 2. Try backend account store
  try {
    const backendData = await fetchAccountSettingsFromBackend(effectiveUid);
    if (backendData?.devices) {
      return Object.values(backendData.devices);
    }
  } catch (_) {}

  return [];
}
