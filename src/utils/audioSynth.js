/**
 * Generates an audio buffer and WAV Data URL for demo/testing
 * using the Web Audio API offline rendering
 */

export function generateSampleAudioTrack(duration = 12) {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * duration);
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const buffer = audioCtx.createBuffer(2, numSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Generate a pleasant synth chord progression with soft pulse beat
  const bpm = 110;
  const beatLength = 60 / bpm;
  const chords = [
    [261.63, 329.63, 392.00], // C major
    [220.00, 261.63, 329.63], // A minor
    [174.61, 220.00, 261.63], // F major
    [196.00, 246.94, 293.66], // G major
  ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const beatIndex = Math.floor(t / beatLength);
    const chordIndex = Math.floor(beatIndex / 4) % chords.length;
    const currentChord = chords[chordIndex];

    // Synth pad tone
    let padSample = 0;
    for (const freq of currentChord) {
      padSample += Math.sin(2 * Math.PI * freq * t) * 0.12;
      padSample += Math.sin(2 * Math.PI * (freq * 0.5) * t) * 0.08; // sub-bass
    }

    // Soft beat kick/snare
    const beatProgress = (t % beatLength) / beatLength;
    let kick = 0;
    if (beatIndex % 2 === 0 && beatProgress < 0.25) {
      const kickEnv = Math.exp(-beatProgress * 20);
      kick = Math.sin(2 * Math.PI * (60 + 80 * kickEnv) * t) * kickEnv * 0.35;
    }

    // Soft hi-hat
    let hat = 0;
    if (beatProgress < 0.08) {
      hat = (Math.random() * 2 - 1) * Math.exp(-beatProgress * 40) * 0.08;
    }

    // Combine with gentle fade out at end
    const masterFade = t > duration - 1 ? (duration - t) : (t < 0.5 ? t / 0.5 : 1);
    const totalSample = (padSample + kick + hat) * masterFade * 0.6;

    left[i] = totalSample;
    right[i] = totalSample * (0.9 + 0.1 * Math.sin(t * 2));
  }

  // Convert buffer to WAV Blob / DataURL
  return bufferToWavDataUrl(buffer);
}

function bufferToWavDataUrl(abuffer) {
  const numOfChan = abuffer.numberOfChannels;
  const length = abuffer.length * numOfChan * 2 + 44;
  const outBuffer = new ArrayBuffer(length);
  const view = new DataView(outBuffer);
  const channels = [];
  let sample = 0;
  let offset = 0;
  let pos = 0;

  function setUint16(data) {
    view.setUint16(pos, data, true);
    pos += 2;
  }
  function setUint32(data) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  // RIFF identifier
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit
  setUint32(0x61746164); // "data" chunk
  setUint32(length - pos - 4);

  for (let i = 0; i < abuffer.numberOfChannels; i++) {
    channels.push(abuffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  const blob = new Blob([outBuffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}
