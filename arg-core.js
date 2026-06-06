// ══════════════════════════════════════════════════════════════════════════
//  ARG CORE — núcleo compartido entre index.html y personajes.html
//  Provee: hashing de códigos (SHA-256), ajustes persistentes y motor de audio.
// ══════════════════════════════════════════════════════════════════════════
(function (global) {
  const ARG = {};

  // ── SHA-256 (puro JS, sin dependencias, ASCII) ───────────────────────────
  function sha256(ascii) {
    function r(v, a) { return (v >>> a) | (v << (32 - a)); }
    const mp = Math.pow, mw = mp(2, 32);
    let res = "", words = [], bl = ascii.length * 8;
    let hash = sha256.h = sha256.h || [];
    let k = sha256.k = sha256.k || [];
    let pc = k.length, ic = {};
    for (let c = 2; pc < 64; c++) {
      if (!ic[c]) {
        for (let i = 0; i < 313; i += c) ic[i] = c;
        hash[pc] = (mp(c, .5) * mw) | 0;
        k[pc++] = (mp(c, 1 / 3) * mw) | 0;
      }
    }
    ascii += "\x80";
    while (ascii.length % 64 - 56) ascii += "\x00";
    for (let i = 0; i < ascii.length; i++) {
      const j = ascii.charCodeAt(i);
      if (j >> 8) return null; // solo ASCII
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (bl / mw) | 0;
    words[words.length] = bl;
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, j += 16), oh = hash;
      hash = hash.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        const t1 = hash[7] + (r(e, 6) ^ r(e, 11) ^ r(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i]
          + (w[i] = i < 16 ? w[i] : (w[i - 16]
            + (r(w15, 7) ^ r(w15, 18) ^ (w15 >>> 3)) + w[i - 7]
            + (r(w2, 17) ^ r(w2, 19) ^ (w2 >>> 10))) | 0);
        const t2 = (r(a, 2) ^ r(a, 13) ^ r(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
      }
      for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oh[i]) | 0;
    }
    for (let i = 0; i < 8; i++)
      for (let j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        res += ((b < 16) ? 0 : "") + b.toString(16);
      }
    return res;
  }
  // Normaliza igual que la entrada del usuario: trim + mayúsculas.
  ARG.hash = function (str) { return sha256(String(str).trim().toUpperCase()); };

  // ── AJUSTES PERSISTENTES ──────────────────────────────────────────────────
  const SETTINGS_KEY = "pf_settings";
  const DEFAULTS = {
    glitch: true,
    animations: true,
    notifications: true,
    highContrast: false,
    sound: false,
  };

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return Object.assign({}, DEFAULTS, s);
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  ARG.settings = loadSettings();

  ARG.saveSettings = function () {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(ARG.settings));
  };

  ARG.setSetting = function (key, value) {
    ARG.settings[key] = value;
    ARG.saveSettings();
    ARG.applySettings();
  };

  // Aplica los ajustes que tienen efecto inmediato en el documento.
  ARG.applySettings = function () {
    if (document.body)
      document.body.classList.toggle("hc", !!ARG.settings.highContrast);
    if (ARG.settings.sound) ARG.audio.startAmbient();
    else ARG.audio.stopAmbient();
  };

  ARG.glitchEnabled = function () { return !!ARG.settings.glitch; };
  ARG.animEnabled = function () { return !!ARG.settings.animations; };
  ARG.notifyEnabled = function () { return !!ARG.settings.notifications; };

  // ── MOTOR DE AUDIO (Web Audio API, sonido procedural) ─────────────────────
  const audio = {
    ctx: null,
    ambientNodes: null,
    masterGain: null,
    ready: false,
  };

  function ensureCtx() {
    if (!audio.ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      audio.ctx = new AC();
      audio.masterGain = audio.ctx.createGain();
      audio.masterGain.gain.value = 0.5;
      audio.masterGain.connect(audio.ctx.destination);
    }
    if (audio.ctx.state === "suspended") audio.ctx.resume();
    return audio.ctx;
  }

  audio.startAmbient = function () {
    if (!ARG.settings.sound) return;
    const ctx = ensureCtx();
    if (!ctx || audio.ambientNodes) return;
    // Drone grave + segunda capa + ruido filtrado muy suave.
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(audio.masterGain);

    const o1 = ctx.createOscillator();
    o1.type = "sine"; o1.frequency.value = 55;
    const o2 = ctx.createOscillator();
    o2.type = "sine"; o2.frequency.value = 82.5;
    const og = ctx.createGain(); og.gain.value = 0.06;
    o1.connect(og); o2.connect(og); og.connect(g);

    // LFO para que el drone "respire".
    const lfo = ctx.createOscillator();
    lfo.type = "sine"; lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);

    o1.start(); o2.start(); lfo.start();
    g.gain.setTargetAtTime(0.25, ctx.currentTime, 1.5); // fade in
    audio.ambientNodes = { g, o1, o2, lfo };
  };

  audio.stopAmbient = function () {
    if (!audio.ambientNodes || !audio.ctx) return;
    const { g, o1, o2, lfo } = audio.ambientNodes;
    const t = audio.ctx.currentTime;
    g.gain.setTargetAtTime(0, t, 0.4);
    setTimeout(() => {
      try { o1.stop(); o2.stop(); lfo.stop(); } catch (e) {}
    }, 1200);
    audio.ambientNodes = null;
  };

  function blip(freqStart, freqEnd, dur, type, vol) {
    if (!ARG.settings.sound) return;
    const ctx = ensureCtx();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || "square";
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(freqStart, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(audio.masterGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol) {
    if (!ARG.settings.sound) return;
    const ctx = ensureCtx();
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass"; filt.frequency.value = 1200; filt.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = vol || 0.15;
    src.connect(filt); filt.connect(g); g.connect(audio.masterGain);
    src.start();
  }

  // Efectos públicos
  ARG.audio = audio;
  ARG.sfx = {
    key()     { blip(660, 760, 0.04, "square", 0.05); },
    success() { blip(440, 880, 0.18, "sine", 0.2); setTimeout(() => blip(880, 1320, 0.16, "sine", 0.16), 120); },
    fail()    { noiseBurst(0.18, 0.18); blip(220, 80, 0.25, "sawtooth", 0.14); },
    glitch()  { noiseBurst(0.08, 0.12); },
    open()    { blip(520, 640, 0.06, "triangle", 0.08); },
  };

  // Cualquier interacción del usuario "despierta" el audio (política de autoplay).
  function wake() {
    ensureCtx();
    if (ARG.settings.sound) audio.startAmbient();
    global.removeEventListener("pointerdown", wake);
    global.removeEventListener("keydown", wake);
  }
  global.addEventListener("pointerdown", wake);
  global.addEventListener("keydown", wake);

  // Aplica ajustes en cuanto el DOM esté listo.
  if (document.readyState !== "loading") ARG.applySettings();
  else document.addEventListener("DOMContentLoaded", ARG.applySettings);

  global.ARG = ARG;
})(window);
