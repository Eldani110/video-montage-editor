import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Volume2,
  VolumeX,
  Sliders,
  Mic,
  Music,
  Plus,
  Trash2,
  RotateCcw,
  Sparkles,
  Layers,
  Activity
} from 'lucide-react';
import { audioMixer, AUDIO_EQ_PRESETS } from '../utils/audioMixerEngine';

export const AudioMixerPanel = React.memo(function AudioMixerPanel({
  project,
  isPlaying,
  onUpdateProject,
  onAddTrack
}) {
  const [masterVolume, setMasterVolume] = useState(1.0);
  const [masterMuted, setMasterMuted] = useState(false);
  const [meters, setMeters] = useState({});
  const [masterMeter, setMasterMeter] = useState({ rms: 0, peak: 0, db: -60 });
  const animFrameRef = useRef(null);

  // Sync Master Volume from audioMixer engine
  useEffect(() => {
    if (audioMixer) {
      setMasterVolume(audioMixer.masterVolume ?? 1.0);
      setMasterMuted(Boolean(audioMixer.masterMuted));
    }
  }, []);

  const handleMasterVolumeChange = (newVal) => {
    const vol = parseFloat(newVal);
    setMasterVolume(vol);
    audioMixer.setMasterVolume(vol, masterMuted);
  };

  const handleMasterMuteToggle = () => {
    const nextMuted = !masterMuted;
    setMasterMuted(nextMuted);
    audioMixer.setMasterVolume(masterVolume, nextMuted);
  };

  const handleMasterReset = () => {
    setMasterVolume(1.0);
    setMasterMuted(false);
    audioMixer.setMasterVolume(1.0, false);
  };

  // Real-time VU meters polling loop during playback
  useEffect(() => {
    let active = true;

    const updateMeters = () => {
      if (!active) return;

      if (isPlaying && audioMixer) {
        const nextMeters = {};
        const tracks = project?.tracks || [];
        for (const track of tracks) {
          nextMeters[track.id] = audioMixer.getTrackMeter(track.id);
        }
        setMeters(nextMeters);
        setMasterMeter(audioMixer.getMasterMeter());
        animFrameRef.current = requestAnimationFrame(updateMeters);
      } else {
        // Reset meters when stopped
        setMeters({});
        setMasterMeter({ rms: 0, peak: 0, db: -60 });
      }
    };

    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updateMeters);
    } else {
      setMeters({});
      setMasterMeter({ rms: 0, peak: 0, db: -60 });
    }

    return () => {
      active = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, project?.tracks]);

  // Audio tracks list
  const tracks = project?.tracks || [];
  const audioTracks = tracks.filter(
    (t) => t.type === 'audio' || t.type === 'video' || (t.clips || []).some((c) => c.type === 'audio' || c.hasAudio)
  );

  const anySoloActive = audioTracks.some((t) => Boolean(t.solo));

  const updateTrackProp = useCallback(
    (trackId, key, value) => {
      if (!onUpdateProject) return;
      const updatedTracks = tracks.map((t) => {
        if (t.id !== trackId) return t;
        return { ...t, [key]: value };
      });
      onUpdateProject({ ...project, tracks: updatedTracks });
    },
    [project, tracks, onUpdateProject]
  );

  const toggleTrackMute = (track) => {
    updateTrackProp(track.id, 'muted', !track.muted);
  };

  const toggleTrackSolo = (track) => {
    updateTrackProp(track.id, 'solo', !track.solo);
  };

  const handleDeleteTrack = (trackId) => {
    if (!onUpdateProject) return;
    const remainingTracks = tracks.filter((t) => t.id !== trackId);
    onUpdateProject({ ...project, tracks: remainingTracks });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px', color: '#e2e8f0' }}>
      {/* Panel Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '12px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(168, 85, 247, 0.3)'
            }}
          >
            <Sliders size={18} style={{ color: '#c084fc' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Audio Mixer Studio</h3>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              DSP Multi-Pista • Ecualización • Atenuación (Ducking) • Medidores VU
            </span>
          </div>
        </div>

        {onAddTrack && (
          <button
            onClick={() => onAddTrack('audio')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              color: '#a5b4fc',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 500,
              transition: 'all 0.2s'
            }}
          >
            <Plus size={14} />
            <span>Pista Audio</span>
          </button>
        )}
      </div>

      {/* Main Console Layout */}
      <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>
        {/* Track Channels Container */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            gap: '12px',
            overflowX: 'auto',
            paddingBottom: '8px'
          }}
        >
          {audioTracks.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                color: '#64748b',
                padding: '32px'
              }}
            >
              <Music size={36} style={{ opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: '13px' }}>No hay pistas de audio activas en la línea de tiempo.</p>
              {onAddTrack && (
                <button
                  onClick={() => onAddTrack('audio')}
                  style={{
                    background: '#6366f1',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Agregar Pista de Audio
                </button>
              )}
            </div>
          ) : (
            audioTracks.map((track) => {
              const trackMeter = meters[track.id] || { rms: 0, peak: 0, db: -60, isDucked: false };
              const volume = track.volume !== undefined ? Number(track.volume) : 1.0;
              const pan = track.pan !== undefined ? Number(track.pan) : 0;
              const isMuted = Boolean(track.muted);
              const isSolo = Boolean(track.solo);
              const eqPreset = track.eqPreset || 'flat';
              const isDucked = trackMeter.isDucked;

              return (
                <div
                  key={track.id}
                  style={{
                    width: '180px',
                    minWidth: '180px',
                    background: '#161922',
                    border: isSolo
                      ? '1px solid #eab308'
                      : isDucked
                      ? '1px solid rgba(244, 63, 94, 0.4)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    position: 'relative'
                  }}
                >
                  {/* Track Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ overflow: 'hidden' }}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#f8fafc',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden'
                        }}
                      >
                        {track.name || track.id}
                      </div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>
                        {track.type === 'video' ? 'Audio Video' : 'Canal Bus'}
                      </div>
                    </div>
                    {track.type === 'audio' && (
                      <button
                        onClick={() => handleDeleteTrack(track.id)}
                        title="Eliminar pista"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          padding: '4px'
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  {/* Solo & Mute Buttons */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => toggleTrackSolo(track)}
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        fontSize: '11px',
                        fontWeight: 700,
                        borderRadius: '4px',
                        cursor: 'pointer',
                        border: 'none',
                        background: isSolo ? '#eab308' : '#242b3b',
                        color: isSolo ? '#000000' : '#94a3b8',
                        transition: 'all 0.15s'
                      }}
                    >
                      SOLO
                    </button>
                    <button
                      onClick={() => toggleTrackMute(track)}
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        fontSize: '11px',
                        fontWeight: 700,
                        borderRadius: '4px',
                        cursor: 'pointer',
                        border: 'none',
                        background: isMuted ? '#ef4444' : '#242b3b',
                        color: isMuted ? '#ffffff' : '#94a3b8',
                        transition: 'all 0.15s'
                      }}
                    >
                      MUTE
                    </button>
                  </div>

                  {/* 3-Band EQ Presets */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500 }}>
                      Ecualizador & DSP
                    </label>
                    <select
                      value={eqPreset}
                      onChange={(e) => updateTrackProp(track.id, 'eqPreset', e.target.value)}
                      style={{
                        background: '#0d1117',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#cbd5e1',
                        fontSize: '11px',
                        padding: '4px 6px',
                        borderRadius: '4px',
                        outline: 'none'
                      }}
                    >
                      {AUDIO_EQ_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Stereo Panning */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
                      <span>Balance (Pan)</span>
                      <span>
                        {pan === 0 ? 'Centro' : pan < 0 ? `L ${Math.round(Math.abs(pan) * 100)}%` : `R ${Math.round(pan * 100)}%`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.05"
                      value={pan}
                      onChange={(e) => updateTrackProp(track.id, 'pan', parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: '#6366f1' }}
                    />
                  </div>

                  {/* VU Meter & Fader Section */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      flex: 1,
                      minHeight: '140px',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {/* Volume Slider / Fader */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.02"
                        value={volume}
                        onChange={(e) => updateTrackProp(track.id, 'volume', parseFloat(e.target.value))}
                        style={{
                          writingMode: 'bt-lr',
                          WebkitAppearance: 'slider-vertical',
                          width: '24px',
                          height: '110px',
                          accentColor: '#38bdf8'
                        }}
                      />
                      <span style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>
                        {Math.round(volume * 100)}%
                      </span>
                    </div>

                    {/* Stereo / Mono VU Meter Bar */}
                    <div
                      style={{
                        width: '14px',
                        height: '110px',
                        background: '#090d16',
                        borderRadius: '3px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        position: 'relative',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column-reverse'
                      }}
                    >
                      {/* RMS Level Fill */}
                      <div
                        style={{
                          width: '100%',
                          height: `${Math.min(100, trackMeter.rms * 100)}%`,
                          background:
                            trackMeter.peak > 0.88
                              ? 'linear-gradient(to top, #22c55e 65%, #eab308 85%, #ef4444 100%)'
                              : 'linear-gradient(to top, #22c55e 75%, #eab308 100%)',
                          transition: 'height 0.08s ease'
                        }}
                      />
                      {/* Peak Indicator Line */}
                      {trackMeter.peak > 0.05 && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            bottom: `${Math.min(100, trackMeter.peak * 100)}%`,
                            height: '2px',
                            background: '#ffffff'
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Auto-Ducking Indicator */}
                  {isDucked && (
                    <div
                      style={{
                        fontSize: '9px',
                        background: 'rgba(244, 63, 94, 0.2)',
                        border: '1px solid rgba(244, 63, 94, 0.4)',
                        color: '#fda4af',
                        padding: '3px 6px',
                        borderRadius: '4px',
                        textAlign: 'center',
                        fontWeight: 600
                      }}
                    >
                      Ducking Activo (-{Math.round((1 - (track.duckAmount ?? 0.22)) * 100)}%)
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Master Output Bus Strip */}
        <div
          style={{
            width: '190px',
            minWidth: '190px',
            background: 'linear-gradient(180deg, #181d28 0%, #10141d 100%)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            borderRadius: '10px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>MASTER BUS</div>
              <div style={{ fontSize: '10px', color: '#818cf8' }}>Limiter & Comp Activo</div>
            </div>
            <button
              onClick={handleMasterReset}
              title="Reset Master"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              <RotateCcw size={13} />
            </button>
          </div>

          {/* Master Mute */}
          <button
            onClick={handleMasterMuteToggle}
            style={{
              padding: '6px',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '5px',
              cursor: 'pointer',
              border: 'none',
              background: masterMuted ? '#ef4444' : '#252e42',
              color: masterMuted ? '#ffffff' : '#cbd5e1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            {masterMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span>{masterMuted ? 'MASTER SILENCIADO' : 'MASTER ACTIVO'}</span>
          </button>

          {/* Master VU & Fader */}
          <div
            style={{
              display: 'flex',
              gap: '14px',
              flex: 1,
              minHeight: '140px',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {/* Vertical Slider */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <input
                type="range"
                min="0"
                max="2"
                step="0.02"
                value={masterVolume}
                onChange={(e) => handleMasterVolumeChange(e.target.value)}
                style={{
                  writingMode: 'bt-lr',
                  WebkitAppearance: 'slider-vertical',
                  width: '26px',
                  height: '110px',
                  accentColor: '#818cf8'
                }}
              />
              <span style={{ fontSize: '11px', color: '#a5b4fc', fontFamily: 'monospace', fontWeight: 600 }}>
                {Math.round(masterVolume * 100)}%
              </span>
            </div>

            {/* Master Stereo Meter */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {/* Left Channel */}
              <div
                style={{
                  width: '12px',
                  height: '110px',
                  background: '#070a10',
                  borderRadius: '3px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column-reverse'
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: `${Math.min(100, masterMeter.rms * 100)}%`,
                    background:
                      masterMeter.peak > 0.9
                        ? 'linear-gradient(to top, #10b981 60%, #f59e0b 80%, #ef4444 100%)'
                        : 'linear-gradient(to top, #10b981 75%, #f59e0b 100%)',
                    transition: 'height 0.08s ease'
                  }}
                />
              </div>
              {/* Right Channel */}
              <div
                style={{
                  width: '12px',
                  height: '110px',
                  background: '#070a10',
                  borderRadius: '3px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column-reverse'
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: `${Math.min(100, masterMeter.rms * 0.98 * 100)}%`,
                    background:
                      masterMeter.peak > 0.9
                        ? 'linear-gradient(to top, #10b981 60%, #f59e0b 80%, #ef4444 100%)'
                        : 'linear-gradient(to top, #10b981 75%, #f59e0b 100%)',
                    transition: 'height 0.08s ease'
                  }}
                />
              </div>
            </div>
          </div>

          <div
            style={{
              textAlign: 'center',
              fontSize: '10px',
              fontFamily: 'monospace',
              color: masterMeter.db > -3 ? '#ef4444' : '#94a3b8'
            }}
          >
            {masterMeter.db <= -58 ? '-∞ dB' : `${masterMeter.db} dBFS`}
          </div>
        </div>
      </div>
    </div>
  );
});
