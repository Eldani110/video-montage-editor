/**
 * Generates sample high-resolution artwork and demo project
 * so the editor has ready-to-use multimedia out of the box.
 */
import { generateSampleAudioTrack } from './audioSynth';

export function createSampleImage(title, subtitle, bgGradStart, bgGradEnd, accentColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');

  // Background Gradient
  const grad = ctx.createLinearGradient(0, 0, 1280, 720);
  grad.addColorStop(0, bgGradStart);
  grad.addColorStop(1, bgGradEnd);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1280, 720);

  // Artistic background elements / shapes
  ctx.fillStyle = accentColor;
  ctx.globalAlpha = 0.15;
  ctx.beginPath();
  ctx.arc(950, 200, 280, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(200, 600, 320, 0, Math.PI * 2);
  ctx.fill();

  // Grid/lines effect
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 1280; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 720);
    ctx.stroke();
  }
  for (let y = 0; y < 720; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1280, y);
    ctx.stroke();
  }

  // Mountain / Wave Silhouette
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(0, 720);
  ctx.lineTo(0, 520);
  ctx.quadraticCurveTo(320, 380, 640, 480);
  ctx.quadraticCurveTo(960, 580, 1280, 420);
  ctx.lineTo(1280, 720);
  ctx.closePath();
  ctx.fill();

  // Foreground mountain
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = '#020617';
  ctx.beginPath();
  ctx.moveTo(0, 720);
  ctx.lineTo(0, 600);
  ctx.quadraticCurveTo(400, 480, 800, 560);
  ctx.quadraticCurveTo(1050, 620, 1280, 520);
  ctx.lineTo(1280, 720);
  ctx.closePath();
  ctx.fill();

  // Glow badge
  ctx.globalAlpha = 1.0;
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 56px Outfit, Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 640, 310);

  ctx.shadowBlur = 10;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 24px Inter, sans-serif';
  ctx.fillText(subtitle, 640, 365);

  ctx.shadowBlur = 0;

  return canvas.toDataURL('image/jpeg', 0.9);
}

export function getSampleAssets() {
  const img1 = createSampleImage('ATARDECER CÓSMICO', 'Fotografía de Paisaje 4K', '#311042', '#0f172a', '#f43f5e');
  const img2 = createSampleImage('HORIZONTE NEÓN', 'Ciudad Cyberpunk & Luces', '#064e3b', '#022c22', '#10b981');
  const img3 = createSampleImage('AURORA BOREAL', 'Expedición Ártica Polar', '#1e1b4b', '#030712', '#6366f1');
  const img4 = createSampleImage('DUNA DORADA', 'Desierto de Namibia al Sol', '#78350f', '#451a03', '#f59e0b');

  let audioUrl = '';
  try {
    audioUrl = generateSampleAudioTrack(15);
  } catch {
    audioUrl = '';
  }

  return [
    {
      id: 'asset-1',
      name: 'Atardecer Cósmico.jpg',
      type: 'image',
      url: img1,
      duration: 5,
      width: 1280,
      height: 720,
      color: '#f43f5e',
    },
    {
      id: 'asset-2',
      name: 'Horizonte Neón.jpg',
      type: 'image',
      url: img2,
      duration: 5,
      width: 1280,
      height: 720,
      color: '#10b981',
    },
    {
      id: 'asset-3',
      name: 'Aurora Boreal.jpg',
      type: 'image',
      url: img3,
      duration: 5,
      width: 1280,
      height: 720,
      color: '#6366f1',
    },
    {
      id: 'asset-4',
      name: 'Duna Dorada.jpg',
      type: 'image',
      url: img4,
      duration: 5,
      width: 1280,
      height: 720,
      color: '#f59e0b',
    },
    {
      id: 'asset-5',
      name: 'Sintetizador Lofi Beat.wav',
      type: 'audio',
      url: audioUrl,
      duration: 15,
      color: '#06b6d4',
    }
  ];
}

export function createNewProjectTemplate(name = 'Nuevo Montaje') {
  const assets = getSampleAssets();
  const id = 'proj_' + Date.now();

  return {
    id,
    name,
    version: '1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fileName: `${name.toLowerCase().replace(/[^a-z0-9_-]/gi, '_')}.vproj`,
    settings: {
      width: 1920,
      height: 1080,
      fps: 30,
      aspectRatio: '16:9',
      duration: 20, // Total project duration in seconds
    },
    assets: assets,
    tracks: [
      {
        id: 'track-v2',
        name: 'V2 (Superposición)',
        type: 'video',
        visible: true,
        muted: false,
        locked: false,
        clips: []
      },
      {
        id: 'track-v1',
        name: 'V1 (Video / Fotos)',
        type: 'video',
        visible: true,
        muted: false,
        locked: false,
        clips: [
          {
            id: 'clip-1',
            assetId: 'asset-1',
            trackId: 'track-v1',
            name: 'Atardecer Cósmico',
            startTime: 0,
            duration: 4,
            fit: 'cover',
            scale: 1,
            opacity: 1,
            color: '#f43f5e'
          },
          {
            id: 'clip-2',
            assetId: 'asset-2',
            trackId: 'track-v1',
            name: 'Horizonte Neón',
            startTime: 4,
            duration: 4,
            fit: 'cover',
            scale: 1,
            opacity: 1,
            color: '#10b981'
          },
          {
            id: 'clip-3',
            assetId: 'asset-3',
            trackId: 'track-v1',
            name: 'Aurora Boreal',
            startTime: 8,
            duration: 4,
            fit: 'cover',
            scale: 1,
            opacity: 1,
            color: '#6366f1'
          }
        ]
      },
      {
        id: 'track-a1',
        name: 'A1 (Música de Fondo)',
        type: 'audio',
        visible: true,
        muted: false,
        locked: false,
        clips: [
          {
            id: 'clip-audio-1',
            assetId: 'asset-5',
            trackId: 'track-a1',
            name: 'Sintetizador Lofi Beat',
            startTime: 0,
            duration: 12,
            volume: 1,
            color: '#06b6d4'
          }
        ]
      },
      {
        id: 'track-a2',
        name: 'A2 (Efectos de Sonido)',
        type: 'audio',
        visible: true,
        muted: false,
        locked: false,
        clips: []
      }
    ]
  };
}
