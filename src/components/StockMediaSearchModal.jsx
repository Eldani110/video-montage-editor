import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  Video,
  Image as ImageIcon,
  Download,
  Loader2,
  CheckCircle2,
  HardDrive,
  Key,
  ExternalLink,
  Film,
  Sparkles,
  Play,
  RefreshCw,
  Plus,
  SlidersHorizontal,
  Compass,
  Globe
} from 'lucide-react';
import {
  searchStockMedia,
  getSavedStockConfig,
  saveStockConfig,
  getStorageDiskInfo,
  translateQueryForStock,
  extractSceneConceptPills
} from '../utils/stockMediaClient';
import { assignStockMediaToScene } from '../utils/sceneBrollManager';

export function StockMediaSearchModal({
  isOpen,
  onClose,
  scene,
  project,
  onMediaAssigned
}) {
  const [query, setQuery] = useState('');
  const [mediaType, setMediaType] = useState('video'); // 'video' | 'image'
  const [provider, setProvider] = useState('pexels');
  const [perPage, setPerPage] = useState(16); // Default 16 instead of 8!
  const [page, setPage] = useState(1);
  const [results, setResults] = useState([]);
  const [totalResults, setTotalResults] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successInfo, setSuccessInfo] = useState(null);
  const [stockConfig, setStockConfig] = useState(getSavedStockConfig());
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [hoveredVideoId, setHoveredVideoId] = useState(null);
  const [diskInfo, setDiskInfo] = useState(null);

  // Compute concept pills
  const conceptPills = useMemo(() => {
    return extractSceneConceptPills(scene);
  }, [scene]);

  // English translation preview for transparency
  const translatedPreview = useMemo(() => {
    return translateQueryForStock(query);
  }, [query]);

  // Initialize query from scene
  useEffect(() => {
    if (isOpen && scene) {
      // Clean up common transcript artifacts (e.g. 'laia' -> 'IA')
      let initialKeywords = [];
      if (scene.searchKeywords && scene.searchKeywords.length > 0) {
        initialKeywords = scene.searchKeywords.map(k => k.toLowerCase().replace(/laia/g, 'ia'));
      }

      // Prioritize strong composite terms over single ambiguous words
      let initialQuery = initialKeywords.length > 0
        ? initialKeywords.slice(0, 3).join(' ')
        : (scene.title || 'tecnologia');

      // If query was 'ia enfrenta problema' or 'laia enfrenta problema', give a high-value default
      if (/ia.*problema|laia.*problema/i.test(initialQuery)) {
        initialQuery = 'IA tecnología desafío';
      }

      setQuery(initialQuery);
      setMediaType(scene.visualType || 'video');
      setSuccessInfo(null);
      setErrorMessage(null);
      setPage(1);
      const cfg = getSavedStockConfig();
      setStockConfig(cfg);
      setProvider(cfg.preferredProvider || 'pexels');

      getStorageDiskInfo().then(info => setDiskInfo(info));

      // Trigger automatic initial search
      performSearch(initialQuery, scene.visualType || 'video', cfg.preferredProvider || 'pexels', 1, perPage, false);
    }
  }, [isOpen, scene]);

  if (!isOpen || !scene) return null;

  const performSearch = async (searchQuery, typeToSearch, providerToSearch, pageToSearch = 1, limit = perPage, isAppend = false) => {
    if (!searchQuery.trim()) return;

    if (isAppend) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setResults([]);
    }
    setErrorMessage(null);

    try {
      const data = await searchStockMedia({
        query: searchQuery,
        type: typeToSearch,
        provider: providerToSearch,
        apiKey: providerToSearch === 'pexels' ? stockConfig.pexelsApiKey : stockConfig.pixabayApiKey,
        orientation: stockConfig.preferredOrientation || 'landscape',
        page: pageToSearch,
        perPage: limit
      });

      if (isAppend) {
        setResults(prev => [...prev, ...(data.results || [])]);
      } else {
        setResults(data.results || []);
      }

      setPage(pageToSearch);
      setTotalResults(data.totalResults || 0);
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      console.error('Error in stock search:', err);
      setErrorMessage(err.message || 'Error al conectar con la API de stock');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    performSearch(query, mediaType, provider, 1, perPage, false);
  };

  const handleLoadMore = () => {
    if (isLoadingMore || !hasMore) return;
    const nextPage = page + 1;
    performSearch(query, mediaType, provider, nextPage, perPage, true);
  };

  const handlePillClick = (searchTerm) => {
    setQuery(searchTerm);
    setPage(1);
    performSearch(searchTerm, mediaType, provider, 1, perPage, false);
  };

  const handleAppendKeyword = (keyword) => {
    const newQuery = query ? `${query} ${keyword}` : keyword;
    setQuery(newQuery);
    setPage(1);
    performSearch(newQuery, mediaType, provider, 1, perPage, false);
  };

  const handleSelectMedia = async (mediaItem) => {
    setDownloadingId(mediaItem.id);
    setErrorMessage(null);
    try {
      const { updatedProject, newAsset } = await assignStockMediaToScene({
        project,
        scene,
        mediaItem,
        trackPreference: stockConfig.targetTrack || 'v2'
      });

      setSuccessInfo({
        name: newAsset.name,
        localUrl: newAsset.url,
        diskPath: newAsset.diskPath
      });

      if (onMediaAssigned) {
        onMediaAssigned(updatedProject);
      }

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Error downloading and assigning media:', err);
      setErrorMessage(`Error al descargar archivo a disco: ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSaveKey = (e) => {
    e.preventDefault();
    saveStockConfig(stockConfig);
    setShowKeyConfig(false);
    performSearch(query, mediaType, provider, 1, perPage, false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '980px',
          maxWidth: '96vw',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          background: 'var(--bg-panel)',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #06b6d4, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              flexShrink: 0
            }}>
              <Film size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
                Buscar B-Roll para [E{scene.sceneNumber}] &ldquo;{scene.title}&rdquo;
              </h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '3px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                <span>Duración escena: <strong>{scene.duration}s</strong></span>
                <span>•</span>
                <span className="timecode">[{scene.startTime}s - {scene.endTime}s]</span>
                <span>•</span>
                <span style={{ color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <HardDrive size={11} /> Descarga directa a disco (/projects_media)
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-secondary btn-xs"
              onClick={() => setShowKeyConfig(!showKeyConfig)}
              style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Key size={12} />
              {showKeyConfig ? 'Cerrar Claves' : 'Configurar Clave API'}
            </button>
            <button className="btn-ghost icon-only" onClick={onClose} title="Cerrar ventana">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* API Key Drawer (if expanded) */}
        {showKeyConfig && (
          <div style={{
            background: 'rgba(6, 182, 212, 0.05)',
            borderBottom: '1px solid rgba(6, 182, 212, 0.2)',
            padding: '14px 20px',
            fontSize: '12px'
          }}>
            <form onSubmit={handleSaveKey} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>
                  Clave API de Pexels (Gratis 20,000 req/mes):
                </label>
                <input
                  type="password"
                  placeholder="Ej: 563492ad6f91700001000001..."
                  value={stockConfig.pexelsApiKey || ''}
                  onChange={(e) => setStockConfig({ ...stockConfig, pexelsApiKey: e.target.value })}
                  style={{ width: '100%', height: '32px', fontSize: '11px' }}
                />
              </div>

              <div style={{ flex: 1, minWidth: '240px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>
                  Clave API de Pixabay (Opcional):
                </label>
                <input
                  type="password"
                  placeholder="Ej: 12345678-abcdef12345678..."
                  value={stockConfig.pixabayApiKey || ''}
                  onChange={(e) => setStockConfig({ ...stockConfig, pixabayApiKey: e.target.value })}
                  style={{ width: '100%', height: '32px', fontSize: '11px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="submit" className="btn-primary btn-sm" style={{ height: '32px' }}>
                  Guardar
                </button>
                <a
                  href="https://www.pexels.com/api/"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary btn-sm"
                  style={{ height: '32px', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                >
                  Obtener Clave Pexels <ExternalLink size={11} />
                </a>
              </div>
            </form>
          </div>
        )}

        {/* Search controls bar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}>
          {/* Smart Concept Pills */}
          {conceptPills.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, marginRight: '4px' }}>
                  <Sparkles size={13} style={{ color: '#06b6d4' }} /> Palabras y Conceptos:
                </span>
                {conceptPills.map((pill, idx) => {
                  const isActive = query.toLowerCase() === pill.searchTerm.toLowerCase() ||
                    query.toLowerCase().includes(pill.searchTerm.toLowerCase());

                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        background: isActive ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${isActive ? 'rgba(6, 182, 212, 0.5)' : 'var(--border-subtle)'}`,
                        borderRadius: '20px',
                        padding: '2px 8px',
                        gap: '4px',
                        fontSize: '11px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handlePillClick(pill.searchTerm)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: isActive ? '#06b6d4' : 'var(--text-primary)',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: '11px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                        title={`Buscar videos de "${pill.searchTerm}"`}
                      >
                        {pill.icon && <span>{pill.icon}</span>}
                        <span>{pill.label}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAppendKeyword(pill.searchTerm)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-dim)',
                          cursor: 'pointer',
                          padding: '0 2px',
                          fontSize: '12px',
                          lineHeight: 1
                        }}
                        title={`Combinar "${pill.searchTerm}" a la búsqueda actual (+)`}
                      >
                        +
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search Input and Filters */}
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div className="search-input-wrapper" style={{ flex: 1, position: 'relative' }}>
              <Search size={14} className="search-icon" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Escribe términos en español o inglés (ej: inteligencia artificial, servidores, alta tensión)..."
                className="search-input"
                style={{ fontSize: '12px', height: '36px', paddingRight: '30px' }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    padding: '2px'
                  }}
                  title="Limpiar búsqueda"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Type Toggle */}
            <div className="filter-pills" style={{ margin: 0 }}>
              <button
                type="button"
                className={`pill-btn ${mediaType === 'video' ? 'active' : ''}`}
                onClick={() => {
                  if (provider === 'web') return;
                  setMediaType('video');
                  performSearch(query, 'video', provider, 1, perPage, false);
                }}
                style={{
                  fontSize: '11px',
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  opacity: provider === 'web' ? 0.4 : 1,
                  cursor: provider === 'web' ? 'not-allowed' : 'pointer'
                }}
                title={provider === 'web' ? 'La búsqueda web directa devuelve imágenes de toda la web' : 'Solo Videos'}
              >
                <Video size={13} /> Videos
              </button>
              <button
                type="button"
                className={`pill-btn ${mediaType === 'image' ? 'active' : ''}`}
                onClick={() => { setMediaType('image'); performSearch(query, 'image', provider, 1, perPage, false); }}
                style={{ fontSize: '11px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <ImageIcon size={13} /> {provider === 'web' ? 'Imágenes Web' : 'Fotos'}
              </button>
            </div>

            {/* Provider Selector */}
            <select
              value={provider}
              onChange={(e) => {
                const nextProv = e.target.value;
                setProvider(nextProv);
                const nextType = nextProv === 'web' ? 'image' : mediaType;
                if (nextProv === 'web') {
                  setMediaType('image');
                }
                performSearch(query, nextType, nextProv, 1, perPage, false);
              }}
              style={{
                height: '36px',
                padding: '0 10px',
                borderRadius: '6px',
                fontSize: '11px',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <option value="pexels">Pexels (HD / 4K)</option>
              <option value="pixabay">Pixabay</option>
              <option value="web">🌐 Búsqueda Web (Abierta / Gratis)</option>
            </select>

            {/* Results Per Page Selector */}
            <select
              value={perPage}
              onChange={(e) => {
                const newLimit = parseInt(e.target.value, 10);
                setPerPage(newLimit);
                performSearch(query, mediaType, provider, 1, newLimit, false);
              }}
              style={{
                height: '36px',
                padding: '0 8px',
                borderRadius: '6px',
                fontSize: '11px',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)'
              }}
              title="Cantidad de resultados por página"
            >
              <option value={12}>12 / pág</option>
              <option value={16}>16 / pág</option>
              <option value={24}>24 / pág</option>
              <option value={32}>32 / pág</option>
            </select>

            <button type="submit" className="btn-primary btn-sm" disabled={isLoading} style={{ height: '36px', padding: '0 14px' }}>
              {isLoading ? <Loader2 size={14} className="spinner" /> : <Search size={14} />}
              Buscar
            </button>
          </form>

          {/* Context Translation Hint & Shot Prompt */}
          <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
              <Compass size={12} style={{ color: '#06b6d4', flexShrink: 0 }} />
              <strong>Toma sugerida:</strong> {scene.visualDescription}
            </span>
            {provider === 'web' ? (
              <span style={{ color: '#06b6d4', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Globe size={11} /> Búsqueda web exacta sin límites ni API Key
              </span>
            ) : (
              <span style={{ color: 'var(--text-dim)', fontSize: '10px' }}>
                Traducción técnica API: <code style={{ color: '#06b6d4', background: 'rgba(6,182,212,0.1)', padding: '1px 5px', borderRadius: '4px' }}>{translatedPreview}</code>
              </span>
            )}
          </div>
        </div>

        {/* Feedback message banner */}
        {errorMessage && (
          <div style={{ padding: '8px 20px', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', fontSize: '12px', borderBottom: '1px solid rgba(239, 68, 68, 0.2)' }}>
            {errorMessage}
          </div>
        )}

        {successInfo && (
          <div style={{ padding: '8px 20px', background: 'rgba(16, 185, 129, 0.12)', color: '#34d399', fontSize: '12px', borderBottom: '1px solid rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={14} />
            <span>¡Video descargado con éxito en disco local e insertado en la línea de tiempo!</span>
          </div>
        )}

        {/* Results Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
              <Loader2 size={36} className="spinner" style={{ margin: '0 auto 12px', color: '#06b6d4' }} />
              <p style={{ fontSize: '13px', margin: 0, fontWeight: 500 }}>Buscando tomas HD en catálogo ({perPage} resultados)...</p>
              <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>Traduciendo semánticamente al catálogo en inglés</p>
            </div>
          ) : results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
              <Film size={36} style={{ margin: '0 auto 12px', color: 'var(--text-dim)' }} />
              <p style={{ fontSize: '14px', margin: '0 0 6px 0', fontWeight: 600 }}>No se encontraron resultados para &ldquo;{query}&rdquo;</p>
              <p style={{ fontSize: '12px', color: 'var(--text-dim)', margin: '0 0 14px 0' }}>
                Prueba hacer clic en una de las píldoras de sugerencias arriba como &ldquo;Inteligencia Artificial&rdquo; o &ldquo;Data Center&rdquo;.
              </p>
              {conceptPills.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  {conceptPills.slice(0, 4).map((pill, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="btn-secondary btn-xs"
                      onClick={() => handlePillClick(pill.searchTerm)}
                    >
                      {pill.icon} {pill.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* Results status header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>
                  Mostrando <strong>{results.length}</strong> {mediaType === 'video' ? 'videos' : 'fotos'} {totalResults > 0 ? `de más de ${totalResults}` : ''}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  Pasa el ratón sobre un video para previsualizarlo
                </span>
              </div>

              {/* Grid cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                gap: '14px'
              }}>
                {results.map((item) => {
                  const isDownloading = downloadingId === item.id;
                  const isHovered = hoveredVideoId === item.id;

                  return (
                    <div
                      key={item.id}
                      onMouseEnter={() => setHoveredVideoId(item.id)}
                      onMouseLeave={() => setHoveredVideoId(null)}
                      style={{
                        background: 'var(--bg-card)',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        position: 'relative'
                      }}
                    >
                      {/* Media Preview Box */}
                      <div style={{ position: 'relative', width: '100%', height: '125px', background: '#000', overflow: 'hidden' }}>
                        {item.type === 'video' && isHovered && item.previewUrl ? (
                          <video
                            src={item.previewUrl}
                            autoPlay
                            muted
                            loop
                            playsInline
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <img
                            src={item.thumbnail || item.previewUrl}
                            alt={item.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        )}

                        {/* Badges */}
                        <div style={{ position: 'absolute', bottom: '6px', left: '6px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {item.provider === 'web' && (
                            <span style={{ fontSize: '9px', background: 'rgba(234, 88, 12, 0.9)', color: '#fff', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>
                              🌐 {item.sourceName || 'Web'}
                            </span>
                          )}
                          {item.duration && item.type === 'video' && (
                            <span style={{ fontSize: '9px', background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>
                              {item.duration}s
                            </span>
                          )}
                          <span style={{ fontSize: '9px', background: 'rgba(6, 182, 212, 0.9)', color: '#fff', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>
                            {item.width ? `${item.width}×${item.height}` : 'HD'}
                          </span>
                        </div>

                        {item.type === 'video' && !isHovered && (
                          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.5)', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                            <Play size={12} style={{ marginLeft: '2px' }} />
                          </div>
                        )}
                      </div>

                      {/* Info and Download Button */}
                      <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title}>
                          {item.title}
                        </span>

                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          disabled={isDownloading || Boolean(downloadingId)}
                          onClick={() => handleSelectMedia(item)}
                          style={{
                            width: '100%',
                            fontSize: '11px',
                            padding: '6px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            background: isDownloading ? '#06b6d4' : 'linear-gradient(135deg, #06b6d4, #6366f1)'
                          }}
                        >
                          {isDownloading ? (
                            <>
                              <Loader2 size={12} className="spinner" />
                              <span>Descargando a disco...</span>
                            </>
                          ) : (
                            <>
                              <Download size={12} />
                              <span>Descargar e Insertar</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Load More Button (Pagination) */}
              {hasMore && (
                <div style={{ textAlign: 'center', marginTop: '24px', paddingBottom: '16px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={isLoadingMore}
                    onClick={handleLoadMore}
                    style={{
                      padding: '9px 24px',
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      borderRadius: '8px',
                      border: '1px solid rgba(6, 182, 212, 0.4)',
                      background: 'rgba(6, 182, 212, 0.1)',
                      color: '#06b6d4',
                      cursor: 'pointer'
                    }}
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 size={14} className="spinner" />
                        <span>Cargando más videos (+{perPage})...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw size={13} />
                        <span>Cargar más videos (+{perPage} tomas) — Página {page + 1}</span>
                      </>
                    )}
                  </button>
                  <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-dim)' }}>
                    Mostrando {results.length} resultados cargados
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer / Disk Storage Info */}
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'rgba(0,0,0,0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          color: 'var(--text-dim)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <HardDrive size={13} style={{ color: '#06b6d4' }} />
            <span>
              Carpeta local: <strong style={{ color: 'var(--text-secondary)' }}>projects_media/{project.id || 'default'}/</strong> ({diskInfo ? `${diskInfo.totalFiles} archivos, ${diskInfo.formattedSize}` : '0 MB'})
            </span>
          </div>

          <button className="btn-secondary btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
