import React from 'react';
import {
  Sliders,
  Trash2,
  Copy,
  Eye,
  Volume2,
  VolumeX,
  Move,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Sun,
  Contrast,
  Palette,
  Film,
  Layers,
  Settings,
  Clock,
  RotateCcw,
  Sparkles,
  Check,
  Unlink,
  Music,
  Type,
  BarChart2,
  Activity,
  PieChart,
  TrendingUp,
  Quote,
  Plus,
  Minus,
  Zap,
  Play,
  ArrowUp,
  ArrowDown,
  CheckSquare
} from 'lucide-react';
import { formatTimecode } from '../utils/timeFormat';
import {
  FONT_OPTIONS,
  ANIMATION_IN_TYPES,
  ANIMATION_LOOP_TYPES,
  ANIMATION_OUT_TYPES,
  GRAPHIC_TYPES,
  GRAPHIC_COLOR_THEMES,
  POSITION_PRESETS
} from '../utils/graphicEngine';

function GraphicClipInspector({
  selectedClip,
  track,
  onUpdateClip,
  onDeleteClip,
  onDuplicateClip
}) {
  const gType = GRAPHIC_TYPES.find(t => t.id === selectedClip.graphicType) || GRAPHIC_TYPES[0];
  const theme = GRAPHIC_COLOR_THEMES.find(t => t.id === selectedClip.themeId) || GRAPHIC_COLOR_THEMES[0];

  const handleUpdate = (updates) => {
    onUpdateClip(selectedClip.id, updates);
  };

  const handleThemeChange = (themeId) => {
    const t = GRAPHIC_COLOR_THEMES.find(item => item.id === themeId);
    if (!t) return;
    handleUpdate({
      themeId,
      color: t.primary,
      textColor: t.text,
      accentColor: t.accent,
      bgColor: t.bg,
      borderColor: t.border,
      textShadowColor: t.shadow
    });
  };

  const handlePositionPreset = (presetId) => {
    const p = POSITION_PRESETS.find(item => item.id === presetId);
    if (!p) return;
    handleUpdate({
      position: {
        ...(selectedClip.position || {}),
        preset: presetId,
        x: p.x,
        y: p.y,
        scale: p.scale
      }
    });
  };

  const handleAddChartItem = () => {
    const current = selectedClip.chartItems || [];
    const colors = ['#06b6d4', '#38bdf8', '#6366f1', '#a855f7', '#ec4899', '#10b981', '#f59e0b'];
    const newItem = {
      label: `Dato ${current.length + 1}`,
      value: Math.round(Math.random() * 80 + 20),
      color: colors[current.length % colors.length]
    };
    handleUpdate({ chartItems: [...current, newItem] });
  };

  const handleUpdateChartItem = (index, field, val) => {
    const current = [...(selectedClip.chartItems || [])];
    if (current[index]) {
      current[index] = { ...current[index], [field]: val };
      handleUpdate({ chartItems: current });
    }
  };

  const handleDeleteChartItem = (index) => {
    const current = [...(selectedClip.chartItems || [])];
    current.splice(index, 1);
    handleUpdate({ chartItems: current });
  };

  const handleAddMilestone = () => {
    const current = [...(selectedClip.milestones || [])];
    current.push({ date: '2024', label: 'Nuevo Hito', active: false });
    handleUpdate({ milestones: current });
  };

  const handleUpdateMilestone = (index, field, val) => {
    const current = [...(selectedClip.milestones || [])];
    if (current[index]) {
      current[index] = { ...current[index], [field]: val };
      handleUpdate({ milestones: current });
    }
  };

  const handleDeleteMilestone = (index) => {
    const current = [...(selectedClip.milestones || [])];
    current.splice(index, 1);
    handleUpdate({ milestones: current });
  };

  const animationIn = selectedClip.animation?.inType || 'slide-up';
  const animationInDuration = selectedClip.animation?.inDuration !== undefined ? selectedClip.animation.inDuration : 0.5;
  const animationLoop = selectedClip.animation?.loopType || 'pulse';
  const animationOut = selectedClip.animation?.outType || 'fade';
  const animationOutDuration = selectedClip.animation?.outDuration !== undefined ? selectedClip.animation.outDuration : 0.5;

  const posX = selectedClip.position?.x || 0;
  const posY = selectedClip.position?.y || 0;
  const scale = selectedClip.position?.scale !== undefined ? selectedClip.position.scale : 1.0;
  const opacity = selectedClip.opacity !== undefined ? selectedClip.opacity : 1.0;

  return (
    <div className="clip-inspector graphic-inspector-view">
      {/* Header */}
      <div className="inspector-header">
        <div className="inspector-title-row">
          <div
            className="inspector-color-dot"
            style={{ backgroundColor: selectedClip.color || '#06b6d4' }}
          />
          <input
            type="text"
            className="inspector-name-input"
            value={selectedClip.name}
            onChange={(e) => handleUpdate({ name: e.target.value })}
            title="Haz clic para renombrar este gráfico"
          />
        </div>
        <span className="badge badge-cyan">{track?.name || 'G1 (Gráficos)'}</span>
      </div>

      {/* Tipo de Elemento & Estilo */}
      <div className="inspector-section">
        <div className="section-title-row">
          <Sparkles size={13} className="text-cyan" />
          <h5>Tipo de Elemento Gráfico</h5>
        </div>

        <div className="inspector-field">
          <select
            className="inspector-select"
            value={selectedClip.graphicType || 'title_hero'}
            onChange={(e) => handleUpdate({ graphicType: e.target.value })}
          >
            {GRAPHIC_TYPES.map(gt => (
              <option key={gt.id} value={gt.id}>
                {gt.name} ({gt.badge})
              </option>
            ))}
          </select>
        </div>

        {/* Theme presets */}
        <div className="inspector-field">
          <label>Paleta de Color & Ambiente</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(85px, 1fr))', gap: '6px' }}>
            {GRAPHIC_COLOR_THEMES.map(th => {
              const isThActive = selectedClip.themeId === th.id;
              return (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => handleThemeChange(th.id)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: isThActive ? `1.5px solid ${th.primary}` : '1px solid rgba(255, 255, 255, 0.08)',
                    background: isThActive ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer'
                  }}
                  title={th.name}
                >
                  <div style={{ display: 'flex', gap: '3px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: th.primary }} />
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: th.secondary }} />
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: th.accent }} />
                  </div>
                  <span style={{ fontSize: '10px', color: isThActive ? '#ffffff' : '#94a3b8' }}>
                    {th.name.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Contenido & Textos Específicos del Tipo */}
      <div className="inspector-section">
        <div className="section-title-row">
          <Type size={13} className="text-cyan" />
          <h5>
            {selectedClip.graphicType === 'doc_chapter' && 'Configuración de Capítulo'}
            {selectedClip.graphicType === 'doc_stat' && 'Cifra de Impacto / Estadística'}
            {selectedClip.graphicType === 'doc_date' && 'Fecha o Hito Histórico'}
            {selectedClip.graphicType === 'doc_timeline' && 'Eje y Título de Línea de Tiempo'}
            {!['doc_chapter', 'doc_stat', 'doc_date', 'doc_timeline'].includes(selectedClip.graphicType) && 'Contenido & Textos'}
          </h5>
        </div>

        {/* 1. Capítulo Documental */}
        {selectedClip.graphicType === 'doc_chapter' && (
          <>
            <div className="inspector-field">
              <label>Prefijo del Capítulo</label>
              <input
                type="text"
                className="input-field"
                value={selectedClip.chapterPrefix !== undefined ? selectedClip.chapterPrefix : 'Capítulo 1:'}
                onChange={(e) => handleUpdate({ chapterPrefix: e.target.value })}
                placeholder="Ej: Capítulo 1:, Parte 2:, Sección I..."
              />
            </div>
            <div className="inspector-field">
              <label>Título del Capítulo</label>
              <input
                type="text"
                className="input-field"
                value={selectedClip.title || ''}
                onChange={(e) => handleUpdate({ title: e.target.value })}
                placeholder="Ej: El auge del dinero digital"
              />
            </div>
            <div className="inspector-field">
              <label>Subtítulo o Contexto (Opcional)</label>
              <input
                type="text"
                className="input-field"
                value={selectedClip.subtitle || ''}
                onChange={(e) => handleUpdate({ subtitle: e.target.value })}
                placeholder="Contexto adicional..."
              />
            </div>
          </>
        )}

        {/* 2. Cifra de Impacto / Estadística */}
        {selectedClip.graphicType === 'doc_stat' && (
          <>
            <div className="inspector-grid-2">
              <div className="inspector-field">
                <label>Cifra o Número (Amarillo Documental)</label>
                <input
                  type="text"
                  className="input-field"
                  style={{ color: '#facc15', fontWeight: '700' }}
                  value={selectedClip.statNumber !== undefined ? selectedClip.statNumber : '800.000.000'}
                  onChange={(e) => handleUpdate({ statNumber: e.target.value })}
                  placeholder="Ej: 800.000.000, $50B, 99%..."
                />
              </div>
              <div className="inspector-field">
                <label>Sustantivo / Unidad</label>
                <input
                  type="text"
                  className="input-field"
                  value={selectedClip.statText !== undefined ? selectedClip.statText : 'de personas'}
                  onChange={(e) => handleUpdate({ statText: e.target.value })}
                  placeholder="Ej: de personas, dólares, usuarios..."
                />
              </div>
            </div>
            <div className="inspector-field">
              <label>Texto Completo Unificado (Alternativo)</label>
              <input
                type="text"
                className="input-field"
                value={selectedClip.title || ''}
                onChange={(e) => handleUpdate({ title: e.target.value })}
                placeholder="Ej: 800.000.000 de personas"
              />
            </div>
            <div className="inspector-field">
              <label>Subtítulo Explicativo (Opcional)</label>
              <input
                type="text"
                className="input-field"
                value={selectedClip.subtitle || ''}
                onChange={(e) => handleUpdate({ subtitle: e.target.value })}
                placeholder="Explicación del dato..."
              />
            </div>
          </>
        )}

        {/* 3. Fecha o Hito Histórico */}
        {selectedClip.graphicType === 'doc_date' && (
          <>
            <div className="inspector-field">
              <label>Fecha o Hito (Verde Documental)</label>
              <input
                type="text"
                className="input-field"
                style={{ color: '#22c55e', fontWeight: '700' }}
                value={selectedClip.title || ''}
                onChange={(e) => handleUpdate({ title: e.target.value })}
                placeholder="Ej: 15 Septiembre 2008"
              />
            </div>
            <div className="inspector-field">
              <label>Contexto del Suceso (Opcional)</label>
              <input
                type="text"
                className="input-field"
                value={selectedClip.subtitle || ''}
                onChange={(e) => handleUpdate({ subtitle: e.target.value })}
                placeholder="Ej: Quiebra de Lehman Brothers"
              />
            </div>
          </>
        )}

        {/* 4. Título genérico para el resto de tipos */}
        {!['doc_chapter', 'doc_stat', 'doc_date'].includes(selectedClip.graphicType) && (
          <>
            <div className="inspector-field">
              <label>Título Principal</label>
              <input
                type="text"
                className="input-field"
                value={selectedClip.title || ''}
                onChange={(e) => handleUpdate({ title: e.target.value })}
                placeholder="Título impactante..."
              />
            </div>
            <div className="inspector-field">
              <label>Subtítulo o Descripción</label>
              <input
                type="text"
                className="input-field"
                value={selectedClip.subtitle || ''}
                onChange={(e) => handleUpdate({ subtitle: e.target.value })}
                placeholder="Subtítulo o contexto..."
              />
            </div>
            <div className="inspector-field">
              <label>Etiqueta / Badge Superior (Opcional)</label>
              <input
                type="text"
                className="input-field"
                value={selectedClip.badgeText || ''}
                onChange={(e) => handleUpdate({ badgeText: e.target.value })}
                placeholder="Ej: DATO CLAVE, METAS..."
              />
            </div>
          </>
        )}

        {selectedClip.graphicType === 'quote_callout' && (
          <div className="inspector-field">
            <label>Autor / Fuente de la Cita</label>
            <input
              type="text"
              className="input-field"
              value={selectedClip.quoteAuthor || ''}
              onChange={(e) => handleUpdate({ quoteAuthor: e.target.value })}
              placeholder="Ej: Steve Jobs, Informe Anual..."
            />
          </div>
        )}
      </div>

      {/* Editor de Hitos Cronológicos para doc_timeline */}
      {selectedClip.graphicType === 'doc_timeline' && (
        <div className="inspector-section">
          <div className="section-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <TrendingUp size={13} className="text-cyan" />
              <h5>Hitos Cronológicos ({selectedClip.milestones?.length || 0})</h5>
            </div>
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={handleAddMilestone}
              style={{ color: '#38bdf8', fontSize: '11px', padding: '2px 8px' }}
            >
              <Plus size={11} /> Añadir Hito
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
            {(selectedClip.milestones && selectedClip.milestones.length > 0 ? selectedClip.milestones : [
              { date: '1975', label: 'Homebrew Club', active: false },
              { date: '1976', label: 'Apple I', active: false },
              { date: '1981', label: 'IBM PC', active: true }
            ]).map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 1fr 60px 28px',
                  gap: '6px',
                  alignItems: 'center',
                  background: 'rgba(0, 0, 0, 0.25)',
                  padding: '4px 6px',
                  borderRadius: '6px'
                }}
              >
                <input
                  type="text"
                  className="input-field"
                  style={{ padding: '3px 6px', fontSize: '11px', fontStyle: 'italic', fontWeight: '700' }}
                  value={item.date}
                  onChange={(e) => handleUpdateMilestone(idx, 'date', e.target.value)}
                  placeholder="Año / Fecha"
                />
                <input
                  type="text"
                  className="input-field"
                  style={{ padding: '3px 6px', fontSize: '11px' }}
                  value={item.label}
                  onChange={(e) => handleUpdateMilestone(idx, 'label', e.target.value)}
                  placeholder="Evento / Hito"
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: item.active ? '#38bdf8' : '#94a3b8', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!item.active}
                    onChange={(e) => handleUpdateMilestone(idx, 'active', e.target.checked)}
                  />
                  <span>Activo</span>
                </label>
                <button
                  type="button"
                  className="btn-ghost icon-only btn-micro text-rose"
                  onClick={() => handleDeleteMilestone(idx)}
                  title="Eliminar este hito"
                >
                  <Minus size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Datos Cuantitativos (si es kpi o gráficos) */}
      {(selectedClip.graphicType === 'kpi_metric' || selectedClip.graphicType === 'chart_donut') && (
        <div className="inspector-section">
          <div className="section-title-row">
            <TrendingUp size={13} className="text-emerald" />
            <h5>Métrica Cuantitativa</h5>
          </div>

          <div className="inspector-grid-2">
            <div className="inspector-field">
              <label>Valor Destacado (KPI)</label>
              <input
                type="text"
                className="input-field"
                value={selectedClip.kpiValue || ''}
                onChange={(e) => handleUpdate({ kpiValue: e.target.value })}
                placeholder="Ej: +48%, $1.5M, 99.9%"
                style={{ fontWeight: '700', color: selectedClip.accentColor || '#06b6d4' }}
              />
            </div>

            <div className="inspector-field">
              <label>Variación / Delta</label>
              <input
                type="text"
                className="input-field"
                value={selectedClip.kpiDelta || ''}
                onChange={(e) => handleUpdate({ kpiDelta: e.target.value })}
                placeholder="Ej: +12.4% vs año ant."
                style={{ color: '#34d399' }}
              />
            </div>
          </div>
        </div>
      )}

      {(selectedClip.graphicType === 'chart_bar' || selectedClip.graphicType === 'chart_line') && (
        <div className="inspector-section">
          <div className="section-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <BarChart2 size={13} className="text-cyan" />
              <h5>Datos del Gráfico ({selectedClip.chartItems?.length || 0} series)</h5>
            </div>
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={handleAddChartItem}
              style={{ color: '#38bdf8', fontSize: '11px', padding: '2px 8px' }}
            >
              <Plus size={11} /> Añadir Barra
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
            {(selectedClip.chartItems || []).map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 70px 36px 28px',
                  gap: '6px',
                  alignItems: 'center',
                  background: 'rgba(0, 0, 0, 0.25)',
                  padding: '4px 6px',
                  borderRadius: '6px'
                }}
              >
                <input
                  type="text"
                  className="input-field"
                  style={{ padding: '3px 6px', fontSize: '11px' }}
                  value={item.label}
                  onChange={(e) => handleUpdateChartItem(idx, 'label', e.target.value)}
                  placeholder="Etiqueta"
                />
                <input
                  type="number"
                  className="input-field"
                  style={{ padding: '3px 6px', fontSize: '11px', textAlign: 'right' }}
                  value={item.value}
                  onChange={(e) => handleUpdateChartItem(idx, 'value', Number(e.target.value) || 0)}
                  placeholder="Valor"
                />
                <input
                  type="color"
                  style={{ width: '32px', height: '24px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                  value={item.color || '#06b6d4'}
                  onChange={(e) => handleUpdateChartItem(idx, 'color', e.target.value)}
                  title="Color de la barra"
                />
                <button
                  type="button"
                  className="btn-ghost icon-only btn-micro text-rose"
                  onClick={() => handleDeleteChartItem(idx)}
                  title="Eliminar este dato"
                >
                  <Minus size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tipografía & Sombra */}
      <div className="inspector-section">
        <div className="section-title-row">
          <Type size={13} className="text-indigo" />
          <h5>Tipografía & Efecto de Sombra</h5>
        </div>

        <div className="inspector-field">
          <label>Fuente (Google Fonts)</label>
          <select
            className="inspector-select"
            value={selectedClip.fontFamily || 'Outfit'}
            onChange={(e) => handleUpdate({ fontFamily: e.target.value })}
          >
            {FONT_OPTIONS.map(f => (
              <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div className="inspector-grid-2">
          <div className="inspector-field">
            <div className="field-label-group">
              <label>Tamaño Fuente</label>
              <span className="field-val">{selectedClip.fontSize || 42}px</span>
            </div>
            <input
              type="range"
              min="20"
              max="90"
              step="2"
              className="range-slider"
              value={selectedClip.fontSize || 42}
              onChange={(e) => handleUpdate({ fontSize: Number(e.target.value) })}
            />
          </div>

          <div className="inspector-field">
            <div className="field-label-group">
              <label>Espaciado Letras</label>
              <span className="field-val">{selectedClip.letterSpacing || 1}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              className="range-slider"
              value={selectedClip.letterSpacing || 1}
              onChange={(e) => handleUpdate({ letterSpacing: Number(e.target.value) })}
            />
          </div>
        </div>

        {/* Sombras */}
        <div className="inspector-grid-2">
          <div className="inspector-field">
            <div className="field-label-group">
              <label>Difuminado Sombra (Blur)</label>
              <span className="field-val">{selectedClip.textShadowBlur ?? 18}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="2"
              className="range-slider"
              value={selectedClip.textShadowBlur ?? 18}
              onChange={(e) => handleUpdate({ textShadowBlur: Number(e.target.value) })}
            />
          </div>

          <div className="inspector-field">
            <div className="field-label-group">
              <label>Sombra Offset Y</label>
              <span className="field-val">{selectedClip.textShadowOffsetY ?? 4}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="25"
              step="1"
              className="range-slider"
              value={selectedClip.textShadowOffsetY ?? 4}
              onChange={(e) => handleUpdate({ textShadowOffsetY: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="inspector-grid-2">
          <div className="inspector-field">
            <label>Color Texto</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="color"
                value={selectedClip.textColor || '#ffffff'}
                onChange={(e) => handleUpdate({ textColor: e.target.value })}
                style={{ width: '32px', height: '28px', border: 'none', background: 'transparent', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>{selectedClip.textColor || '#ffffff'}</span>
            </div>
          </div>

          <div className="inspector-field">
            <label>Color Acento / Glow</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="color"
                value={selectedClip.accentColor || '#06b6d4'}
                onChange={(e) => handleUpdate({ accentColor: e.target.value, textShadowColor: `${e.target.value}aa` })}
                style={{ width: '32px', height: '28px', border: 'none', background: 'transparent', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>{selectedClip.accentColor || '#06b6d4'}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', background: 'rgba(0, 0, 0, 0.2)', padding: '10px 12px', borderRadius: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#f1f5f9', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selectedClip.backdropGlass === true}
              onChange={(e) => handleUpdate({ backdropGlass: e.target.checked })}
            />
            <span style={{ fontWeight: '600' }}>Activar Tarjeta de Fondo (Glassmorphism)</span>
          </label>
          <span style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '1.4' }}>
            {selectedClip.backdropGlass
              ? 'Tarjeta semitransparente activa con borde y desenfoque.'
              : 'Desactivada (Recomendado): El texto flota directamente sobre el metraje con sombra cinematográfica pura.'}
          </span>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer', marginTop: '4px' }}>
            <input
              type="checkbox"
              checked={selectedClip.textTransform === 'uppercase'}
              onChange={(e) => handleUpdate({ textTransform: e.target.checked ? 'uppercase' : 'none' })}
            />
            <span>Forzar Todo en Mayúsculas (Uppercase)</span>
          </label>
        </div>
      </div>

      {/* Sistema de Animaciones */}
      <div className="inspector-section">
        <div className="section-title-row">
          <Zap size={13} className="text-cyan" />
          <h5>Sistema de Animaciones (Motion FX)</h5>
        </div>

        {/* Entrada */}
        <div className="inspector-grid-2">
          <div className="inspector-field">
            <label>Animación de Entrada (In)</label>
            <select
              className="inspector-select"
              value={animationIn}
              onChange={(e) => handleUpdate({
                animation: { ...(selectedClip.animation || {}), inType: e.target.value }
              })}
            >
              {ANIMATION_IN_TYPES.map(an => (
                <option key={an.id} value={an.id}>
                  {an.name}
                </option>
              ))}
            </select>
          </div>

          <div className="inspector-field">
            <div className="field-label-group">
              <label>Duración Entrada</label>
              <span className="field-val">{animationInDuration.toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="2.0"
              step="0.1"
              className="range-slider"
              value={animationInDuration}
              onChange={(e) => handleUpdate({
                animation: { ...(selectedClip.animation || {}), inDuration: Number(e.target.value) }
              })}
            />
          </div>
        </div>

        {/* Loop & Salida */}
        <div className="inspector-grid-2">
          <div className="inspector-field">
            <label>Animación Continua (Loop)</label>
            <select
              className="inspector-select"
              value={animationLoop}
              onChange={(e) => handleUpdate({
                animation: { ...(selectedClip.animation || {}), loopType: e.target.value }
              })}
            >
              {ANIMATION_LOOP_TYPES.map(al => (
                <option key={al.id} value={al.id}>
                  {al.name}
                </option>
              ))}
            </select>
          </div>

          <div className="inspector-field">
            <label>Animación de Salida (Out)</label>
            <select
              className="inspector-select"
              value={animationOut}
              onChange={(e) => handleUpdate({
                animation: { ...(selectedClip.animation || {}), outType: e.target.value }
              })}
            >
              {ANIMATION_OUT_TYPES.map(ao => (
                <option key={ao.id} value={ao.id}>
                  {ao.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Posición & Escala */}
      <div className="inspector-section">
        <div className="section-title-row">
          <Move size={13} className="text-indigo" />
          <h5>Posición & Escala en Pantalla</h5>
        </div>

        {/* Position presets */}
        <div className="inspector-field">
          <label>Presets de Posición en Pantalla</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            {POSITION_PRESETS.map(pr => {
              const isPrActive = selectedClip.position?.preset === pr.id;
              return (
                <button
                  key={pr.id}
                  type="button"
                  onClick={() => handlePositionPreset(pr.id)}
                  className={`btn-ghost btn-xs ${isPrActive ? 'active' : ''}`}
                  style={{
                    fontSize: '10px',
                    padding: '4px 6px',
                    borderColor: isPrActive ? '#06b6d4' : undefined,
                    color: isPrActive ? '#38bdf8' : undefined
                  }}
                >
                  {pr.name.split(' ')[0]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="inspector-grid-2">
          <div className="inspector-field">
            <div className="field-label-group">
              <label>Posición X</label>
              <span className="field-val">{posX}px</span>
            </div>
            <input
              type="range"
              min="-400"
              max="400"
              step="5"
              className="range-slider"
              value={posX}
              onChange={(e) => handleUpdate({
                position: { ...(selectedClip.position || {}), x: Number(e.target.value) }
              })}
            />
          </div>

          <div className="inspector-field">
            <div className="field-label-group">
              <label>Posición Y</label>
              <span className="field-val">{posY}px</span>
            </div>
            <input
              type="range"
              min="-350"
              max="350"
              step="5"
              className="range-slider"
              value={posY}
              onChange={(e) => handleUpdate({
                position: { ...(selectedClip.position || {}), y: Number(e.target.value) }
              })}
            />
          </div>
        </div>

        <div className="inspector-grid-2">
          <div className="inspector-field">
            <div className="field-label-group">
              <label>Escala</label>
              <span className="field-val">{scale.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              className="range-slider"
              value={scale}
              onChange={(e) => handleUpdate({
                position: { ...(selectedClip.position || {}), scale: Number(e.target.value) }
              })}
            />
          </div>

          <div className="inspector-field">
            <div className="field-label-group">
              <label>Opacidad</label>
              <span className="field-val">{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              className="range-slider"
              value={opacity}
              onChange={(e) => handleUpdate({ opacity: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>

      {/* Tiempo & Duración */}
      <div className="inspector-section">
        <div className="section-title-row">
          <Clock size={13} className="text-cyan" />
          <h5>Tiempo & Duración</h5>
        </div>

        <div className="inspector-grid-2">
          <div className="inspector-field">
            <label>Inicio (Línea de Tiempo)</label>
            <div className="inspector-input-with-badge">
              <input
                type="number"
                step="0.05"
                min="0"
                className="input-field"
                value={selectedClip.startTime}
                onChange={(e) => handleUpdate({ startTime: Math.max(0, Number(e.target.value)) })}
              />
              <span className="input-unit timecode">{formatTimecode(selectedClip.startTime)}</span>
            </div>
          </div>

          <div className="inspector-field">
            <label>Duración</label>
            <div className="inspector-input-with-badge">
              <input
                type="number"
                step="0.05"
                min="0.5"
                className="input-field"
                value={selectedClip.duration}
                onChange={(e) => handleUpdate({ duration: Math.max(0.5, Number(e.target.value)) })}
              />
              <span className="input-unit">{selectedClip.duration.toFixed(1)}s</span>
            </div>
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="inspector-actions">
        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={() => onDuplicateClip(selectedClip.id)}
            title="Duplicar este gráfico"
          >
            <Copy size={14} />
            Duplicar
          </button>
          <button
            type="button"
            className="btn-danger flex-1"
            onClick={() => onDeleteClip(selectedClip.id)}
            title="Eliminar este gráfico del montaje"
          >
            <Trash2 size={14} />
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

function MultiClipInspectorView({
  selectedClipIds,
  project,
  onDeleteClip,
  onDuplicateClip,
  onUpdateProject
}) {
  const selectedClips = React.useMemo(() => {
    const idSet = new Set(selectedClipIds);
    const list = [];
    (project?.tracks || []).forEach(t => {
      (t.clips || []).forEach(c => {
        if (idSet.has(c.id)) {
          list.push({ ...c, trackType: t.type, trackName: t.name });
        }
      });
    });
    return list;
  }, [selectedClipIds, project]);

  const totalDuration = selectedClips.reduce((sum, c) => sum + (c.duration || 0), 0);
  const videoCount = selectedClips.filter(c => c.trackType === 'video').length;
  const audioCount = selectedClips.filter(c => c.trackType === 'audio').length;
  const graphicCount = selectedClips.filter(c => c.isGraphic || c.trackType === 'graphics').length;
  const guideCount = selectedClips.filter(c => c.trackType === 'guide' || c.trackType === 'scene').length;

  const handleBatchColor = (color) => {
    const idSet = new Set(selectedClipIds);
    const updatedTracks = project.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => idSet.has(c.id) ? { ...c, color } : c)
    }));
    if (onUpdateProject) onUpdateProject({ ...project, tracks: updatedTracks });
  };

  const handleBatchVolume = (val) => {
    const idSet = new Set(selectedClipIds);
    const updatedTracks = project.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => idSet.has(c.id) ? { ...c, volume: val, muted: val === 0 } : c)
    }));
    if (onUpdateProject) onUpdateProject({ ...project, tracks: updatedTracks });
  };

  const handleBatchMuteToggle = () => {
    const idSet = new Set(selectedClipIds);
    let anyAudible = false;
    project.tracks.forEach(t => {
      t.clips.forEach(c => {
        if (idSet.has(c.id) && (c.muted === false || c.muted === undefined)) anyAudible = true;
      });
    });
    const targetMute = anyAudible;
    const updatedTracks = project.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => idSet.has(c.id) ? { ...c, muted: targetMute } : c)
    }));
    if (onUpdateProject) onUpdateProject({ ...project, tracks: updatedTracks });
  };

  const handleBatchOpacity = (val) => {
    const idSet = new Set(selectedClipIds);
    const updatedTracks = project.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => idSet.has(c.id) ? { ...c, opacity: val } : c)
    }));
    if (onUpdateProject) onUpdateProject({ ...project, tracks: updatedTracks });
  };

  const colorPresets = [
    { name: 'Cian', hex: '#06b6d4' },
    { name: 'Índigo', hex: '#6366f1' },
    { name: 'Esmeralda', hex: '#10b981' },
    { name: 'Rosa', hex: '#f43f5e' },
    { name: 'Ámbar', hex: '#f59e0b' },
    { name: 'Púrpura', hex: '#a855f7' }
  ];

  return (
    <div className="clip-inspector multi-clip-inspector">
      <div className="inspector-header">
        <div className="inspector-title-row">
          <div className="inspector-badge-icon" style={{ background: 'rgba(6, 182, 212, 0.2)' }}>
            <CheckSquare size={18} style={{ color: '#38bdf8' }} />
          </div>
          <div>
            <span className="inspector-clip-name">Selección Múltiple</span>
            <span className="inspector-subtext">{selectedClipIds.length} clips seleccionados</span>
          </div>
        </div>
        <span className="badge badge-cyan">{selectedClipIds.length} items</span>
      </div>

      {/* Stats Summary */}
      <div className="inspector-section">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '600' }}>Duración Total</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#ffffff', fontFamily: 'monospace', marginTop: '2px' }}>
              {formatTimecode(totalDuration)}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '600' }}>Promedio / Clip</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#38bdf8', fontFamily: 'monospace', marginTop: '2px' }}>
              {(totalDuration / (selectedClipIds.length || 1)).toFixed(1)}s
            </div>
          </div>
        </div>

        {/* Breakdown chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {videoCount > 0 && (
            <span className="badge badge-indigo" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Film size={11} /> {videoCount} Video
            </span>
          )}
          {audioCount > 0 && (
            <span className="badge badge-cyan" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Music size={11} /> {audioCount} Audio
            </span>
          )}
          {graphicCount > 0 && (
            <span className="badge badge-amber" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sparkles size={11} /> {graphicCount} Gráficos
            </span>
          )}
          {guideCount > 0 && (
            <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.4)' }}>
              {guideCount} Guía / Escenas
            </span>
          )}
        </div>
      </div>

      {/* Batch Label Color */}
      <div className="inspector-section">
        <label style={{ fontSize: '11px', fontWeight: '600', color: '#cbd5e1', marginBottom: '8px', display: 'block' }}>
          Color de Etiqueta en Lote
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {colorPresets.map(preset => (
            <button
              key={preset.hex}
              type="button"
              onClick={() => handleBatchColor(preset.hex)}
              title={`Asignar color ${preset.name} a los ${selectedClipIds.length} clips`}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: preset.hex,
                border: '2px solid rgba(255,255,255,0.2)',
                cursor: 'pointer',
                transition: 'transform 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            />
          ))}
        </div>
      </div>

      {/* Batch Audio & Volume */}
      {(videoCount > 0 || audioCount > 0) && (
        <div className="inspector-section">
          <label style={{ fontSize: '11px', fontWeight: '600', color: '#cbd5e1', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Audio en Lote</span>
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={handleBatchMuteToggle}
              style={{ padding: '2px 8px', fontSize: '11px' }}
            >
              <VolumeX size={12} className="text-rose" />
              Alternar Silencio
            </button>
          </label>
          <div className="inspector-field">
            <div className="field-label-group">
              <label>Volumen Global</label>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              defaultValue="1"
              onChange={(e) => handleBatchVolume(parseFloat(e.target.value))}
              className="slider-range"
            />
          </div>
        </div>
      )}

      {/* Batch Opacity (for video & graphics) */}
      {(videoCount > 0 || graphicCount > 0) && (
        <div className="inspector-section">
          <div className="inspector-field">
            <div className="field-label-group">
              <label>Opacidad en Lote</label>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              defaultValue="1"
              onChange={(e) => handleBatchOpacity(parseFloat(e.target.value))}
              className="slider-range"
            />
          </div>
        </div>
      )}

      {/* Batch Actions */}
      <div className="inspector-section" style={{ borderBottom: 'none' }}>
        <label style={{ fontSize: '11px', fontWeight: '600', color: '#cbd5e1', marginBottom: '8px', display: 'block' }}>
          Acciones en Lote
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onDuplicateClip && onDuplicateClip()}
            style={{ width: '100%', justifyContent: 'center', gap: '6px' }}
          >
            <Copy size={14} />
            <span>Duplicar Selección ({selectedClipIds.length})</span>
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => onDeleteClip && onDeleteClip()}
            style={{ width: '100%', justifyContent: 'center', gap: '6px' }}
          >
            <Trash2 size={14} />
            <span>Eliminar Selección ({selectedClipIds.length})</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export const ClipInspector = React.memo(function ClipInspector({
  selectedClip,
  selectedClipIds = [],
  project,
  onUpdateClip,
  onDeleteClip,
  onDuplicateClip,
  onSeparateAudio,
  onUnlinkClip,
  onOpenProjectSettings,
  onUpdateProject
}) {
  // If MULTIPLE clips are selected, show dedicated Multi-Clip Batch Inspector
  if (selectedClipIds && selectedClipIds.length > 1) {
    return (
      <MultiClipInspectorView
        selectedClipIds={selectedClipIds}
        project={project}
        onDeleteClip={onDeleteClip}
        onDuplicateClip={onDuplicateClip}
        onUpdateProject={onUpdateProject}
      />
    );
  }

  // If NO clip is selected, show Project Global Properties instead of an empty screen
  if (!selectedClip) {
    const totalClips = (project?.tracks || []).reduce((acc, t) => acc + (t.clips?.length || 0), 0);
    const videoTracksCount = (project?.tracks || []).filter(t => t.type === 'video').length;
    const audioTracksCount = (project?.tracks || []).filter(t => t.type === 'audio').length;
    const scenesCount = project?.scenes?.list?.length || 0;
    const duration = project?.settings?.duration || 20;
    const aspectRatio = project?.settings?.aspectRatio || '16:9';

    return (
      <div className="clip-inspector project-properties-view">
        <div className="inspector-header">
          <div className="inspector-title-row">
            <div className="inspector-badge-icon bg-indigo">
              <Settings size={18} className="text-indigo" />
            </div>
            <div>
              <span className="inspector-clip-name">Propiedades del Proyecto</span>
              <span className="inspector-subtext">Ajustes globales del montaje actual</span>
            </div>
          </div>
          <span className="badge badge-indigo">{aspectRatio}</span>
        </div>

        {/* Project Name */}
        <div className="inspector-section">
          <div className="inspector-field">
            <label>Nombre del Proyecto</label>
            <input
              type="text"
              className="input-field"
              value={project?.name || ''}
              onChange={(e) => onUpdateProject && onUpdateProject({ ...project, name: e.target.value })}
              placeholder="Nombre del proyecto..."
            />
          </div>

          <div className="inspector-field">
            <div className="field-label-group">
              <label>Duración del Lienzo</label>
              <span className="field-val timecode">{formatTimecode(duration)}</span>
            </div>
            <div className="inspector-input-with-badge">
              <input
                type="number"
                step="1"
                min="5"
                max="7200"
                className="input-field"
                value={duration}
                onChange={(e) => {
                  const val = Math.max(5, Number(e.target.value) || 20);
                  if (onUpdateProject) {
                    onUpdateProject({
                      ...project,
                      settings: { ...(project.settings || {}), duration: val }
                    });
                  }
                }}
              />
              <span className="input-unit">{duration}s</span>
            </div>
          </div>
        </div>

        {/* Aspect Ratio Selector */}
        <div className="inspector-section">
          <h5>Formato de Pantalla (Aspect Ratio)</h5>
          <div className="aspect-ratio-selector-grid">
            {[
              { ratio: '16:9', label: '16:9', sub: 'YouTube / Horizontal' },
              { ratio: '9:16', label: '9:16', sub: 'Reels / Shorts / TikTok' },
              { ratio: '1:1', label: '1:1', sub: 'Cuadrado / Instagram' },
              { ratio: '4:5', label: '4:5', sub: 'Retrato' },
              { ratio: '21:9', label: '21:9', sub: 'Cinemático' }
            ].map((item) => (
              <button
                key={item.ratio}
                className={`ratio-btn ${aspectRatio === item.ratio ? 'active' : ''}`}
                onClick={() => {
                  if (onUpdateProject) {
                    onUpdateProject({
                      ...project,
                      settings: { ...(project.settings || {}), aspectRatio: item.ratio }
                    });
                  }
                }}
              >
                <span className="ratio-title">{item.label}</span>
                <span className="ratio-sub">{item.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Project Statistics */}
        <div className="inspector-section">
          <h5>Resumen del Montaje</h5>
          <div className="project-stats-grid">
            <div className="stat-card">
              <span className="stat-num">{totalClips}</span>
              <span className="stat-label">Clips Totales</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{videoTracksCount}</span>
              <span className="stat-label">Pistas Video</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{audioTracksCount}</span>
              <span className="stat-label">Pistas Audio</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{scenesCount}</span>
              <span className="stat-label">Escenas IA</span>
            </div>
          </div>
        </div>

        {onOpenProjectSettings && (
          <button
            className="btn-secondary w-full"
            onClick={onOpenProjectSettings}
            style={{ marginTop: '8px' }}
          >
            <Settings size={15} />
            <span>Configuración Avanzada de Resolución</span>
          </button>
        )}
      </div>
    );
  }

  // --- Clip Selected View ---
  const track = project?.tracks?.find(t => t.id === selectedClip.trackId);
  const isAudioTrack = track?.type === 'audio';
  const isGuideTrack = track?.type === 'guide';
  const isSceneTrack = track?.type === 'scene';
  const isMediaClip = !isGuideTrack && !isSceneTrack;
  const asset = project?.assets?.find(a => a.id === selectedClip.assetId);

  // --- Graphic Clip Selected View ---
  if (selectedClip.isGraphic) {
    return (
      <GraphicClipInspector
        selectedClip={selectedClip}
        track={track}
        onUpdateClip={onUpdateClip}
        onDeleteClip={onDeleteClip}
        onDuplicateClip={onDuplicateClip}
      />
    );
  }

  // Transform helpers
  const scale = selectedClip.scale ?? 1.0;
  const posX = selectedClip.positionX ?? 0;
  const posY = selectedClip.positionY ?? 0;
  const rotation = selectedClip.rotation ?? 0;
  const flipX = selectedClip.flipX ?? false;
  const flipY = selectedClip.flipY ?? false;
  const opacity = selectedClip.opacity ?? 1.0;
  const blendMode = selectedClip.blendMode || 'normal';
  const brightness = selectedClip.brightness ?? 1.0;
  const contrast = selectedClip.contrast ?? 1.0;
  const saturate = selectedClip.saturate ?? 1.0;
  const blur = selectedClip.blur ?? 0;
  const borderRadius = selectedClip.borderRadius ?? 0;
  const volume = selectedClip.volume ?? 1.0;
  const isMuted = selectedClip.muted ?? false;
  const fadeIn = selectedClip.fadeIn ?? 0;
  const fadeOut = selectedClip.fadeOut ?? 0;

  return (
    <div className="clip-inspector">
      {/* Header with Title and Track Badge */}
      <div className="inspector-header">
        <div className="inspector-title-row">
          <div
            className="inspector-color-dot"
            style={{ backgroundColor: selectedClip.color || '#6366f1' }}
          />
          <input
            type="text"
            className="inspector-name-input"
            value={selectedClip.name}
            onChange={(e) => onUpdateClip(selectedClip.id, { name: e.target.value })}
            title="Haz clic para renombrar este clip"
          />
        </div>
        <span className="badge badge-indigo">{track?.name || 'Pista'}</span>
      </div>

      {/* Timing & Position Section */}
      <div className="inspector-section">
        <div className="section-title-row">
          <Clock size={13} className="text-indigo" />
          <h5>Tiempo & Duración</h5>
        </div>

        <div className="inspector-grid-2">
          <div className="inspector-field">
            <label>Inicio (Línea de Tiempo)</label>
            <div className="inspector-input-with-badge">
              <input
                type="number"
                step="0.05"
                min="0"
                className="input-field"
                value={selectedClip.startTime}
                onChange={(e) => onUpdateClip(selectedClip.id, { startTime: Math.max(0, Number(e.target.value)) })}
              />
              <span className="input-unit timecode">{formatTimecode(selectedClip.startTime)}</span>
            </div>
          </div>

          <div className="inspector-field">
            <label>Duración</label>
            <div className="inspector-input-with-badge">
              <input
                type="number"
                step="0.05"
                min="0.1"
                className="input-field"
                value={selectedClip.duration}
                onChange={(e) => {
                  let val = Math.max(0.1, Number(e.target.value));
                  if (asset?.duration && asset.duration > 0) {
                    const maxDur = Math.max(0.1, asset.duration - (selectedClip.sourceStart || 0));
                    val = Math.min(val, Number(maxDur.toFixed(2)));
                  }
                  onUpdateClip(selectedClip.id, { duration: val });
                }}
              />
              <span className="input-unit">{selectedClip.duration.toFixed(1)}s</span>
            </div>
          </div>
        </div>

        {selectedClip.sourceStart !== undefined && (
          <div className="inspector-field">
            <label>Desfase de Inicio en el Archivo Original (In-Point)</label>
            <div className="inspector-input-with-badge">
              <input
                type="number"
                step="0.1"
                min="0"
                className="input-field"
                value={selectedClip.sourceStart || 0}
                onChange={(e) => {
                  let val = Math.max(0, Number(e.target.value));
                  if (asset?.duration && asset.duration > 0) {
                    const maxSrc = Math.max(0, asset.duration - selectedClip.duration);
                    val = Math.min(val, Number(maxSrc.toFixed(2)));
                  }
                  onUpdateClip(selectedClip.id, { sourceStart: val });
                }}
              />
              <span className="input-unit timecode">{formatTimecode(selectedClip.sourceStart || 0)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Visual Transform & Geometry (For Video and Image clips) */}
      {!isAudioTrack && isMediaClip && (
        <div className="inspector-section">
          <div className="section-title-row">
            <Move size={13} className="text-cyan" />
            <h5>Transformación & Geometría</h5>
          </div>

          {/* Fit Mode */}
          <div className="inspector-field">
            <label>Ajuste de Lienzo</label>
            <div className="fit-mode-buttons">
              <button
                type="button"
                className={`fit-btn ${(!selectedClip.fit || selectedClip.fit === 'cover') ? 'active' : ''}`}
                onClick={() => onUpdateClip(selectedClip.id, { fit: 'cover' })}
              >
                Rellenar (Cover)
              </button>
              <button
                type="button"
                className={`fit-btn ${selectedClip.fit === 'contain' ? 'active' : ''}`}
                onClick={() => onUpdateClip(selectedClip.id, { fit: 'contain' })}
              >
                Completo (Contain)
              </button>
              <button
                type="button"
                className={`fit-btn ${selectedClip.fit === 'fill' ? 'active' : ''}`}
                onClick={() => onUpdateClip(selectedClip.id, { fit: 'fill' })}
              >
                Estirar (Fill)
              </button>
            </div>
          </div>

          {/* Scale / Zoom */}
          <div className="inspector-field">
            <div className="field-label-group">
              <label>Escala / Zoom</label>
              <span className="field-val">{Math.round(scale * 100)}% ({scale.toFixed(2)}x)</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="3"
              step="0.05"
              className="range-slider"
              value={scale}
              onChange={(e) => onUpdateClip(selectedClip.id, { scale: Number(e.target.value) })}
            />
            <div className="inspector-presets-row">
              {[0.5, 1.0, 1.25, 1.5, 2.0].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`inspector-preset-btn ${scale === s ? 'active' : ''}`}
                  onClick={() => onUpdateClip(selectedClip.id, { scale: s })}
                >
                  {Math.round(s * 100)}%
                </button>
              ))}
              <button
                type="button"
                className="inspector-preset-btn"
                title="Restablecer escala a 1.0x"
                onClick={() => onUpdateClip(selectedClip.id, { scale: 1.0 })}
              >
                <RotateCcw size={11} />
              </button>
            </div>
          </div>

          {/* Position X and Y */}
          <div className="inspector-grid-2">
            <div className="inspector-field">
              <div className="field-label-group">
                <label>Posición X</label>
                <span className="field-val">{posX}px</span>
              </div>
              <input
                type="range"
                min="-400"
                max="400"
                step="2"
                className="range-slider"
                value={posX}
                onChange={(e) => onUpdateClip(selectedClip.id, { positionX: Number(e.target.value) })}
              />
            </div>

            <div className="inspector-field">
              <div className="field-label-group">
                <label>Posición Y</label>
                <span className="field-val">{posY}px</span>
              </div>
              <input
                type="range"
                min="-400"
                max="400"
                step="2"
                className="range-slider"
                value={posY}
                onChange={(e) => onUpdateClip(selectedClip.id, { positionY: Number(e.target.value) })}
              />
            </div>
          </div>

          {(posX !== 0 || posY !== 0) && (
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={() => onUpdateClip(selectedClip.id, { positionX: 0, positionY: 0 })}
              style={{ alignSelf: 'flex-start', color: '#818cf8', padding: '2px 8px' }}
            >
              Centrar al origen (0, 0)
            </button>
          )}

          {/* Rotation & Flip */}
          <div className="inspector-field">
            <div className="field-label-group">
              <label>Rotación</label>
              <span className="field-val">{rotation}°</span>
            </div>
            <input
              type="range"
              min="-180"
              max="180"
              step="1"
              className="range-slider"
              value={rotation}
              onChange={(e) => onUpdateClip(selectedClip.id, { rotation: Number(e.target.value) })}
            />
            <div className="inspector-presets-row">
              {[0, 90, 180, -90].map((deg) => (
                <button
                  key={deg}
                  type="button"
                  className={`inspector-preset-btn ${rotation === deg ? 'active' : ''}`}
                  onClick={() => onUpdateClip(selectedClip.id, { rotation: deg })}
                >
                  {deg}°
                </button>
              ))}

              <button
                type="button"
                className={`inspector-preset-btn ${flipX ? 'active text-primary' : ''}`}
                title="Voltear Horizontalmente"
                onClick={() => onUpdateClip(selectedClip.id, { flipX: !flipX })}
              >
                <FlipHorizontal size={13} />
                <span>Voltear X</span>
              </button>

              <button
                type="button"
                className={`inspector-preset-btn ${flipY ? 'active text-primary' : ''}`}
                title="Voltear Verticalmente"
                onClick={() => onUpdateClip(selectedClip.id, { flipY: !flipY })}
              >
                <FlipVertical size={13} />
                <span>Voltear Y</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Color, Filters & Blending */}
      {!isAudioTrack && isMediaClip && (
        <div className="inspector-section">
          <div className="section-title-row">
            <Palette size={13} className="text-purple" />
            <h5>Filtros, Opacidad & Fusión</h5>
          </div>

          {/* Opacity */}
          <div className="inspector-field">
            <div className="field-label-group">
              <label>Opacidad</label>
              <span className="field-val">{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              className="range-slider"
              value={opacity}
              onChange={(e) => onUpdateClip(selectedClip.id, { opacity: Number(e.target.value) })}
            />
          </div>

          {/* Blend Mode */}
          <div className="inspector-field">
            <label>Modo de Fusión (Blend Mode)</label>
            <select
              className="inspector-select"
              value={blendMode}
              onChange={(e) => onUpdateClip(selectedClip.id, { blendMode: e.target.value })}
            >
              <option value="normal">Normal</option>
              <option value="multiply">Multiplicar (Multiply)</option>
              <option value="screen">Pantalla (Screen)</option>
              <option value="overlay">Superponer (Overlay)</option>
              <option value="soft-light">Luz Suave (Soft Light)</option>
              <option value="hard-light">Luz Fuerte (Hard Light)</option>
              <option value="difference">Diferencia (Difference)</option>
            </select>
          </div>

          {/* Brightness, Contrast, Saturation */}
          <div className="inspector-grid-3">
            <div className="inspector-field">
              <div className="field-label-group">
                <label>Brillo</label>
                <span className="field-val">{Math.round(brightness * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="2"
                step="0.05"
                className="range-slider"
                value={brightness}
                onChange={(e) => onUpdateClip(selectedClip.id, { brightness: Number(e.target.value) })}
              />
            </div>

            <div className="inspector-field">
              <div className="field-label-group">
                <label>Contraste</label>
                <span className="field-val">{Math.round(contrast * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="2"
                step="0.05"
                className="range-slider"
                value={contrast}
                onChange={(e) => onUpdateClip(selectedClip.id, { contrast: Number(e.target.value) })}
              />
            </div>

            <div className="inspector-field">
              <div className="field-label-group">
                <label>Saturación</label>
                <span className="field-val">{Math.round(saturate * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                className="range-slider"
                value={saturate}
                onChange={(e) => onUpdateClip(selectedClip.id, { saturate: Number(e.target.value) })}
              />
            </div>
          </div>

          {/* Blur & Border Radius */}
          <div className="inspector-grid-2">
            <div className="inspector-field">
              <div className="field-label-group">
                <label>Desenfoque (Blur)</label>
                <span className="field-val">{blur}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                step="0.5"
                className="range-slider"
                value={blur}
                onChange={(e) => onUpdateClip(selectedClip.id, { blur: Number(e.target.value) })}
              />
            </div>

            <div className="inspector-field">
              <div className="field-label-group">
                <label>Bordes Redondeados</label>
                <span className="field-val">{borderRadius}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                step="1"
                className="range-slider"
                value={borderRadius}
                onChange={(e) => onUpdateClip(selectedClip.id, { borderRadius: Number(e.target.value) })}
              />
            </div>
          </div>

          {(brightness !== 1 || contrast !== 1 || saturate !== 1 || blur !== 0 || borderRadius !== 0 || blendMode !== 'normal') && (
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={() => onUpdateClip(selectedClip.id, {
                brightness: 1,
                contrast: 1,
                saturate: 1,
                blur: 0,
                borderRadius: 0,
                blendMode: 'normal'
              })}
              style={{ alignSelf: 'flex-start', color: '#818cf8', padding: '2px 8px' }}
            >
              Restablecer Filtros
            </button>
          )}
        </div>
      )}

      {/* Audio Properties (For Audio track or Video clips) */}
      {(isAudioTrack || track?.type === 'video') && (
        <div className="inspector-section">
          <div className="section-title-row">
            <Volume2 size={13} className="text-emerald" />
            <h5>Propiedades de Audio</h5>
          </div>

          {/* Audio separation status & quick action */}
          {track?.type === 'video' && selectedClip.audioSeparated && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '6px',
              padding: '8px 10px',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11px',
              color: '#34d399'
            }}>
              <Check size={14} style={{ flexShrink: 0 }} />
              <span>Audio separado en pista independiente. Puedes editar, mover o eliminar el video o el audio sin afectarse.</span>
            </div>
          )}

          {track?.type === 'video' && !selectedClip.audioSeparated && onSeparateAudio && (
            <button
              type="button"
              className="btn-secondary w-full"
              style={{
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                background: 'rgba(16, 185, 129, 0.12)',
                borderColor: 'rgba(16, 185, 129, 0.4)',
                color: '#10b981',
                fontSize: '12px',
                fontWeight: '500',
                padding: '8px 12px'
              }}
              onClick={() => onSeparateAudio(selectedClip.id)}
              title="Separar el audio de este video a una pista de audio independiente (A1, A2...)"
            >
              <Music size={14} />
              <span>Separar Audio a Pista Independiente</span>
            </button>
          )}

          {selectedClip.linkedClipId && onUnlinkClip && (
            <button
              type="button"
              className="btn-secondary w-full"
              style={{
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                background: 'rgba(245, 158, 11, 0.12)',
                borderColor: 'rgba(245, 158, 11, 0.4)',
                color: '#f59e0b',
                fontSize: '12px',
                fontWeight: '500',
                padding: '8px 12px'
              }}
              onClick={() => onUnlinkClip(selectedClip.id)}
              title="Desvincular video y audio para moverlos o cortarlos de forma independiente"
            >
              <Unlink size={14} />
              <span>Desvincular Video y Audio</span>
            </button>
          )}

          <div className="inspector-field">
            <div className="field-label-group">
              <label>Volumen</label>
              <span className="field-val">{Math.round(volume * 100)}%</span>
            </div>
            <div className="volume-slider-row">
              <button
                type="button"
                className={`btn-ghost icon-only btn-xs ${isMuted ? 'text-rose' : 'text-dim'}`}
                title={isMuted ? 'Activar sonido' : 'Silenciar clip'}
                onClick={() => onUpdateClip(selectedClip.id, { muted: !isMuted })}
              >
                {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                className="range-slider flex-1"
                disabled={isMuted}
                value={isMuted ? 0 : volume}
                onChange={(e) => onUpdateClip(selectedClip.id, { volume: Number(e.target.value), muted: false })}
              />
            </div>
          </div>

          <div className="inspector-grid-2">
            <div className="inspector-field">
              <div className="field-label-group">
                <label>Fundido Entrada (Fade In)</label>
                <span className="field-val">{fadeIn.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min="0"
                max="4"
                step="0.2"
                className="range-slider"
                value={fadeIn}
                onChange={(e) => onUpdateClip(selectedClip.id, { fadeIn: Number(e.target.value) })}
              />
            </div>

            <div className="inspector-field">
              <div className="field-label-group">
                <label>Fundido Salida (Fade Out)</label>
                <span className="field-val">{fadeOut.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min="0"
                max="4"
                step="0.2"
                className="range-slider"
                value={fadeOut}
                onChange={(e) => onUpdateClip(selectedClip.id, { fadeOut: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="inspector-actions">
        {track?.type === 'video' && !selectedClip.audioSeparated && onSeparateAudio && (
          <button
            type="button"
            className="btn-secondary w-full"
            style={{
              marginBottom: '8px',
              color: '#10b981',
              borderColor: 'rgba(16, 185, 129, 0.4)',
              background: 'rgba(16, 185, 129, 0.08)'
            }}
            onClick={() => onSeparateAudio(selectedClip.id)}
            title="Separar el audio de este video a una pista de audio independiente"
          >
            <Music size={14} />
            Separar Audio a Pista A1
          </button>
        )}
        {selectedClip.linkedClipId && onUnlinkClip && (
          <button
            type="button"
            className="btn-secondary w-full"
            style={{
              marginBottom: '8px',
              color: '#f59e0b',
              borderColor: 'rgba(245, 158, 11, 0.4)',
              background: 'rgba(245, 158, 11, 0.08)'
            }}
            onClick={() => onUnlinkClip(selectedClip.id)}
            title="Desvincular para mover o editar el video y el audio de forma independiente"
          >
            <Unlink size={14} />
            Desvincular Clip
          </button>
        )}
        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={() => onDuplicateClip(selectedClip.id)}
            title="Crear una copia de este clip"
          >
            <Copy size={14} />
            Duplicar
          </button>
          <button
            type="button"
            className="btn-danger flex-1"
            onClick={() => onDeleteClip(selectedClip.id)}
            title="Eliminar este clip del montaje"
          >
            <Trash2 size={14} />
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
});
