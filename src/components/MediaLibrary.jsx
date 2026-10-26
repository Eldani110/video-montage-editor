import React, { useRef, useState, useEffect } from 'react';
import {
  Upload,
  Image as ImageIcon,
  Music,
  Film,
  Plus,
  Trash2,
  HardDrive,
  Search,
  FolderOpen,
  Grid,
  List as ListIcon
} from 'lucide-react';
import { saveMediaBlob } from '../utils/storage';
import { getStorageDiskInfo, getProjectMediaFolder } from '../utils/stockMediaClient';
import { extractWaveformData, getOrLoadWaveform } from '../utils/audioWaveform';
import {
  detectMediaType,
  normalizeMediaFile,
  extractVideoMetadata,
  uploadMediaAsset,
  ACCEPTED_MEDIA_TYPES_INPUT
} from '../utils/mediaTypeUtils';
import { MediaAdaptModal } from './MediaAdaptModal';

function formatShortDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec || 0)));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

export const MediaLibrary = React.memo(function MediaLibrary({
  assets = [],
  onAddAsset,
  onUpdateAsset,
  onDeleteAsset,
  onAddToTimeline,
  project,
  onOpenProjectSettings
}) {
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [thumbScale, setThumbScale] = useState(125); // px min-width for grid cards
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [diskInfo, setDiskInfo] = useState(null);
  const [adaptModal, setAdaptModal] = useState({
    isOpen: false,
    currentFile: '',
    currentIndex: 1,
    totalFiles: 1,
    percent: 0,
    statusText: '',
    isFinished: false
  });
  const fileInputRef = useRef(null);

  const projectFolder = getProjectMediaFolder(project);

  useEffect(() => {
    getStorageDiskInfo(projectFolder).then(info => setDiskInfo(info));
  }, [assets.length, projectFolder]);

  const handleFiles = async (files) => {
    const rawFiles = Array.from(files);
    const movFiles = rawFiles.filter(f => {
      const info = detectMediaType(f);
      return info?.type === 'video' && (/\.(mov|qt)$/i.test(f.name) || f.type === 'video/quicktime');
    });

    const isAdapting = movFiles.length > 0;
    if (isAdapting) {
      setAdaptModal({
        isOpen: true,
        currentFile: movFiles[0].name,
        currentIndex: 1,
        totalFiles: movFiles.length,
        percent: 5,
        statusText: 'Iniciando adaptación de video iPhone...',
        isFinished: false
      });
    }

    let movIndex = 0;
    for (const rawFile of rawFiles) {
      const mediaInfo = detectMediaType(rawFile);
      if (!mediaInfo) continue;

      const file = normalizeMediaFile(rawFile);
      const isImage = mediaInfo.type === 'image';
      const isAudio = mediaInfo.type === 'audio';
      const isVideo = mediaInfo.type === 'video';

      const assetId = 'asset-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      const objectUrl = URL.createObjectURL(file);

      // Link by reference/streaming: do NOT duplicate heavy media files (> 15MB) into IndexedDB
      if (file.size < 15 * 1024 * 1024 && !isVideo) {
        saveMediaBlob(assetId, file, { name: file.name, type: mediaInfo.mime }).catch(() => {});
      }

      const newAsset = {
        id: assetId,
        name: file.name,
        type: mediaInfo.type,
        url: objectUrl,
        file: file,
        duration: isAudio ? 10 : 5,
        size: file.size,
        color: isImage ? '#7c69ef' : (isAudio ? '#10b981' : '#7c69ef')
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
        const isMov = /\.(mov|qt)$/i.test(file.name) || file.type === 'video/quicktime';
        if (isMov) {
          movIndex++;
          setAdaptModal(prev => ({
            ...prev,
            currentFile: file.name,
            currentIndex: movIndex,
            percent: Math.round(((movIndex - 0.7) / movFiles.length) * 100),
            statusText: `Adaptando video ${movIndex} de ${movFiles.length} a H.264 compatible...`
          }));

          const upRes = await uploadMediaAsset(file, projectFolder, (p, text) => {
            const baseP = ((movIndex - 1) / movFiles.length) * 100;
            const filePortion = (p / 100) * (100 / movFiles.length);
            setAdaptModal(prev => ({
              ...prev,
              percent: Math.min(95, Math.round(baseP + filePortion)),
              statusText: text
            }));
          });

          if (upRes && !upRes.success && upRes.error) {
            alert(`No se pudo importar "${file.name}":\n\n${upRes.error}`);
            continue;
          }

          if (upRes && upRes.success) {
            newAsset.name = upRes.name;
            newAsset.diskPath = upRes.diskPath;
            newAsset.url = upRes.url;
            newAsset.previewUrl = upRes.previewUrl;
            if (upRes.thumbnailUrl) newAsset.thumbnail = upRes.thumbnailUrl;
            if (upRes.duration) newAsset.duration = upRes.duration;
            if (upRes.width) newAsset.width = upRes.width;
            if (upRes.height) newAsset.height = upRes.height;
            if (upRes.rotation) newAsset.rotation = upRes.rotation;
            newAsset.isAdapted = true;
            newAsset.originalName = upRes.originalName;
            newAsset.originalDiskPath = upRes.originalDiskPath;
          } else {
            try {
              const meta = await extractVideoMetadata(file, objectUrl);
              newAsset.duration = meta.duration || 5;
              newAsset.width = meta.width || 1280;
              newAsset.height = meta.height || 720;
              newAsset.thumbnail = meta.thumbnail;
            } catch (_) {}
          }

          onAddAsset(newAsset);
          getOrLoadWaveform(newAsset).catch(() => {});
        } else {
          try {
            const meta = await extractVideoMetadata(file, objectUrl);
            newAsset.duration = meta.duration || 5;
            newAsset.width = meta.width || 1280;
            newAsset.height = meta.height || 720;
            newAsset.thumbnail = meta.thumbnail;
            if (meta.previewUrl) newAsset.previewUrl = meta.previewUrl;
            if (meta.diskPath) newAsset.diskPath = meta.diskPath;
          } catch (_) {}

          uploadMediaAsset(file, projectFolder).then((upRes) => {
            if (upRes && upRes.success && onUpdateAsset) {
              newAsset.diskPath = upRes.diskPath;
              newAsset.previewUrl = upRes.previewUrl;
              if (upRes.thumbnailUrl) newAsset.thumbnail = upRes.thumbnailUrl;
              onUpdateAsset(newAsset);
            }
          }).catch(() => {});

          onAddAsset(newAsset);
          getOrLoadWaveform(newAsset).catch(() => {});
        }
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

    if (isAdapting) {
      setAdaptModal(prev => ({
        ...prev,
        percent: 100,
        statusText: '¡Videos adaptados y listos en la carpeta!',
        isFinished: true
      }));
      setTimeout(() => {
        setAdaptModal(prev => ({ ...prev, isOpen: false }));
      }, 800);
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
    if (filter === 'images' && asset.type !== 'image') return false;
    if (filter === 'audio' && asset.type !== 'audio') return false;
    if (filter === 'videos' && asset.type !== 'video') return false;
    if (searchQuery.trim()) {
      return (asset.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase());
    }
    return true;
  });

  return (
    <div
      className="media-library"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0' }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Premiere Pro Bin Subheader (Folder Breadcrumb + Search Row) */}
      <div className="premiere-bin-subheader">
        <div className="premiere-bin-breadcrumb" title={diskInfo ? `${diskInfo.mediaDir}/${projectFolder}` : projectFolder}>
          <FolderOpen size={13} style={{ color: '#a8a8a8', flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {(diskInfo?.mediaDir || 'projects_media').split('/').pop()}\{projectFolder}\Bin Principal
          </span>
          {onOpenProjectSettings && (
            <button
              type="button"
              onClick={onOpenProjectSettings}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: 'none',
                color: '#3898ff',
                fontSize: '10px',
                cursor: 'pointer'
              }}
              title="Configurar carpeta de medios del proyecto"
            >
              Ruta
            </button>
          )}
        </div>

        <div className="premiere-bin-search-row">
          <div className="premiere-bin-search-box">
            <Search size={12} style={{ color: '#888888', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Buscar en Bin..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <span className="premiere-bin-count">
            {selectedAssetId ? `1 de ${filteredAssets.length} sel.` : `${filteredAssets.length} items`}
          </span>
        </div>

        {/* Compact Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', paddingTop: '2px' }}>
          <div className="filter-pills" style={{ gap: '3px' }}>
            <button
              className={`pill-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
              style={{ padding: '2px 7px', fontSize: '10.5px' }}
            >
              Todos ({assets.length})
            </button>
            <button
              className={`pill-btn ${filter === 'videos' ? 'active' : ''}`}
              onClick={() => setFilter('videos')}
              style={{ padding: '2px 7px', fontSize: '10.5px' }}
            >
              Videos ({assets.filter(a => a.type === 'video').length})
            </button>
            <button
              className={`pill-btn ${filter === 'images' ? 'active' : ''}`}
              onClick={() => setFilter('images')}
              style={{ padding: '2px 7px', fontSize: '10.5px' }}
            >
              Fotos ({assets.filter(a => a.type === 'image').length})
            </button>
            <button
              className={`pill-btn ${filter === 'audio' ? 'active' : ''}`}
              onClick={() => setFilter('audio')}
              style={{ padding: '2px 7px', fontSize: '10.5px' }}
            >
              Audio ({assets.filter(a => a.type === 'audio').length})
            </button>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handleFiles(e.target.files)}
            multiple
            accept={ACCEPTED_MEDIA_TYPES_INPUT}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* Assets Container (Premiere Icon View or List View) */}
      <div
        className="assets-grid"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
          display: viewMode === 'grid' ? 'grid' : 'flex',
          flexDirection: viewMode === 'list' ? 'column' : undefined,
          gridTemplateColumns: viewMode === 'grid' ? `repeat(auto-fill, minmax(${thumbScale}px, 1fr))` : undefined,
          alignContent: 'start',
          gap: '8px',
          background: isDragging ? 'rgba(43, 125, 233, 0.08)' : '#191919'
        }}
      >
        {filteredAssets.length === 0 ? (
          <div
            className="empty-assets"
            onClick={() => fileInputRef.current?.click()}
            style={{
              gridColumn: '1 / -1',
              border: '1px dashed #363636',
              borderRadius: '4px',
              padding: '28px 14px',
              textAlign: 'center',
              cursor: 'pointer',
              background: '#1e1e1e'
            }}
          >
            <Upload size={22} style={{ color: '#2b7de9', marginBottom: '6px' }} />
            <p style={{ fontSize: '12px', color: '#d4d4d4', fontWeight: 500 }}>Importar medios para empezar</p>
            <span style={{ fontSize: '11px', color: '#787878' }}>Arrastra clips de video, fotos o audio aquí o haz clic</span>
          </div>
        ) : (
          filteredAssets.map((asset) => {
            const isSel = selectedAssetId === asset.id;
            return (
              <div
                key={asset.id}
                className="asset-card"
                draggable
                onClick={() => setSelectedAssetId(asset.id)}
                onDoubleClick={() => onAddToTimeline(asset)}
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
                style={{
                  background: isSel ? '#363636' : '#232323',
                  border: isSel ? '1px solid #2b7de9' : '1px solid #121212',
                  borderRadius: '3px',
                  padding: viewMode === 'list' ? '4px 8px' : '5px',
                  display: 'flex',
                  flexDirection: viewMode === 'list' ? 'row' : 'column',
                  alignItems: viewMode === 'list' ? 'center' : 'stretch',
                  gap: '5px',
                  cursor: 'grab'
                }}
              >
                <div
                  className="asset-thumbnail"
                  style={{
                    height: viewMode === 'list' ? '32px' : '78px',
                    width: viewMode === 'list' ? '56px' : '100%',
                    borderRadius: '2px',
                    background: '#111111',
                    position: 'relative',
                    overflow: 'hidden',
                    flexShrink: 0
                  }}
                >
                  {asset.type === 'image' && (
                    <img src={asset.thumbnail || asset.url} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  {asset.type === 'audio' && (
                    <div className="audio-card-preview" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Music size={22} style={{ color: '#10b981' }} />
                    </div>
                  )}
                  {asset.type === 'video' && (
                    asset.thumbnail ? (
                      <img src={asset.thumbnail} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div className="video-card-preview" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Film size={22} style={{ color: '#3898ff' }} />
                      </div>
                    )
                  )}

                  {/* Premiere Pro Bottom-Right Media Type Badge inside Thumbnail */}
                  <div
                    style={{
                      position: 'absolute',
                      right: '4px',
                      bottom: '4px',
                      background: 'rgba(17, 17, 17, 0.85)',
                      border: '1px solid rgba(56, 152, 255, 0.45)',
                      borderRadius: '2px',
                      padding: '1px 3px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '2px',
                      color: '#3898ff'
                    }}
                  >
                    {asset.type === 'video' && <Film size={10} />}
                    {asset.type === 'image' && <ImageIcon size={10} />}
                    {asset.type === 'audio' && <Music size={10} style={{ color: '#10b981' }} />}
                  </div>
                </div>

                {/* Premiere Pro Filename + Duration Row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '4px',
                  minWidth: 0,
                  flex: 1
                }}>
                  <span
                    className="asset-title"
                    title={asset.name}
                    style={{
                      fontSize: '11px',
                      color: '#dcdcdc',
                      fontWeight: 400,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {asset.name}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10.5px',
                    color: '#9e9e9e',
                    flexShrink: 0
                  }}>
                    {formatShortDuration(asset.duration)}
                  </span>
                </div>

                <div className="asset-card-actions" style={{ top: '6px', right: '6px' }}>
                  <button
                    className="btn-ghost icon-only btn-sm"
                    title="Insertar en secuencia"
                    onClick={(e) => { e.stopPropagation(); onAddToTimeline(asset); }}
                  >
                    <Plus size={13} style={{ color: '#3898ff' }} />
                  </button>
                  <button
                    className="btn-ghost icon-only btn-sm text-dim"
                    title="Eliminar del Bin"
                    onClick={(e) => { e.stopPropagation(); onDeleteAsset(asset.id); }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Premiere Pro Bin Bottom Toolbar */}
      <div className="premiere-bin-footer">
        <div className="premiere-bin-footer-group">
          <button
            type="button"
            className={`premiere-bin-icon-btn ${viewMode === 'list' ? 'active' : ''}`}
            title="Vista de Lista"
            onClick={() => setViewMode('list')}
          >
            <ListIcon size={13} />
          </button>
          <button
            type="button"
            className={`premiere-bin-icon-btn ${viewMode === 'grid' ? 'active' : ''}`}
            title="Vista de Iconos"
            onClick={() => setViewMode('grid')}
          >
            <Grid size={13} />
          </button>
          {viewMode === 'grid' && (
            <input
              type="range"
              min="95"
              max="180"
              value={thumbScale}
              onChange={(e) => setThumbScale(Number(e.target.value))}
              style={{ width: '56px', height: '3px', accentColor: '#2b7de9', cursor: 'pointer' }}
              title="Tamaño de miniaturas del Bin"
            />
          )}
        </div>

        <div className="premiere-bin-footer-group">
          <button
            type="button"
            className="premiere-bin-icon-btn"
            title="Importar archivos multimedia al Bin"
            onClick={() => fileInputRef.current?.click()}
            style={{ width: 'auto', padding: '0 6px', gap: '4px', color: '#3898ff', fontSize: '10.5px', fontWeight: 600 }}
          >
            <Upload size={12} />
            <span>Importar</span>
          </button>
          <button
            type="button"
            className="premiere-bin-icon-btn"
            title="Eliminar recurso seleccionado"
            disabled={!selectedAssetId}
            onClick={() => {
              if (selectedAssetId) {
                onDeleteAsset(selectedAssetId);
                setSelectedAssetId(null);
              }
            }}
            style={{ opacity: selectedAssetId ? 1 : 0.35 }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <MediaAdaptModal {...adaptModal} />
    </div>
  );
});
