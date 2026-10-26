import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveMediaFileTolerant } from './mediaBackend.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory jobs registry
const exportJobs = new Map();

/**
 * Resolves an asset to an absolute filesystem path
 */
function resolveAssetPath(asset) {
  if (!asset) return null;

  // 1. Check direct diskPath
  if (asset.diskPath && fs.existsSync(asset.diskPath)) {
    return asset.diskPath;
  }

  // 2. Check url with embedded path parameter (/media-library/abs?path=...)
  if (asset.url && typeof asset.url === 'string' && asset.url.includes('path=')) {
    try {
      const u = new URL(asset.url, 'http://localhost');
      const p = decodeURIComponent(u.searchParams.get('path') || '');
      if (p && fs.existsSync(p)) return p;
    } catch (_) { }
  }

  // 3. Fallback search via tolerant matcher
  const fileName = asset.name || (asset.file ? asset.file.name : null);
  if (fileName) {
    const primaryDir = path.resolve(os.homedir(), 'Documentos/Archivo/Archivo');
    const resolved = resolveMediaFileTolerant(primaryDir, fileName);
    if (resolved && fs.existsSync(resolved)) return resolved;
  }

  return null;
}

/**
 * Builds the ffconcat script for video/image clips on the primary video track
 */
export function buildConcatScript(project, targetDuration) {
  const assetsMap = new Map((project.assets || []).map(a => [a.id, a]));
  const videoTracksWithClips = (project.tracks || []).filter(
    t => t.type === 'video' && t.visible !== false && Array.isArray(t.clips) && t.clips.length > 0
  );
  const videoTrack = videoTracksWithClips.find(t => t.id === 'track-v1')
    || videoTracksWithClips.find(t => t.id === 'track-v2')
    || videoTracksWithClips[0];

  if (!videoTrack || !Array.isArray(videoTrack.clips) || videoTrack.clips.length === 0) {
    throw new Error('No se encontraron clips de video en la línea de tiempo.');
  }

  // Sort clips by startTime ascending
  const sortedClips = [...videoTrack.clips].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));

  let concatContent = 'ffconcat version 1.0\n';
  let prevEnd = 0;
  let includedCount = 0;

  // Create a 1x1 black image in /tmp for filling timeline gaps cleanly
  const blackGapPath = path.resolve(os.tmpdir(), 'montage_black_gap.png');
  if (!fs.existsSync(blackGapPath)) {
    try {
      // 1x1 black png in base64
      const blackPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      fs.writeFileSync(blackGapPath, Buffer.from(blackPngBase64, 'base64'));
    } catch (_) { }
  }

  for (let i = 0; i < sortedClips.length; i++) {
    const clip = sortedClips[i];
    const asset = assetsMap.get(clip.assetId);
    const diskPath = resolveAssetPath(asset);

    if (!diskPath) {
      console.warn(`[FFmpegExporter] Clip "${clip.name}" (asset ${clip.assetId}) no encontrado en disco.`);
      continue;
    }

    const clipStart = Number(clip.startTime) || 0;
    const clipDuration = Number(clip.duration) || 0;
    if (clipDuration <= 0.01) continue;

    // Handle gap between previous clip and this clip
    if (clipStart > prevEnd + 0.08 && fs.existsSync(blackGapPath)) {
      const gapSec = clipStart - prevEnd;
      concatContent += `file '${blackGapPath.replace(/'/g, "'\\''")}'\n`;
      concatContent += `duration ${gapSec.toFixed(3)}\n`;
    }

    const safePath = diskPath.replace(/'/g, "'\\''");
    concatContent += `file '${safePath}'\n`;

    const isImage = asset.type === 'image';
    if (isImage) {
      concatContent += `duration ${clipDuration.toFixed(3)}\n`;
    } else {
      const sourceStart = Number(clip.sourceStart) || 0;
      const sourceEnd = sourceStart + clipDuration;
      concatContent += `inpoint ${sourceStart.toFixed(3)}\n`;
      concatContent += `outpoint ${sourceEnd.toFixed(3)}\n`;
    }

    prevEnd = Math.max(prevEnd, clipStart + clipDuration);
    includedCount++;
  }

  // ffconcat quirk: the last item requires a dummy repetition or trailing file to ensure full duration
  if (fs.existsSync(blackGapPath)) {
    concatContent += `file '${blackGapPath.replace(/'/g, "'\\''")}'\n`;
    concatContent += `duration 0.04\n`;
  }

  if (includedCount === 0) {
    throw new Error('Ninguno de los clips del proyecto pudo ser localizado en el disco.');
  }

  const targetSec = Number(targetDuration);
  const finalDuration = (!isNaN(targetSec) && targetSec > 0) ? targetSec : prevEnd;

  return {
    concatContent,
    includedCount,
    totalDuration: finalDuration
  };
}

