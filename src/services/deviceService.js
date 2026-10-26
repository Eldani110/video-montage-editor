/**
 * Device Identity Service
 * Identifies the host machine or browser instance so that device-specific configurations
 * (such as local project media directories) can be tracked uniquely in the database.
 */

let cachedDeviceInfo = null;

export function invalidateDeviceCache() {
  cachedDeviceInfo = null;
}

export async function getCurrentDeviceInfo(forceRefresh = false) {
  if (cachedDeviceInfo && !forceRefresh) return cachedDeviceInfo;

  // 1. Try to fetch official machine info from the local backend
  try {
    const res = await fetch('/api/media/device-info');
    if (res.ok) {
      const data = await res.json();
      if (data && data.deviceId) {
        cachedDeviceInfo = {
          deviceId: data.deviceId,
          deviceName: data.deviceName || `${data.hostname || 'Equipo'} (${data.platformName || 'Local'})`,
          hostname: data.hostname || 'Localhost',
          platform: data.platform || 'local',
          platformName: data.platformName || 'Escritorio',
          baseMediaDir: data.baseMediaDir || null,
          isDesktop: true
        };
        try {
          localStorage.setItem('montage_device_id', cachedDeviceInfo.deviceId);
        } catch (_) {}
        return cachedDeviceInfo;
      }
    }
  } catch (_) {
    // Fall back to client browser detection
  }

  // 2. Client browser fallback
  let storedDeviceId = null;
  try {
    storedDeviceId = localStorage.getItem('montage_device_id');
  } catch (_) {}

  if (!storedDeviceId) {
    const randomHex = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6);
    storedDeviceId = `dev_client_${randomHex}`;
    try {
      localStorage.setItem('montage_device_id', storedDeviceId);
    } catch (_) {}
  }

  // Determine friendly platform name
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  let platform = 'unknown';
  let platformName = 'Dispositivo Web';

  if (/Mac|Macintosh|MacIntel/i.test(userAgent)) {
    platform = 'darwin';
    platformName = 'macOS';
  } else if (/Windows|Win32|Win64/i.test(userAgent)) {
    platform = 'win32';
    platformName = 'Windows';
  } else if (/Linux/i.test(userAgent)) {
    platform = 'linux';
    platformName = 'Linux';
  }

  cachedDeviceInfo = {
    deviceId: storedDeviceId,
    deviceName: `Equipo ${platformName}`,
    hostname: 'Navegador Web',
    platform,
    platformName,
    baseMediaDir: (typeof localStorage !== 'undefined' ? localStorage.getItem('montage_device_local_dir') : null) || null,
    isDesktop: false
  };

  return cachedDeviceInfo;
}
