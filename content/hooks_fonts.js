// Font fingerprinting protection.
// Protects against font enumeration and canvas font measurement techniques.
(function () {
  const installers = (globalThis.ssHookInstallers = globalThis.ssHookInstallers || []);

  installers.push(function installFontHooks (env) {
    if (!env || !env.config?.enableFontProtection) return;
    const { config } = env;
    const debug = config.debug ? true : false;
    const log = debug ? console.log : () => {};

    function safeWrap (fn) {
      try {
        fn();
      } catch (e) {
        if (debug) console.error('[shapeshift][fonts] Hook failed:', e);
      }
    }

    // Hook canvas text measurement (used for font fingerprinting)
    safeWrap(() => {
      const CanvasProto = CanvasRenderingContext2D.prototype;
      if (!CanvasProto.measureText) return;

      const origMeasureText = CanvasProto.measureText;
      if (globalThis.ssStealth && !globalThis.ssStealth.isPatched(origMeasureText)) {
        globalThis.ssStealth.markPatched(origMeasureText);

        CanvasProto.measureText = function (text) {
          // Track statistics
          if (globalThis.ssStatsTracker) {
            globalThis.ssStatsTracker.increment('fontReads');
          }

          if (globalThis.ssTimingUtils) {
            globalThis.ssTimingUtils.randomDelaySync();
            globalThis.ssTimingUtils.executionJitter();
          }

          // Return the native TextMetrics exactly as the browser computed it.
          // Adding noise made measureText() values disagree with a real device
          // and could break text layout on sites that depend on precise metrics.
          return origMeasureText.call(this, text);
        };

        log('[shapeshift][fonts] measureText hooked');
      }
    });

    // Hook FontFaceSet.check() to prevent font enumeration
    safeWrap(() => {
      if (!document.fonts || !document.fonts.check) return;

      const origCheck = document.fonts.check;
      if (globalThis.ssStealth && !globalThis.ssStealth.isPatched(origCheck)) {
        globalThis.ssStealth.markPatched(origCheck);

        document.fonts.check = function (font, text) {
          if (globalThis.ssTimingUtils) {
            globalThis.ssTimingUtils.randomDelaySync();
            globalThis.ssTimingUtils.executionJitter();
          }

          // Return the real availability result, but upgrade absence to
          // presence: a site that detects a missing font may skip loading it
          // (causing font-rendering failures), so we claim every queried font
          // is available. We never flip `true` → `false`, so a real installed
          // font is never hidden.
          let result = origCheck.call(this, font, text);
          if (result === false && globalThis.ssHashString) {
            result = true;
          }
          return result;
        };

        log('[shapeshift][fonts] FontFaceSet.check hooked');
      }
    });

    // Hook document.fonts iteration
    safeWrap(() => {
      if (!document.fonts) return;

      // P1: this hook site had no ssStealth guard at all, so a second install
      // (or a second content-script run) re-wrapped Symbol.iterator and the
      // page could see the wrap count change. Guard on the FontFaceSet object
      // itself, since the patched property is a well-known Symbol.
      if (globalThis.ssStealth && globalThis.ssStealth.isPatched(document.fonts)) return;
      if (globalThis.ssStealth) globalThis.ssStealth.markPatched(document.fonts);

      // P1: patch the PROTOTYPE, not the `document.fonts` instance. An own
      // Symbol.iterator on the instance is a property a real page never sees
      // (Chrome's FontFaceSet carries the iterator on its prototype).
      const FontFaceSetProto = Object.getPrototypeOf(document.fonts);
      const origIterator = FontFaceSetProto && FontFaceSetProto[Symbol.iterator];

      // Override the prototype iterator
      try {
        if (origIterator) {
          Object.defineProperty(FontFaceSetProto, Symbol.iterator, {
            value: function () {
              // Return fonts in the browser's natural system order. Shuffling
              // the order made the font list disagree with a real device and is
              // itself a fingerprinting signal. Repeat iterations agree because
              // we read the live set through the original iterator every time.
              return origIterator.call(document.fonts);
            },
            writable: true,
            enumerable: false,
            configurable: true
          });
          log('[shapeshift][fonts] Font iterator passed through (system order)');
        }
      } catch (e) {
        // May fail in some browsers
      }
    });
  });
})();