/**
 * Starts an FFmpeg export job
 */
export async function startFFmpegJob({
  jobId,
  project,
  settings = {},
  audioFilePath = null,
  graphicOverlays = []
}) {
  const {
    width = 1920,
    height = 1080,
    fps = 30,
    bitrate = '8M',
    preset = 'veryfast',
    format = 'mp4'
  } = settings;

  const tempDir = path.resolve(os.tmpdir(), `montage_job_${jobId}`);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const { concatContent, totalDuration } = buildConcatScript(project, settings.duration);
  const concatFilePath = path.join(tempDir, 'timeline.txt');
  fs.writeFileSync(concatFilePath, concatContent, 'utf8');

  const outputPath = path.join(tempDir, `output.${format}`);

  // Save graphic overlay PNGs
  const validOverlays = [];
  if (Array.isArray(graphicOverlays) && graphicOverlays.length > 0) {
    graphicOverlays.forEach((g, idx) => {
      if (!g.pngDataUrl || typeof g.pngDataUrl !== 'string') return;
      try {
        const base64Data = g.pngDataUrl.replace(/^data:image\/\w+;base64,/, '');
        const pngPath = path.join(tempDir, `gfx_${idx}.png`);
        fs.writeFileSync(pngPath, Buffer.from(base64Data, 'base64'));
        validOverlays.push({
          path: pngPath,
          startTime: Number(g.startTime) || 0,
          duration: Number(g.duration) || 3,
          fadeIn: Number(g.fadeIn) || 0.4,
          fadeOut: Number(g.fadeOut) || 0.4
        });
      } catch (err) {
        console.warn(`[FFmpegExporter] Error saving graphic overlay ${idx}:`, err);
      }
    });
  }

  // Construct FFmpeg arguments
  const args = [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFilePath
  ];

  // Include Audio input if available
  let hasAudio = false;
  if (audioFilePath && fs.existsSync(audioFilePath)) {
    args.push('-i', audioFilePath);
    hasAudio = true;
  }

  // Include Graphic Overlay inputs
  validOverlays.forEach((ov) => {
    args.push('-i', ov.path);
  });

  // Calculate actual input indices
  // Input 0: Concat video
  // Input 1: Audio (if hasAudio)
  // Input 2..N: Overlays
  const overlayStartInputIdx = hasAudio ? 2 : 1;

  // Build Filter Complex
  let filterComplex = '';
  // 1. Base scale, crop to aspect ratio, and conform fps
  filterComplex += `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},format=yuv420p[base_v];`;

  let lastVideoNode = 'base_v';

  // 2. Chain each graphic overlay with timing and alpha fade
  if (validOverlays.length > 0) {
    validOverlays.forEach((ov, idx) => {
      const inputIdx = overlayStartInputIdx + idx;
      const st = ov.startTime;
      const et = ov.startTime + ov.duration;
      const fIn = Math.min(ov.fadeIn, ov.duration / 2);
      const fOut = Math.min(ov.fadeOut, ov.duration / 2);

      const gfxNode = `gfx_${idx}`;
      const outNode = `ov_${idx}`;

      filterComplex += `[${inputIdx}:v]fade=t=in:st=${st.toFixed(2)}:d=${fIn.toFixed(2)}:alpha=1,fade=t=out:st=${(et - fOut).toFixed(2)}:d=${fOut.toFixed(2)}:alpha=1[${gfxNode}];`;
      filterComplex += `[${lastVideoNode}][${gfxNode}]overlay=0:0:enable='between(t,${st.toFixed(2)},${et.toFixed(2)})'[${outNode}];`;
      lastVideoNode = outNode;
    });
  }

  // Remove trailing semicolon if any
  if (filterComplex.endsWith(';')) {
    filterComplex = filterComplex.slice(0, -1);
  }

  args.push('-filter_complex', filterComplex);
  args.push('-map', `[${lastVideoNode}]`);

  if (hasAudio) {
    args.push('-map', '1:a');
    args.push('-c:a', 'aac', '-b:a', '192k');
  }

  // Video encoding flags
  const effectiveBitrate = String(bitrate).toLowerCase().includes('m') ? bitrate : `${bitrate}M`;
  args.push(
    '-c:v', 'libx264',
    '-preset', preset,
    '-b:v', effectiveBitrate,
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-t', String(totalDuration),
    '-progress', 'pipe:1',
    outputPath
  );

  console.log(`[FFmpegExporter] Spawning FFmpeg job "${jobId}" (${validOverlays.length} overlays, audio: ${hasAudio})...`);

  const job = {
    id: jobId,
    status: 'rendering',
    phase: 'encoding',
    percent: 0,
    fps: 0,
    currentFrame: 0,
    totalFrames: Math.round(totalDuration * fps),
    totalDuration,
    etaSeconds: 0,
    speed: '0x',
    outputPath,
    tempDir,
    error: null,
    process: null,
    startTime: Date.now()
  };

  exportJobs.set(jobId, job);

  const ffmpegProcess = spawn('ffmpeg', args);
  job.process = ffmpegProcess;

  ffmpegProcess.stdout.on('data', (data) => {
    const text = data.toString();
    const lines = text.split('\n');
    let frame = null;
    let fpsVal = null;
    let outTimeUs = null;
    let speedStr = null;

    for (const line of lines) {
      const [k, v] = line.split('=');
      if (k === 'frame') frame = parseInt(v, 10);
      if (k === 'fps') fpsVal = parseFloat(v);
      if (k === 'out_time_us') outTimeUs = parseInt(v, 10);
      if (k === 'speed') speedStr = v.trim();
    }

    if (frame !== null && !isNaN(frame)) job.currentFrame = frame;
    if (fpsVal !== null && !isNaN(fpsVal)) job.fps = Math.round(fpsVal);
    if (speedStr) job.speed = speedStr;

    if (outTimeUs && totalDuration > 0) {
      const currentSeconds = outTimeUs / 1000000;
      const pct = Math.min(99, Math.max(1, Math.round((currentSeconds / totalDuration) * 100)));
      job.percent = pct;

      const remainingSec = Math.max(0, totalDuration - currentSeconds);
      const speedNum = parseFloat(job.speed.replace('x', '')) || (job.fps > 0 ? job.fps / fps : 1);
      job.etaSeconds = speedNum > 0 ? Math.round(remainingSec / speedNum) : Math.round(remainingSec);
    }
  });

  ffmpegProcess.stderr.on('data', (data) => {
    const errText = data.toString();
    // Keep last error snippet in case of unexpected failure
    if (/error|fatal|cannot/i.test(errText)) {
      job.lastLog = errText.slice(-300);
    }
  });

  ffmpegProcess.on('close', (code) => {
    job.process = null;
    if (code === 0 && fs.existsSync(outputPath)) {
      job.status = 'completed';
      job.percent = 100;
      job.etaSeconds = 0;
      job.fileSize = fs.statSync(outputPath).size;
      console.log(`[FFmpegExporter] Job "${jobId}" completed successfully! File size: ${(job.fileSize / 1024 / 1024).toFixed(2)} MB`);
    } else {
      job.status = 'failed';
      job.error = `FFmpeg proceso terminado con código ${code}: ${job.lastLog || 'Error de procesamiento'}`;
      console.error(`[FFmpegExporter] Job "${jobId}" failed:`, job.error);
    }
  });

  ffmpegProcess.on('error', (err) => {
    job.status = 'failed';
    job.error = `Error al invocar FFmpeg: ${err.message}`;
    console.error(`[FFmpegExporter] Job "${jobId}" error:`, err);
  });

  return job;
}

