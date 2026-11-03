// Page-world WebGL patcher - runs in MAIN world to hook actual page WebGL APIs.
// This script has NO access to chrome.* APIs but can modify page JavaScript.
// Namespace: `ss` (never `fp`). No third-party code copied.
(function () {
  'use strict';

  // Read configuration injected via dataset attributes by the ISOLATED-world
  // bootstrap. Values are seeded deterministically from (salt, origin).
  const current = document.currentScript;
  if (!current) return;

  const jitter = parseFloat(current.dataset.ssJitter || '1');
  const maskVendors = current.dataset.ssMaskVendors === 'true';
  const shuffleExt = current.dataset.ssShuffleExt === 'true';
  const debug = current.dataset.ssDebug === 'true';
  const baseSeed = Number(current.dataset.ssSeed || 0) >>> 0;

  function log() {
    if (debug) console.log.apply(console, arguments);
  }

  // Xoshiro128** PRNG - matches core/prng.js. Streaming: every call advances
  // state so noise never repeats on identical inputs.
  function createPRNG(seed) {
    function splitmix32(a) {
      return function () {
        a |= 0;
        a = a + 0x9e3779b9 | 0;
        let t = a ^ a >>> 16;
        t = Math.imul(t, 0x21f0aaad);
        t = t ^ t >>> 15;
        t = Math.imul(t, 0x735a2d97);
        return ((t = t ^ t >>> 15) >>> 0) / 4294967296;
      };
    }

    const smix = splitmix32(seed >>> 0);
    const state = new Uint32Array(4);
    state[0] = (smix() * 0xFFFFFFFF) >>> 0;
    state[1] = (smix() * 0xFFFFFFFF) >>> 0;
    state[2] = (smix() * 0xFFFFFFFF) >>> 0;
    state[3] = (smix() * 0xFFFFFFFF) >>> 0;

    function rotl(x, k) {
      return ((x << k) | (x >>> (32 - k))) >>> 0;
    }

    return function next() {
      const result = rotl(Math.imul(state[1], 5), 7) * 9;
      const t = (state[1] << 9) >>> 0;

      state[2] ^= state[0];
      state[3] ^= state[1];
      state[1] ^= state[2];
      state[0] ^= state[3];
      state[2] ^= t;
      state[3] = rotl(state[3], 11);

      return (result >>> 0) / 4294967296;
    };
  }

  const ssPagePrng = createPRNG((baseSeed ^ 0x9E3779B9) >>> 0);

  // Gaussian noise via Box-Muller, drawing from the streaming PRNG.
  let ssSpareGaussian = null;
  function ssGaussianNoise(mean, stddev) {
    mean = mean === undefined ? 0 : mean;
    stddev = stddev === undefined ? 1 : stddev;
    if (ssSpareGaussian !== null) {
      const value = ssSpareGaussian;
      ssSpareGaussian = null;
      return mean + stddev * value;
    }

    const u1 = ssPagePrng();
    const u2 = ssPagePrng();
    const radius = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;

    ssSpareGaussian = radius * Math.sin(theta);
    return mean + stddev * (radius * Math.cos(theta));
  }

  // Uniform noise in [-scale/2, scale/2], streaming from the PRNG.
  function ssNoise(scale) {
    scale = scale === undefined ? 1 : scale;
    return (ssPagePrng() - 0.5) * scale;
  }

  // Minimal timing resistance for page context: burn a small deterministic
  // amount of time so call timing cannot be used as a stable oracle.
  function ssExecutionJitter() {
    const iterations = Math.floor(ssPagePrng() * 10);
    let dummy = 0;
    for (let i = 0; i < iterations; i++) {
      dummy += Math.sqrt(i + 1);
    }
    return dummy;
  }

  // Symbol-based tracking instead of __ss_patched on page objects.
  const patchedMarker = Symbol('ss.patched');
  const patchedFunctions = new WeakMap();

  function isPatched(fn) {
    return patchedFunctions.has(fn) || fn[patchedMarker] === true;
  }

  function markPatched(fn) {
    try {
      patchedFunctions.set(fn, true);
    } catch (e) {
      try {
        fn[patchedMarker] = true;
      } catch (e2) { /* ignore */ }
    }
  }

  // Per-context cache so repeated getParameter calls on the same context agree
  // (stability), while the PRNG stream still varies per identity.
  const valueCache = new WeakMap();

  function cacheGet(ctx, key) {
    let c = valueCache.get(ctx);
    if (!c) {
      c = new Map();
      valueCache.set(ctx, c);
    }
    return c;
  }

  function patch(proto) {
    if (!proto || !proto.getParameter) return;
    const orig = proto.getParameter;
    if (isPatched(orig)) return;
    markPatched(orig);

    proto.getParameter = function (p) {
      ssExecutionJitter(); // timing resistance
      const value = orig.call(this, p);

      if (typeof value === 'number') {
        // Integer / hardware-limit params stay exact.
        const cache = cacheGet(this, p);
        if (cache.has(p)) return cache.get(p);
        // jitter: only non-integer, non-limit params are perturbed.
        const out = Number.isInteger(value) ? value : value + ssNoise(jitter);
        cache.set(p, out);
        return out;
      }

      const gl = this;
      const UNMASKED_VENDOR = 0x9245;
      const UNMASKED_RENDERER = 0x9246;
      const vendorParams = [
        gl.VENDOR,
        gl.RENDERER,
        UNMASKED_VENDOR,
        UNMASKED_RENDERER
      ].filter((v) => typeof v === 'number' && v > 0);

      if (maskVendors && vendorParams.includes(p) && typeof value === 'string') {
        // Keep the real GPU string as the base so VENDOR / RENDERER /
        // UNMASKED_* stay coherent with the actual GPU, then append a
        // seed-derived suffix so the value varies per identity instead of
        // being a completely fake static persona string. No "fp-" marker.
        const cache = cacheGet(this, p);
        if (cache.has(p)) return cache.get(p);
        const suffix = String.fromCharCode(65 + Math.floor(ssPagePrng() * 26));
        const out = value + ' (' + suffix + ')';
        cache.set(p, out);
        return out;
      }

      return value;
    };

    if (proto.getSupportedExtensions && shuffleExt) {
      const origExt = proto.getSupportedExtensions;
      if (!isPatched(origExt)) {
        markPatched(origExt);
        proto.getSupportedExtensions = function () {
          const list = origExt.call(this);
          if (!Array.isArray(list)) return list;
          // Deterministically permute with a seed-keyed Fisher-Yates pass so
          // the SET stays identical to the native one and only the order
          // varies per install.
          const out = list.slice();
          for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(ssPagePrng() * (i + 1));
            const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
          }
          return out;
        };
      }
    }

    log('[shapeshift][webgl] patched', proto.constructor && proto.constructor.name);
  }

  function tryPatch() {
    try {
      if (window.WebGLRenderingContext) patch(WebGLRenderingContext.prototype);
      if (window.WebGL2RenderingContext) patch(WebGL2RenderingContext.prototype);
    } catch (e) {
      // ignore
    }
  }

  tryPatch();
  if (!window.WebGLRenderingContext || !window.WebGL2RenderingContext) {
    window.addEventListener('load', tryPatch, { once: true });
  }
})();
