import React, { useRef, useState, useEffect } from 'react';
import { Upload, Image as ImageIcon, Music, Film, Plus, Trash2, CheckCircle2, HardDrive, FolderCog, RefreshCw, Loader2, FolderOpen, FolderPlus, AlertTriangle } from 'lucide-react';
import { saveMediaBlob } from '../utils/storage';
import { getStorageDiskInfo, getProjectMediaFolder, listDiskMediaFiles } from '../utils/stockMediaClient';
import { extractWaveformData } from '../utils/audioWaveform';
import {
  isLocalMediaSupported,
  pickLocalMediaFolder,
  getConnectedMediaFolder,
  disconnectMediaFolder,
  listLocalMediaFiles,
  readLocalMediaFileByPath,
  writeLocalMediaFile
} from '../utils/localMedia';

export const MediaLibrary = React.memo(function MediaLibrary({
  assets = [],
  onAddAsset,
  onAddAssets,
  onDeleteAsset,
  onAddToTimeline,
  project,
  onOpenProjectSettings
}) {
  const [filter, setFilter] = useState('all');
  const [isDragging, setIsDragging] = useState(false);
  const [diskInfo, setDiskInfo] = useState(null);
  const fileInputRef = useRef(null);

  const projectFolder = getProjectMediaFolder(project);

  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState(null);

  // Local media folder connection (Clipchamp-style File System Access API)
  const [localFolder, setLocalFolder] = useState(null); // { handle, name, needsPermission }
  const [isConnectingFolder, setIsConnectingFolder] = useState(false);
  const localSupported = isLocalMediaSupported();

  // Load any previously connected local media folder on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const connected = await getConnectedMediaFolder(false);
      if (!cancelled) setLocalFolder(connected);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleConnectFolder = async () => {
    setIsConnectingFolder(true);
    setScanMessage(null);
    try {
      const handle = await pickLocalMediaFolder();
      setLocalFolder({ handle, name: handle.name, needsPermission: false });
      setScanMessage({ type: 'success', text: `Carpeta local conectada: "${handle.name}". Los medios se guardarán aquí.` });
      // Auto-scan the newly connected folder
      setTimeout(() => scanFolderRef.current?.(), 100);
    } catch (err) {
      if (err && err.name === 'AbortError') {
        // user cancelled the picker — do nothing
      } else {
        setScanMessage({ type: 'error', text: 'No se pudo conectar la carpeta: ' + (err.message || err) });
      }
    } finally {
      setIsConnectingFolder(false);
    }
  };

  const handleDisconnectFolder = async () => {
    await disconnectMediaFolder();
    setLocalFolder(null);
    setScanMessage({ type: 'info', text: 'Carpeta local desconectada. Se usará el almacenamiento del servidor.' });
  };

  const handleReconnectFolder = async () => {
    setIsConnectingFolder(true);
    try {
      const connected = await getConnectedMediaFolder(true);
      setLocalFolder(connected);
      if (connected && !connected.needsPermission) {
        setScanMessage({ type: 'success', text: `Permiso concedido para "${connected.name}".` });
        setTimeout(() => scanFolderRef.current?.(), 100);
      }
    } finally {
      setIsConnectingFolder(false);
    }
  };

  useEffect(() => {
    getStorageDiskInfo(projectFolder).then(info => setDiskInfo(info));
  }, [assets.length, projectFolder]);

  // Auto-scan the folder when it changes (e.g. user picked a new media folder in settings),
  // so the editor immediately reflects the files that live in the newly selected folder.
  const lastScannedFolderRef = useRef(null);
  const autoScanArmedRef = useRef(false);
  const scanFolderRef = useRef(null);
  useEffect(() => {
    // Skip the very first mount (the user can scan manually); only react to folder CHANGES
    if (!autoScanArmedRef.current) {
      autoScanArmedRef.current = true;
      lastScannedFolderRef.current = projectFolder;
      return;
    }
    if (lastScannedFolderRef.current !== projectFolder) {
      lastScannedFolderRef.current = projectFolder;
      // Fire-and-forget auto discovery for the new folder (via ref to avoid TDZ)
      scanFolderRef.current?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFolder]);

  // Builds a Set of existing asset signatures to avoid re-importing the same disk file
  const buildExistingSignatures = () => {
    const sigs = new Set();
    for (const a of assets) {
      if (a.name) sigs.add(String(a.name).toLowerCase());
      if (a.diskPath) sigs.add(String(a.diskPath).toLowerCase());
      if (a.url) {
        // Strip cache-buster query so /media-library/<folder>/<file>?t=... matches
        sigs.add(String(a.url).split('?')[0].toLowerCase());
      }
    }
    return sigs;
  };

  // Enriches a disk file entry with real metadata (dimensions/duration/thumbnail)
  const buildAssetFromDiskFile = (file, projectFolderName) => {
    const assetId = 'asset-disk-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    const cacheBuster = '?t=' + Date.now();
    const asset = {
      id: assetId,
      name: file.filename,
      type: file.type,
      url: file.url + cacheBuster,
      diskPath: file.url,
      size: file.size || 0,
      duration: file.type === 'image' ? 5 : (file.type === 'audio' ? 10 : 5),
      color: file.type === 'image' ? '#6366f1' : (file.type === 'audio' ? '#06b6d4' : '#10b981'),
      source: 'disk_scan',
      isBroll: String(projectFolderName || '').length > 0
    };
    return asset;
  };

  // Enriches an asset with real metadata (dimensions, duration, thumbnail) by probing its URL.
  const enrichAssetMetadata = async (asset) => {
    if (asset.type === 'image') {
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          asset.width = img.naturalWidth;
          asset.height = img.naturalHeight;
          asset.thumbnail = asset.url;
          resolve();
        };
        img.onerror = resolve;
        img.src = asset.url;
      });
    } else if (asset.type === 'video') {
      await new Promise((resolve) => {
        const vid = document.createElement('video');
        vid.preload = 'metadata';
        vid.muted = true;
        vid.src = asset.url;
        vid.onloadedmetadata = () => {
          asset.duration = (isFinite(vid.duration) && vid.duration > 0)
            ? Number(vid.duration.toFixed(2))
            : 5;
          asset.width = vid.videoWidth;
          asset.height = vid.videoHeight;
          vid.currentTime = Math.min(0.5, (vid.duration || 1) / 2);
        };
        vid.onseeked = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 90;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(vid, 0, 0, 160, 90);
            asset.thumbnail = canvas.toDataURL('image/jpeg', 0.8);
          } catch {
            // ignore canvas errors
          }
          resolve();
        };
        vid.onerror = resolve;
        setTimeout(resolve, 6000);
      });
    } else if (asset.type === 'audio') {
      await new Promise((resolve) => {
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.src = asset.url;
        audio.onloadedmetadata = () => {
          asset.duration = (isFinite(audio.duration) && audio.duration > 0)
            ? Number(audio.duration.toFixed(2))
            : 10;
          resolve();
        };
        audio.onerror = resolve;
        setTimeout(resolve, 6000);
      });
    }
    return asset;
  };

  const handleScanFolder = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setScanMessage(null);
    try {
      // Prefer the user's LOCAL media folder when connected (Clipchamp-style).
      const connected = localFolder && localFolder.handle && !localFolder.needsPermission
        ? localFolder
        : await getConnectedMediaFolder(false);

      if (connected && connected.handle && !connected.needsPermission) {
        setLocalFolder(connected);
        await scanLocalFolder(connected.handle);
      } else if (connected && connected.needsPermission) {
        setLocalFolder(connected);
        setScanMessage({ type: 'error', text: `Necesitas conceder permiso a la carpeta "${connected.name}". Pulsa "Reconectar".` });
      } else {
        // No local folder connected: fall back to the server-side projects_media folder
        await scanServerFolder();
      }
    } catch (err) {
      console.warn('Scan folder error:', err);
      setScanMessage({ type: 'error', text: 'Error al escanear la carpeta: ' + (err.message || err) });
    } finally {
      setIsScanning(false);
      getStorageDiskInfo(projectFolder).then(info => setDiskInfo(info));
    }
  };

  // Scan the connected local disk folder (File System Access API) — flat, files
  // live directly inside the chosen folder (Clipchamp-style).
  const scanLocalFolder = async (rootHandle) => {
    const files = await listLocalMediaFiles({ rootHandle, recursive: true });

    if (!files.length) {
      setScanMessage({ type: 'empty', text: `La carpeta "${localFolder?.name || ''}" no contiene archivos multimedia.` });
      return;
    }

    const existing = buildExistingSignatures();
    const newFiles = files.filter(f => !existing.has(String(f.filename).toLowerCase()));

    if (!newFiles.length) {
      setScanMessage({ type: 'uptodate', text: `Todo sincronizado: ${files.length} archivo(s) ya en la biblioteca.` });
      return;
    }

    const enrichedAssets = [];
    for (const f of newFiles) {
      let objectUrl = null;
      try {
        const read = await readLocalMediaFileByPath({ rootHandle, relPath: f.relPath });
        objectUrl = read.objectUrl;
      } catch (_) {
        objectUrl = null;
      }
      if (!objectUrl) continue;

      const asset = {
        id: 'asset-local-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8),
        name: f.filename,
        type: f.type,
        url: objectUrl,
        diskPath: f.relPath,
        localDisk: true,
        size: f.size || 0,
        duration: f.type === 'image' ? 5 : (f.type === 'audio' ? 10 : 5),
        color: f.type === 'image' ? '#6366f1' : (f.type === 'audio' ? '#06b6d4' : '#10b981'),
        source: 'local_scan',
        isBroll: true
      };
      await enrichAssetMetadata(asset);
      enrichedAssets.push(asset);
    }

    applyScannedAssets(enrichedAssets, `la carpeta "${localFolder?.name || ''}"`);
  };

  // Scan the server-side projects_media folder (fallback / legacy)
  const scanServerFolder = async () => {
    const diskFiles = await listDiskMediaFiles(projectFolder);
    if (!diskFiles.length) {
      setScanMessage({ type: 'empty', text: `La carpeta "${projectFolder}" no contiene archivos multimedia.` });
      return;
    }

    const existing = buildExistingSignatures();
    const newFiles = diskFiles.filter(f => {
      const byName = existing.has(String(f.filename).toLowerCase());
      const byUrl = existing.has(String(f.url).toLowerCase());
      return !byName && !byUrl;
    });

    if (!newFiles.length) {
      setScanMessage({ type: 'uptodate', text: `Todo sincronizado: ${diskFiles.length} archivo(s) ya en la biblioteca.` });
      return;
    }

    const enrichedAssets = [];
    for (const f of newFiles) {
      const asset = buildAssetFromDiskFile(f, projectFolder);
      await enrichAssetMetadata(asset);
      enrichedAssets.push(asset);
    }

    applyScannedAssets(enrichedAssets, `"${projectFolder}"`);
  };

  const applyScannedAssets = (enrichedAssets, sourceLabel) => {
    if (!enrichedAssets.length) {
      setScanMessage({ type: 'uptodate', text: 'No hay archivos nuevos para añadir.' });
      return;
    }
    if (typeof onAddAssets === 'function') {
      onAddAssets(enrichedAssets);
    } else {
      enrichedAssets.forEach(a => onAddAsset(a));
    }
    setScanMessage({
      type: 'success',
      text: `Sincronizados ${enrichedAssets.length} archivo(s) nuevos desde ${sourceLabel}.`
    });
  };

  scanFolderRef.current = handleScanFolder;

  const handleFiles = async (files) => {
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/');
      const isAudio = file.type.startsWith('audio/');
      const isVideo = file.type.startsWith('video/');

      if (!isImage && !isAudio && !isVideo) continue;

      const assetId = 'asset-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      let objectUrl = URL.createObjectURL(file);
      let localDisk = false;
      let diskPath = null;

      // If a local media folder is connected, write the raw file straight to disk.
      if (localFolder && localFolder.handle && !localFolder.needsPermission) {
        try {
          const written = await writeLocalMediaFile({
            rootHandle: localFolder.handle,
            filename: file.name,
            blob: file
          });
          objectUrl = written.objectUrl;
          localDisk = true;
          diskPath = `${written.folder}/${written.filename}`;
        } catch (err) {
          console.warn('Could not write uploaded file to local disk, using memory:', err);
        }
      }

      // Always keep an IndexedDB copy as a safety net / fallback
      saveMediaBlob(assetId, file, { name: file.name, type: file.type });

      const newAsset = {
        id: assetId,
        name: file.name,
        type: isImage ? 'image' : (isAudio ? 'audio' : 'video'),
        url: objectUrl,
        file: file,
        localDisk,
        diskPath: diskPath || undefined,
        duration: isAudio ? 10 : 5,
        size: file.size,
        color: isImage ? '#6366f1' : (isAudio ? '#06b6d4' : '#10b981')
      };

      if (isImage) {
        const img = new Image();
        img.onload = () => {
          newAsset.width = img.naturalWidth;
          newAsset.height = img.naturalHeight;
          newAsset.thumbnail = objectUrl;
          onAddAsset(newAsset);
        };
        img.onerror = () => onAddAsset(newAsset);
        img.src = objectUrl;
      } else if (isVideo) {
        const tempVid = document.createElement('video');
        tempVid.preload = 'metadata';
        tempVid.src = objectUrl;
        tempVid.muted = true;
        tempVid.onloadedmetadata = () => {
          newAsset.duration = (isFinite(tempVid.duration) && tempVid.duration > 0)
            ? Number(tempVid.duration.toFixed(2))
            : 5;
          newAsset.width = tempVid.videoWidth;
          newAsset.height = tempVid.videoHeight;
          tempVid.currentTime = Math.min(0.5, tempVid.duration / 2);
        };
        tempVid.onseeked = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 90;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(tempVid, 0, 0, 160, 90);
            newAsset.thumbnail = canvas.toDataURL('image/jpeg', 0.8);
          } catch {
            // ignore canvas security/encoding fallback
          }
          onAddAsset(newAsset);
        };
        tempVid.onerror = () => onAddAsset(newAsset);
      } else if (isAudio) {
        extractWaveformData(file)
          .then(({ duration, peaks }) => {
            newAsset.duration = duration;
            newAsset.waveform = peaks;
            onAddAsset(newAsset);
          })
          .catch((err) => {
            console.warn('Fallback metadata extraction for audio:', err);
            const audio = new Audio();
            audio.src = objectUrl;
            audio.onloadedmetadata = () => {
              const dur = (isFinite(audio.duration) && audio.duration > 0)
                ? Number(audio.duration.toFixed(2))
                : 10;
              newAsset.duration = dur;
              onAddAsset(newAsset);
            };
            audio.onerror = () => onAddAsset(newAsset);
          });
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const filteredAssets = assets.filter((asset) => {
    if (filter === 'images') return asset.type === 'image';
    if (filter === 'audio') return asset.type === 'audio';
    if (filter === 'video') return asset.type === 'video';
    return true;
  });

  return (
    <div className="media-library">
      <div className="media-library-header">
        <div className="filter-pills">
          <button
            className={`pill-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Todos ({assets.length})
          </button>
          <button
            className={`pill-btn ${filter === 'videos' ? 'active' : ''}`}
            onClick={() => setFilter('videos')}
          >
            Videos ({assets.filter(a => a.type === 'video').length})
          </button>
          <button
            className={`pill-btn ${filter === 'images' ? 'active' : ''}`}
            onClick={() => setFilter('images')}
          >
            Imágenes ({assets.filter(a => a.type === 'image').length})
          </button>
          <button
            className={`pill-btn ${filter === 'audio' ? 'active' : ''}`}
            onClick={() => setFilter('audio')}
          >
            Audio ({assets.filter(a => a.type === 'audio').length})
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="btn-ghost btn-sm"
            onClick={handleScanFolder}
            disabled={isScanning}
            title={`Buscar archivos ya existentes en la carpeta projects_media/${projectFolder}/`}
            style={{ whiteSpace: 'nowrap' }}
          >
            {isScanning ? <Loader2 size={14} className="spinner" /> : <RefreshCw size={14} />}
            {isScanning ? 'Escaneando...' : 'Escanear carpeta'}
          </button>
          <button
            className="btn-primary btn-sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} />
            Subir
          </button>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => handleFiles(e.target.files)}
          multiple
          accept="image/*,audio/*,video/*"
          style={{ display: 'none' }}
        />
      </div>

      {/* Scan feedback message */}
      {scanMessage && (
        <div style={{
          padding: '6px 12px',
          fontSize: '11px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          background: scanMessage.type === 'error' ? 'rgba(239, 68, 68, 0.08)'
            : scanMessage.type === 'success' ? 'rgba(16, 185, 129, 0.08)'
            : 'rgba(100, 116, 139, 0.08)',
          borderBottom: '1px solid var(--border-subtle)',
          color: scanMessage.type === 'error' ? '#f87171'
            : scanMessage.type === 'success' ? '#34d399'
            : 'var(--text-secondary)'
        }}>
          <span>{scanMessage.text}</span>
          <button
            type="button"
            onClick={() => setScanMessage(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '13px', lineHeight: 1 }}
            title="Cerrar"
          >
            ×
          </button>
        </div>
      )}

      {/* Local Media Folder Bar (Clipchamp-style disk access) */}
      {localSupported && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          padding: '7px 12px',
          background: localFolder && !localFolder.needsPermission
            ? 'rgba(16, 185, 129, 0.07)'
            : 'rgba(245, 158, 11, 0.07)',
          borderBottom: '1px solid rgba(148, 163, 184, 0.15)',
          fontSize: '11px'
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            {localFolder && !localFolder.needsPermission ? (
              <>
                <FolderOpen size={13} style={{ color: '#34d399', flexShrink: 0 }} />
                <span style={{ color: '#34d399', fontWeight: 600, whiteSpace: 'nowrap' }}>Carpeta local:</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={localFolder.name}>
                  {localFolder.name}/
                </span>
              </>
            ) : localFolder && localFolder.needsPermission ? (
              <>
                <AlertTriangle size={13} style={{ color: '#fbbf24', flexShrink: 0 }} />
                <span style={{ color: '#fbbf24' }}>Permiso pendiente para "{localFolder.name}"</span>
              </>
            ) : (
              <>
                <HardDrive size={13} style={{ color: '#fbbf24', flexShrink: 0 }} />
                <span style={{ color: 'var(--text-secondary)' }}>
                  Conecta una carpeta de tu disco para guardar aquí tus medios
                </span>
              </>
            )}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {localFolder && localFolder.needsPermission ? (
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={handleReconnectFolder}
                disabled={isConnectingFolder}
                style={{ whiteSpace: 'nowrap', fontSize: '11px' }}
              >
                <FolderOpen size={12} /> Reconectar
              </button>
            ) : (
              <button
                type="button"
                className={localFolder ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'}
                onClick={handleConnectFolder}
                disabled={isConnectingFolder}
                style={{ whiteSpace: 'nowrap', fontSize: '11px' }}
                title="Elegir una carpeta de tu disco donde vivirán los medios de tus proyectos"
              >
                {isConnectingFolder ? <Loader2 size={12} className="spinner" /> : <FolderPlus size={12} />}
                {localFolder ? 'Cambiar' : 'Conectar carpeta'}
              </button>
            )}
            {localFolder && !localFolder.needsPermission && (
              <button
                type="button"
                className="btn-ghost icon-only btn-sm"
                onClick={handleDisconnectFolder}
                title="Desconectar carpeta local"
                style={{ fontSize: '11px' }}
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}

      {/* Drag & Drop Upload Zone */}
      <div
        className={`dropzone ${isDragging ? 'dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={22} className="dropzone-icon" />
        <p className="dropzone-text">Arrastra imágenes o audios aquí</p>
        <span className="dropzone-sub">o haz clic para explorar tu disco local</span>
      </div>

      {/* Assets Grid */}
      <div className="assets-grid">
        {filteredAssets.length === 0 ? (
          <div className="empty-assets">
            <p>No hay recursos cargados.</p>
          </div>
        ) : (
          filteredAssets.map((asset) => (
            <div
              key={asset.id}
              className="asset-card"
              draggable
              onDragStart={(e) => {
                window.__draggedAsset = asset;
                try {
                  e.dataTransfer.setData('application/x-montage-asset-id', String(asset.id));
                  e.dataTransfer.setData('text/plain', String(asset.id));
                  e.dataTransfer.effectAllowed = 'copy';
                } catch (err) {
                  console.warn('Drag dataTransfer error:', err);
                }
              }}
              onDragEnd={() => {
                window.__draggedAsset = null;
              }}
            >
              <div className="asset-thumbnail">
                {asset.type === 'image' && (
                  <img src={asset.thumbnail || asset.url} alt={asset.name} />
                )}
                {asset.type === 'audio' && (
                  <div className="audio-card-preview">
                    <Music size={28} className="text-cyan" />
                    <span className="audio-duration-badge timecode">{asset.duration}s</span>
                  </div>
                )}
                {asset.type === 'video' && (
                  asset.thumbnail ? (
                    <img src={asset.thumbnail} alt={asset.name} />
                  ) : (
                    <div className="video-card-preview">
                      <Film size={28} className="text-emerald" />
                    </div>
                  )
                )}
                <div className="asset-type-badge">
                  {asset.type === 'image' && <ImageIcon size={11} />}
                  {asset.type === 'audio' && <Music size={11} />}
                  {asset.type === 'video' && <Film size={11} />}
                  <span>{asset.type}</span>
                  {asset.isBroll && (
                    <span style={{ marginLeft: '4px', background: 'rgba(6, 182, 212, 0.4)', color: '#38bdf8', padding: '1px 4px', borderRadius: '3px', fontSize: '9px', fontWeight: 600 }}>
                      B-Roll
                    </span>
                  )}
                </div>
              </div>

              <div className="asset-info">
                <span className="asset-title" title={asset.name}>{asset.name}</span>
                {asset.width && asset.height && (
                  <span className="asset-meta">{asset.width}×{asset.height}</span>
                )}
              </div>

              <div className="asset-card-actions">
                <button
                  className="btn-ghost icon-only btn-sm"
                  title="Añadir a la línea de tiempo"
                  onClick={() => onAddToTimeline(asset)}
                >
                  <Plus size={14} className="text-indigo" />
                </button>
                <button
                  className="btn-ghost icon-only btn-sm text-dim"
                  title="Eliminar recurso"
                  onClick={() => onDeleteAsset(asset.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});
