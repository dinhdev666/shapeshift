// Deterministic pseudo-random generator (Xoshiro128**).
// Stronger than Mulberry32, produces stable noise for a given seed.
// Based on xoshiro128** by Blackman and Vigna.
// P10: JSDoc annotations enable `tsc --noEmit` type-checking on the core engine.
(function () {
  /**
   * Xoshiro128** PRNG seeded from a 32-bit integer.
   * @param {number} seed - 32-bit seed value.
   * @returns {() => number} A function returning floats in [0, 1).
   */
  function createPRNG (seed) {
    // Initialize state using SplitMix32
    /** @param {number} a - Seed value. */
    function splitmix32(a) {
      /** @returns {number} */
      return function() {
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
    // P2: splitmix32 returns a float in [0, 1), so multiplying by 0xFFFFFFFF
    // could never reach 0xFFFFFFFF and mapped the top of the range with a
    // ~2^-32 bias. Multiplying by 2^32 covers the full 32-bit space uniformly.
    state[0] = (smix() * 0x100000000) >>> 0;
    state[1] = (smix() * 0x100000000) >>> 0;
    state[2] = (smix() * 0x100000000) >>> 0;
    state[3] = (smix() * 0x100000000) >>> 0;

    // Rotl helper
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

  /**
   * Legacy Mulberry32 PRNG for backwards-compatibility testing.
   * @param {number} seed - 32-bit seed value.
   * @returns {() => number} A function returning floats in [0, 1).
   */
  function createMulberry32PRNG(seed) {
    let state = seed >>> 0;
    return function next() {
      state |= 0;
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  globalThis.ssCreatePRNG = createPRNG;
  // For testing. Declared non-enumerable at the source so it is hidden even
  // before core/stealth.js runs cleanupGlobals().
  try {
    Object.defineProperty(globalThis, 'ssCreateMulberry32', {
      value: createMulberry32PRNG,
      writable: true,
      enumerable: false,
      configurable: true
    });
  } catch (e) {
    globalThis.ssCreateMulberry32 = createMulberry32PRNG;
  }
})();
