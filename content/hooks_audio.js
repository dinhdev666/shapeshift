// Audio fingerprint mutation: add deterministic noise to channel data.
(function () {
  const installers = (globalThis.ssHookInstallers = globalThis.ssHookInstallers || []);

  installers.push(function installAudioHooks (env) {
    // FEAT-1: check the consistent enable*Protection flag first, fall back to
    // the legacy enableAudioNoise flag for backward compatibility.
    if (!env || !(env.config?.enableAudioProtection ?? env.config?.enableAudioNoise)) return;
    const { noise, config } = env;
    const strength = config.audioNoiseStrength ?? 1e-7;
    const seed = (env.seed >>> 0) || 0;

    // Same determinism contract as canvas: repeated getChannelData() on one
    // AudioBuffer must return the same samples, otherwise reading twice is
    // itself the detection signal.
    //
    // P1 (hot loop): this built a fresh string and re-hashed the whole
    // "seed:audio:ch:channel:" prefix for every sample - a 16k-sample buffer meant 16k
    // concatenations and ~16k * 20 character folds per read. FNV-1a is a pure
    // sequential fold, so the state after the constant prefix is computed once
    // per channel and only the index digits are folded per sample. The key is
    // the MAIN-world key (seed:audio:ch:<ch>:), so the ISOLATED copy and the
    // page-visible MAIN copy produce identical samples for one identity.
    const prefixCache = Object.create(null);
    function channelPrefix (channel) {
      let st = prefixCache[channel];
      if (st === undefined) {
        const init = globalThis.ssFnvInit;
        const upd = globalThis.ssFnvUpdate;
        st = (init && upd) ? upd(init(), seed + ':audio:ch:' + channel + ':') : null;
        prefixCache[channel] = st;
      }
      return st;
    }

    function sampleNoise (channel, index) {
      const upd = globalThis.ssFnvUpdate;
      const prefix = upd ? channelPrefix(channel) : null;
      if (prefix === null) {
        const hash = globalThis.ssHashString;
        if (!hash) return noise(strength);
        return (((hash(seed + ':audio:ch:' + channel + ':' + index)) / 4294967296) - 0.5) * strength;
      }
      // P0: the channel argument was ignored, so getChannelData(0) and
      // getChannelData(1) shared one noise stream. Key on (seed, channel,
      // index) so each channel stays deterministic and distinct, matching
      // the MAIN world formula (seed:audio:ch:<ch>:<i>).
      const h = upd(prefix, index);
      return ((h / 4294967296) - 0.5) * strength;
    }

    // Report an audio-hook installation failure so it is visible instead of
    // silent. Diagnostics go to the console when debug is on.
    function reportAudioError (e) {
      if (globalThis.ssConfig && globalThis.ssConfig.debug) {
        try { console.error('[shapeshift][audio] failed to patch getChannelData:', e && e.message ? e.message : String(e)); } catch (_) { }
      }
    }

    function installAudioPatch () {
      const AudioBufferProto = window.AudioBuffer && window.AudioBuffer.prototype;
      if (!AudioBufferProto || !AudioBufferProto.getChannelData) return;

      // Guard against a second wrap (double-patch).
      if (globalThis.ssStealth && globalThis.ssStealth.isPatched(AudioBufferProto)) return;
      if (globalThis.ssStealth) globalThis.ssStealth.markPatched(AudioBufferProto);

      const origGetChannelData = AudioBufferProto.getChannelData;
      AudioBufferProto.getChannelData = function () {
        // Track statistics
        if (globalThis.ssStatsTracker) {
          globalThis.ssStatsTracker.increment('audioCalls');
        }

        // Add timing resistance
        if (globalThis.ssTimingUtils) {
          globalThis.ssTimingUtils.randomDelaySync();
          globalThis.ssTimingUtils.executionJitter();
        }

        const channel = arguments[0] || 0;
        const data = origGetChannelData.apply(this, arguments);
        const copy = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) {
          copy[i] = data[i] + sampleNoise(channel, i);
        }

        // Add exit jitter
        if (globalThis.ssTimingUtils) {
          globalThis.ssTimingUtils.executionJitter();
        }

        return copy;
      };
    }

    try {
      installAudioPatch();
    } catch (e) {
      reportAudioError(e);
    }
  });
})();
