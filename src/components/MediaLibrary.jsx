import React, { useRef, useState, useEffect } from 'react';
import { Upload, Image as ImageIcon, Music, Film, Plus, Trash2, CheckCircle2, HardDrive } from 'lucide-react';
import { saveMediaBlob } from '../utils/storage';
import { getStorageDiskInfo } from '../utils/stockMediaClient';
import { extractWaveformData } from '../utils/audioWaveform';

export const MediaLibrary = React.memo(function MediaLibrary({ assets = [], onAddAsset, onDeleteAsset, onAddToTimeline }) {
  const [filter, setFilter] = useState('all');
  const [isDragging, setIsDragging] = useState(false);
  const [diskInfo, setDiskInfo] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    getStorageDiskInfo().then(info => setDiskInfo(info));
  }, [assets.length]);

  const handleFiles = async (files) => {
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/');
      const isAudio = file.type.startsWith('audio/');
      const isVideo = file.type.startsWith('video/');

      if (!isImage && !isAudio && !isVideo) continue;

      const assetId = 'asset-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      const objectUrl = URL.createObjectURL(file);

      // Persist raw file locally in IndexedDB (Clipchamp style local persistence)
      saveMediaBlob(assetId, file, { name: file.name, type: file.type });

      const newAsset = {
        id: assetId,
        name: file.name,
        type: isImage ? 'image' : (isAudio ? 'audio' : 'video'),
        url: objectUrl,
        file: file,
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

        <button
          className="btn-primary btn-sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={14} />
          Subir
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => handleFiles(e.target.files)}
          multiple
          accept="image/*,audio/*,video/*"
          style={{ display: 'none' }}
        />
      </div>

      {/* Disk Storage Info Bar */}
      {diskInfo && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 12px',
          background: 'rgba(6, 182, 212, 0.05)',
          borderBottom: '1px solid rgba(6, 182, 212, 0.15)',
          fontSize: '11px'
        }}>
          <span style={{ color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <HardDrive size={12} />
            <span>projects_media/</span>
          </span>
          <span style={{ color: 'var(--text-dim)' }}>
            {diskInfo.totalFiles} en disco ({diskInfo.formattedSize})
          </span>
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
