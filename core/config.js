// Basic configuration knobs for fingerprint perturbation.
// P10: JSDoc annotations enable `tsc --noEmit` type-checking on the core engine.
//
// Architecture §4: defaults, schema version and the legacy flat-key map live
// in core/config-schema.js, which manifest.json loads first. This file builds
// the live config object from that schema and keeps the storage load/merge
// logic, so there is exactly one definition of what a default value is.
(function () {
  const schema = globalThis.ssConfigSchema || {};
  const defaults = schema.defaults || {};
  // P1: this used to be a shallow copy, so every nested group
  // (`config.navigator`, `config.webrtc`, ...) was the SAME object as
  // `schema.defaults.navigator`. A hook that mutated its group in place
  // therefore edited the process-wide defaults, and the next
  // ssLoadConfig() call merged the mutated values back in as if the user
  // had chosen them. Deep-clone the groups so defaults stay pristine.
  /**
   * Deep-clone a nested config group so defaults stay pristine.
   * @param {Record<string, unknown>|*} v
   * @returns {Record<string, unknown>|*}
   */
  const cloneGroup = (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
    const out = {};
    for (const gk in v) {
      const val = v[gk];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        out[gk] = cloneGroup(val);
      } else {
        out[gk] = val;
      }
    }
    return out;
  };
  const config = {};
  for (const k in defaults) config[k] = cloneGroup(defaults[k]);

  const LEGACY_FLAT_TO_NESTED = schema.flatToNested || {};

  // Config schema version (Architecture §4). Storing the version lets a future
  // release migrate an old ssConfig instead of silently reading keys that no
  // longer mean what they used to.
  const CONFIG_VERSION = schema.version || 1;
  config.ssConfigVersion = CONFIG_VERSION;

  // One-shot migrations keyed by the version they upgrade *from*. Each entry
  // rewrites a stored config object in place and the chain runs until the
  // stored version reaches CONFIG_VERSION.
  const CONFIG_MIGRATIONS = schema.migrations || {};

  /**
   * Run one-shot config version migrations.
   * @param {Record<string, unknown>} stored - Stored config object.
   * @returns {Record<string, unknown>} Migrated config.
   */
  globalThis.ssMigrateConfig = function (stored) {
    if (!stored || typeof stored !== 'object') return stored;
    let version = Number.isInteger(stored.ssConfigVersion) ? stored.ssConfigVersion : 0;
    while (version < CONFIG_VERSION) {
      const step = CONFIG_MIGRATIONS[version];
      if (typeof step !== 'function') { stored.ssConfigVersion = CONFIG_VERSION; break; }
      stored = step(stored);
      const next = Number.isInteger(stored.ssConfigVersion) ? stored.ssConfigVersion : version + 1;
      if (next <= version) { stored.ssConfigVersion = CONFIG_VERSION; break; }
      version = next;
    }
    return stored;
  };

  /**
   * Normalize a stored config: migrate, fold legacy flat keys into nested
   * groups, apply profile preset overrides, and map legacy flags.
   * @param {Record<string, unknown>} stored - Raw stored config.
   * @returns {Record<string, unknown>} Normalized config.
   */
  globalThis.ssNormalizeConfig = function (stored) {
    if (!stored || typeof stored !== 'object') return {};
    const out = {};
    for (const k in stored) out[k] = stored[k];
    globalThis.ssMigrateConfig(out);

    // FEAT-2: apply profile preset overrides BEFORE the flat-key fold. A preset
    // key can itself be a legacy flat name (`webrtcMode`), and applying it after
    // the fold left it as an unknown top-level key that ssValidateConfig()
    // dropped on the next save. The fold below writes the user's stored flat
    // value over the preset, so an explicit choice still wins.
    const PROFILE_PRESETS = schema.presets || {};
    const profileName = out.profile;
    if (profileName && PROFILE_PRESETS[profileName] && profileName !== 'balanced') {
      const preset = PROFILE_PRESETS[profileName];
      for (const pk in preset) {
        if (!Object.prototype.hasOwnProperty.call(out, pk)) {
          out[pk] = preset[pk];
        }
      }
    }

    for (const flatKey in LEGACY_FLAT_TO_NESTED) {
      if (!Object.prototype.hasOwnProperty.call(stored, flatKey)) continue;
      const pair = LEGACY_FLAT_TO_NESTED[flatKey];
      const src = (out[pair[0]] && typeof out[pair[0]] === 'object' && !Array.isArray(out[pair[0]]))
        ? out[pair[0]] : (config[pair[0]] || {});
      const merged = {};
      for (const gk in src) merged[gk] = src[gk];
      merged[pair[1]] = stored[flatKey];
      out[pair[0]] = merged;
      // The legacy flat key has been folded into its nested group; remove it
      // so ssValidateConfig() never sees the flat name as an unknown top-level
      // key and wrongly drops it (and toasts "Dropped invalid keys" on save).
      delete out[flatKey];
    }

    // FEAT-1: backward-compat mapping from legacy surface flags to the
    // consistent enable*Protection convention. If the stored config has the
    // old flag and not the new one, copy the value to the new key so both
    // worlds (which check the new key) see the same state. This runs AFTER
    // the preset so a legacy override beats a preset default.
    const LEGACY_FLAG_MAP = {
      enableCanvasNoise: 'enableCanvasProtection',
      enableWebGLMasking: 'enableWebGlProtection',
      enableAudioNoise: 'enableAudioProtection',
    };
    for (const oldKey in LEGACY_FLAG_MAP) {
      if (Object.prototype.hasOwnProperty.call(out, oldKey) && !Object.prototype.hasOwnProperty.call(out, LEGACY_FLAG_MAP[oldKey])) {
        out[LEGACY_FLAG_MAP[oldKey]] = out[oldKey];
      }
    }
    return out;
  };

  // -------------------------------------------------------------------------
  // IMP-2: Config schema validation at load time.
  //
  // A stored ssConfig can contain unknown keys, wrong types, or out-of-range
  // numbers (hand-edited, synced from an older build, or corrupted). Hooks
  // silently ignore unknown keys, so the corruption is invisible until a
  // surface misbehaves. Validate after normalization and drop anything that
  // does not match the schema, recording dropped keys in ss_diagnostics so the
  // Diagnostics pane can surface it.
  // -------------------------------------------------------------------------
  const CONFIG_NUMERIC_BOUNDS = {
    canvasNoiseStrength: [0, 10],
    webglJitter: [0, 10],
    audioNoiseStrength: [0, 1],
    'geolocation.noiseLevel': [0, 1],
    kdfIterations: [1, 200000],
    rotationIntervalHours: [0.5, 8760],
    timingJitter: [0, 20],
    saltGuardIntervalMinutes: [1, 1440],
  };
  // Derived from the schema, not hand-copied. The literal lists this replaces
  // had already drifted: notifyOnRotation, reloadTabsOnRotation and
  // clearSiteDataOnRotation were missing from the boolean list, so
  // content/bootstrap.js silently dropped them from a per-origin override and
  // no gate noticed. Deriving keeps every future schema key in the whitelist.
  const isGroup = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const CONFIG_BOOLEAN_KEYS = Object.keys(defaults).filter((k) => typeof defaults[k] === 'boolean');
  const CONFIG_GROUP_KEYS = Object.keys(defaults).filter((k) => isGroup(defaults[k]));
  const CONFIG_STRING_ENUM_KEYS = { persona: ['auto', 'windows', 'mac', 'linux'] };

  /**
   * Validate a normalized config against the schema. Unknown keys, wrong
   * types, out-of-range numbers, and unknown string enums are dropped.
   * @param {Record<string, unknown>} cfg - Normalized config object.
   * @returns {{ valid: Record<string, unknown>, dropped: string[] }}
   */
  globalThis.ssValidateConfig = function (cfg) {
    if (!cfg || typeof cfg !== 'object') return { valid: {}, dropped: [] };
    const valid = {};
    const dropped = [];
    const knownKeys = new Set(Object.keys(defaults));
    knownKeys.add('ssConfigVersion');

    for (const key in cfg) {
      if (!knownKeys.has(key)) {
        dropped.push(key);
        continue;
      }
      const v = cfg[key];
      const def = defaults[key];

      // Numeric scalar: type + bounds.
      if (typeof def === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) { dropped.push(key); continue; }
        const bounds = CONFIG_NUMERIC_BOUNDS[key];
        if (bounds && (v < bounds[0] || v > bounds[1])) { dropped.push(key); continue; }
        valid[key] = v;
        continue;
      }

      // Boolean scalar.
      if (typeof def === 'boolean') {
        if (typeof v !== 'boolean') { dropped.push(key); continue; }
        valid[key] = v;
        continue;
      }

      // String enum (persona).
      if (typeof def === 'string') {
        const allowed = CONFIG_STRING_ENUM_KEYS[key];
        if (typeof v !== 'string' || (allowed && allowed.indexOf(v) === -1)) { dropped.push(key); continue; }
        valid[key] = v;
        continue;
      }

      // Nested group: validate each known sub-key.
      if (def && typeof def === 'object' && !Array.isArray(def)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const g = {};
          for (const gk in def) {
            const gv = v[gk];
            if (typeof gv === 'undefined') continue;
            const gDef = def[gk];
            if (typeof gDef === 'boolean') {
              if (typeof gv !== 'boolean') { dropped.push(key + '.' + gk); continue; }
              g[gk] = gv;
            } else if (typeof gDef === 'number') {
              if (typeof gv !== 'number' || !Number.isFinite(gv)) { dropped.push(key + '.' + gk); continue; }
              const gBounds = CONFIG_NUMERIC_BOUNDS[key + '.' + gk];
              if (gBounds && (gv < gBounds[0] || gv > gBounds[1])) { dropped.push(key + '.' + gk); continue; }
              g[gk] = gv;
            } else if (typeof gDef === 'string') {
              const gAllowed = CONFIG_STRING_ENUM_KEYS[key + '.' + gk];
              if (typeof gv !== 'string' || (gAllowed && gAllowed.indexOf(gv) === -1)) { dropped.push(key + '.' + gk); continue; }
              g[gk] = gv;
            } else {
              g[gk] = gv;
            }
          }
          valid[key] = g;
        } else {
          dropped.push(key);
        }
        continue;
      }

      // Fallback: keep the value as-is.
      valid[key] = v;
    }

    // Record dropped keys in diagnostics so the UI can show them.
    if (dropped.length > 0) {
      try {
        const diagKey = 'ss_diagnostics';
        // Best-effort: stash into session storage if chrome is available.
        // chrome.storage.session.get/set are callback-based (they return
        // undefined), so use the callback form like the rest of this file
        // (config.js:281-284, config.js:362) instead of .then()/.catch(),
        // which would throw TypeError and be swallowed here.
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
          chrome.storage.session.get([diagKey], function (r) {
            const d = (r && r[diagKey]) || {};
            d.invalidConfigKeys = dropped;
            d.invalidConfigAt = new Date().toISOString();
            chrome.storage.session.set({ [diagKey]: d }, function () {
              if (chrome.runtime && chrome.runtime.lastError) { /* ignore */ }
            });
          });
        }
      } catch (e) { /* diagnostics are best-effort */ }
    }

    return { valid, dropped };
  };

  globalThis.ssConfig = config;

  // Expose schema bounds/keys/defaults so the per-origin override merge in
  // content/bootstrap.js can clamp merged noise scalars against the same schema
  // that ssValidateConfig enforces at config load - a corrupt override must not
  // escape the clamp.
  globalThis.ssConfigNumericBounds = CONFIG_NUMERIC_BOUNDS;
  globalThis.ssConfigBooleanKeys = CONFIG_BOOLEAN_KEYS;
  globalThis.ssConfigGroupKeys = CONFIG_GROUP_KEYS;
  globalThis.ssConfigDefaults = defaults;

  /**
   * Load stored config from chrome.storage.local, merge with defaults.
   * @returns {Promise<Record<string, unknown>>} Resolved merged config.
   */
  globalThis.ssLoadConfig = async function () {
    const defaultConfig = {};
    for (const k in config) defaultConfig[k] = config[k];
    try {
      const hasStorage = typeof chrome !== "undefined" && !!chrome.storage && !!chrome.storage.local;
      if (!hasStorage) return defaultConfig;
      const result = await new Promise((resolve, reject) => {
        chrome.storage.local.get(['ssConfig'], (r) => {
          if (chrome.runtime && chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(r);
        });
      });
      const stored = globalThis.ssNormalizeConfig(result.ssConfig || {});
      const validated = globalThis.ssValidateConfig(stored);
      const merged = {};
      for (const k in defaultConfig) merged[k] = defaultConfig[k];
      for (const key in validated.valid) {
        const v = validated.valid[key];
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const base = (defaultConfig[key] && typeof defaultConfig[key] === 'object') ? defaultConfig[key] : {};
          const g = {};
          for (const gk in base) g[gk] = base[gk];
          for (const gk in v) g[gk] = v[gk];
          merged[key] = g;
        } else {
          merged[key] = v;
        }
      }
      globalThis.ssConfig = merged;
      // Report dropped keys AFTER `merged` exists: reading it here used to hit
      // the temporal dead zone, throw, and hand back bare defaults - so one
      // unknown key reset every stored setting on every page load.
      if (validated.dropped.length > 0 && merged.debug) {
        console.log('[shapeshift][config] Dropped invalid keys:', validated.dropped);
      }
      if (merged.debug) console.log('[shapeshift][config] Loaded config:', merged);
      return merged;
    } catch (e) {
      if (config.debug) console.error('[shapeshift][config] Failed to load stored config:', e);
      return defaultConfig;
    }
  };

  // P2: changing a setting in Options used to leave every already-open tab on
  // the stale config until a manual reload, because only the salt had a
  // storage.onChanged listener. Rebuild the live config whenever ssConfig
  // changes so the next read on an open page sees the new values.
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.ssConfig) return;
      // P2 7.1 (seed epoch): the epoch is the single observer of "the
      // derivation inputs moved". It was defined in core/hash.js but never
      // bumped anywhere, so a hook that recorded the epoch it derived under
      // would have waited forever. A config edit changes which surfaces are on
      // and with what magnitude, so it must advance the epoch before the new
      // config is published.
      if (typeof globalThis.ssBumpSeedEpoch === 'function') globalThis.ssBumpSeedEpoch();
      globalThis.ssLoadConfig().catch(() => {});
      // Feature 5.2: mirror the new config into chrome.storage.sync so another
      // signed-in browser picks the same settings up. Only the config travels;
      // ss_salt never leaves chrome.storage.local, so syncing a profile cannot
      // clone this machine's identity. Best-effort: sync may be unavailable or
      // disabled, and that must never break the local load path.
      try {
        if (chrome.storage.sync && changes.ssConfig.newValue) {
          chrome.storage.sync.set({ ssConfig: changes.ssConfig.newValue }, function () {
            if (chrome.runtime && chrome.runtime.lastError) { /* sync unavailable */ }
          });
        }
      } catch (e) { /* sync unavailable */ }
    });
  }

  // Feature 5.2: a fresh machine that signs into the same profile has no local
  // ssConfig yet but may have one in sync. Adopt it once, and only when local
  // is absent, so an offline edit on this machine is never overwritten.
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    try {
      chrome.storage.sync.get(['ssConfig'], function (synced) {
        if (!synced || !synced.ssConfig) return;
        chrome.storage.local.get(['ssConfig'], function (local) {
          if (local && local.ssConfig) return;
          // P1: the adopted object used to be written verbatim. A config that
          // came from an older build (or a hand-edited sync store) then kept its
          // old schema version and flat legacy keys, so the very next
          // ssLoadConfig() call had to repair it - and any hook that read the
          // raw store in between saw un-normalized values. Run it through the
          // same normalize+migrate path the local read uses, and stamp the
          // current schema version before it is persisted.
          const adopted = globalThis.ssNormalizeConfig(synced.ssConfig);
          adopted.ssConfigVersion = CONFIG_VERSION;
          chrome.storage.local.set({ ssConfig: adopted }, function () {
            if (chrome.runtime && chrome.runtime.lastError) { /* ignore */ }
          });
        });
      });
    } catch (e) { /* sync unavailable */ }
  }
})();
