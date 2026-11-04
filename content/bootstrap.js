// Bootstrap: load salt, derive seed, initialize PRNG/noise helpers.
(function () {
  const readyPromise = (async () => {
    try {
      const getSalt = globalThis.ssGetSalt;
      const loadConfig = globalThis.ssLoadConfig;
      const deriveSeed = globalThis.ssDeriveSeed;
      const hashString = globalThis.ssHashString;
      const createPRNG = globalThis.ssCreatePRNG;

      if (!getSalt || !deriveSeed || !hashString || !createPRNG || !loadConfig) {
        throw new Error("Fingerprint bootstrap missing prerequisites");
      }

      // Load stored config first (merges with defaults)
      let config = await loadConfig();

      // Check if current site is whitelisted (protection disabled)
      // P2: optional chaining does NOT protect an undeclared identifier - if
      // `chrome` is undefined (unit tests, non-extension context) `chrome?.x`
      // throws ReferenceError instead of yielding undefined. Guard the name
      // itself, exactly like config.js already does.
      if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        try {
          const siteResult = await new Promise((resolve) => {
            chrome.storage.local.get(['ss_site_settings'], (result) => {
              resolve(result);
            });
          });

          const siteSettings = siteResult.ss_site_settings || {};
          const currentOrigin = location.origin;
          const siteSetting = siteSettings[currentOrigin];

          if (siteSetting && siteSetting.enabled === false) {
            if (config.debug) {
              console.log('[shapeshift][bootstrap] Protection disabled for this site (whitelisted)');
            }
            return null; // Skip hook installation
          }

          // FEAT-4: per-origin persona override. The global `persona` setting
          // applies to every site, but some contexts need a specific OS family
          // (e.g., a Windows-only web app). The per-origin value is read here
          // and merged into the config BEFORE the env object is constructed so
          // every downstream surface (UA-CH, WebGL, WebGPU, keyboard, etc.)
          // sees the same override. The `:persona` seed key is unchanged — the
          // persona only selects which tagged record to read, not how it is
          // derived.
          if (siteSetting && siteSetting.persona) {
            const PERSONA_MODES = ['auto', 'windows', 'mac', 'linux'];
            if (PERSONA_MODES.indexOf(siteSetting.persona) !== -1) {
              const prevPersona = config.persona;
              config = Object.assign({}, config, { persona: siteSetting.persona });
              if (config.debug) {
                console.log('[shapeshift][bootstrap] Per-origin persona override for', currentOrigin, ':', prevPersona, '→', siteSetting.persona);
              }
            }
          }

          // FEAT-1: per-origin noise-strength overrides merge on top of the
          // global config for this origin only. Values are surface scalars
          // keyed by surface name (canvasNoiseStrength, webglJitter,
          // audioNoiseStrength, ...). Each hook reads its own key from config,
          // so an override takes effect wherever that surface's noise strength
          // is consulted.
          if (siteSetting && siteSetting.noiseOverrides && typeof siteSetting.noiseOverrides === 'object') {
            // Sanitize the per-origin override before it lands in the effective
            // config: clamp every numeric scalar to its schema bounds, keep only
            // whitelisted keys, and drop unknown / wrong-typed values. A corrupt
            // or hand-edited ss_site_settings entry must not be able to push a
            // surface noise strength outside the range ssValidateConfig enforces
            // at config load (this merge runs after that clamp).
            const numericBounds = globalThis.ssConfigNumericBounds || {};
            const booleanKeys = globalThis.ssConfigBooleanKeys || [];
            const groupKeys = globalThis.ssConfigGroupKeys || [];
            const defaults = globalThis.ssConfigDefaults || {};
            const allowed = {};
            for (let i = 0; i < booleanKeys.length; i++) allowed[booleanKeys[i]] = 'bool';
            for (const k in numericBounds) allowed[k] = 'num';
            for (let i = 0; i < groupKeys.length; i++) allowed[groupKeys[i]] = 'group';
            const merged = {};
            const dropped = [];
            for (const k in siteSetting.noiseOverrides) {
              const v = siteSetting.noiseOverrides[k];
              const kind = allowed[k];
              if (kind === 'bool') {
                if (typeof v === 'boolean') merged[k] = v; else dropped.push(k);
              } else if (kind === 'num') {
                const bounds = numericBounds[k];
                if (typeof v === 'number' && Number.isFinite(v)) {
                  merged[k] = bounds ? Math.min(Math.max(v, bounds[0]), bounds[1]) : v;
                } else {
                  dropped.push(k);
                }
              } else if (kind === 'group' && v && typeof v === 'object' && !Array.isArray(v)) {
                const g = {};
                const gDef = (defaults[k] && typeof defaults[k] === 'object') ? defaults[k] : {};
                for (const gk in v) {
                  const gv = v[gk];
                  if (typeof gDef[gk] === 'number') {
                    const gb = numericBounds[k + '.' + gk];
                    if (typeof gv === 'number' && Number.isFinite(gv)) {
                      g[gk] = gb ? Math.min(Math.max(gv, gb[0]), gb[1]) : gv;
                    } else {
                      dropped.push(k + '.' + gk);
                    }
                  } else if (typeof gDef[gk] === 'boolean') {
                    if (typeof gv === 'boolean') g[gk] = gv; else dropped.push(k + '.' + gk);
                  } else {
                    g[gk] = gv;
                  }
                }
                merged[k] = g;
              } else {
                dropped.push(k);
              }
            }
            const prevOverrides = Object.keys(siteSetting.noiseOverrides).map(function (k) { return k + ':' + config[k]; });
            config = Object.assign({}, config, merged);
            if (config.debug) {
              const nextOverrides = Object.keys(merged).map(function (k) { return k + ':' + config[k]; });
              console.log('[shapeshift][bootstrap] Per-origin noise overrides for', currentOrigin, ':', prevOverrides.join(', '), '→', nextOverrides.join(', '));
              if (dropped.length) console.log('[shapeshift][bootstrap] Dropped invalid override keys:', dropped.join(', '));
            }
          }
        } catch (e) {
          // Continue with protection if whitelist check fails
          if (config.debug) {
            console.error('[shapeshift][bootstrap] Failed to check whitelist:', e);
          }
        }
      }

      // P0 (per-origin salt): pass the origin so a rotation for one site does
      // not invalidate the identity every other site already has a session for.
      const salt = await getSalt(config.perOriginFingerprint ? location.origin : '');
      const baseSeed = hashString(String(salt));
      const seed = config.perOriginFingerprint ? deriveSeed(salt, location.origin) : baseSeed;
      const prng = createPRNG(seed);

      // Uniform noise distribution
      const uniformNoise = (scale = 1) => (prng() - 0.5) * scale;

      // Gaussian/Normal noise distribution (Box-Muller transform)
      // More natural and harder to detect statistically
      let spareGaussian = null;
      const gaussianNoise = (mean = 0, stddev = 1) => {
        if (spareGaussian !== null) {
          const value = spareGaussian;
          spareGaussian = null;
          return mean + stddev * value;
        }

        // P1: prng() can legitimately return exactly 0, and Math.log(0) is
        // -Infinity, which made radius Infinity and poisoned the sample (and the
        // spare) with NaN/Infinity. Clamp to the smallest positive double so the
        // transform stays finite; the probability of hitting it is ~2^-32.
        let u1 = prng();
        if (!(u1 > 0)) u1 = Number.MIN_VALUE;
        const u2 = prng();
        const radius = Math.sqrt(-2 * Math.log(u1));
        const theta = 2 * Math.PI * u2;

        spareGaussian = radius * Math.sin(theta);
        return mean + stddev * (radius * Math.cos(theta));
      };

      // Choose noise function based on config
      const noise = config.useGaussianNoise
        ? (scale = 1) => gaussianNoise(0, scale)
        : uniformNoise;

      // Independent PRNG per protected surface (P1 2.26): enabling or disabling
      // one module must not shift the values another module reports. Each hook
      // asks for its own stream keyed on (salt, origin, surfaceId); the shared
      // `prng` stays for timing jitter and as a fallback.
      const deriveSurfaceSeed = globalThis.ssDeriveSurfaceSeed;
      const surfaceOrigin = config.perOriginFingerprint ? location.origin : '';
      const prngFor = (surfaceId) => createPRNG(
        deriveSurfaceSeed ? deriveSurfaceSeed(salt, surfaceOrigin, surfaceId) : seed
      );

      // Initialize timing utilities with an independent surface PRNG so timing
      // jitter no longer consumes the shared noise stream.
      if (globalThis.ssTimingUtils) {
        globalThis.ssTimingUtils.init(prngFor('timing'));
      }

      const env = { salt, seed, prng, prngFor, noise, gaussianNoise, uniformNoise, config };

      globalThis.ssPRNG = prng;
      globalThis.ssNoise = noise;
      globalThis.ssEnv = env;

      // Send config to page-world injector (MAIN world).
      //
      // A window message is observable by the page, so this channel is not a
      // secret: the injector's one-shot latch and config whitelist are what stop
      // a page script from re-installing hooks or smuggling extra keys through a
      // forged SS_INIT_PAGE_HOOKS message. `protocol` lets a future release
      // change the payload shape without old injectors acting on a message they
      // do not understand.
      //
      // Post immediately without waiting for a nonce: page inline scripts see
      // real APIs for the shortest possible window, and the injector installs
      // hooks on the first valid message it receives.
      window.postMessage({
        type: 'SS_INIT_PAGE_HOOKS',
        protocol: 1,
        config: config,
        seed: seed
      }, location.origin);

      if (config.debug) {
        console.log('[shapeshift][bootstrap] Sent config to page-world injector');
      }

      return env;
    } catch (e) {
      // Fail closed: do not break the page if bootstrap fails.
      return null;
    }
  })();

  globalThis.ssReady = readyPromise;
})();