/**
 * Cancels and cleans up a job
 */
export function cancelFFmpegJob(jobId) {
  const job = exportJobs.get(jobId);
  if (!job) return false;

  if (job.process) {
    try {
      job.process.kill('SIGKILL');
    } catch (_) { }
    job.process = null;
  }

  job.status = 'cancelled';

  // Clean temp files asynchronously
  setTimeout(() => {
    try {
      if (job.tempDir && fs.existsSync(job.tempDir)) {
        fs.rmSync(job.tempDir, { recursive: true, force: true });
      }
    } catch (_) { }
    exportJobs.delete(jobId);
  }, 2000);

  return true;
}

/**
 * Returns the status of a job
 */
export function getFFmpegJobStatus(jobId) {
  const job = exportJobs.get(jobId);
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    percent: job.percent,
    fps: job.fps,
    currentFrame: job.currentFrame,
    totalFrames: job.totalFrames,
    etaSeconds: job.etaSeconds,
    speed: job.speed,
    fileSize: job.fileSize || 0,
    error: job.error
  };
}

/**
 * Streams the final video file for download
 */
export function serveFFmpegOutputFile(req, res, jobId) {
  const job = exportJobs.get(jobId);
  if (!job || job.status !== 'completed' || !fs.existsSync(job.outputPath)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Video exportado no encontrado o aún en proceso.' }));
    return;
  }

  const stat = fs.statSync(job.outputPath);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', 'attachment; filename="montaje_final.mp4"');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const stream = fs.createReadStream(job.outputPath);
  stream.pipe(res);
}
