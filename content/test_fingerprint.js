// Fingerprint sampler utilities for debugging/testing.
(function () {
  const hash = globalThis.ssHashString || (s => s.length);
  const debug = (globalThis.ssConfig && globalThis.ssConfig.debug) || false;
  const dlog = debug ? console.log : () => { };

  function safe (fn, fallback) {
    try {
      return fn();
    } catch (e) {
      return fallback;
    }
  }

  function toHex (num) {
    return (num >>> 0).toString(16);
  }

  function sampleCanvas () {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "noctx";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = "#069";
    ctx.fillRect(2, 2, 29, 29);
    ctx.fillStyle = "#fff";
    ctx.fillText("ss", 4, 16);
    return canvas.toDataURL();
  }

  function sampleAudio () {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return "no-audio";
    const ctx = new AC();
    const buffer = ctx.createBuffer(1, 16, 44100);
    const channel = buffer.getChannelData(0);
    const sample = Array.from(channel.slice(0, 5));
    if (typeof ctx.close === "function") ctx.close();
    return sample;
  }

  function sampleNavigator () {
    const nav = window.navigator || {};
    return {
      hardwareConcurrency: nav.hardwareConcurrency,
      deviceMemory: nav.deviceMemory,
      languages: Array.isArray(nav.languages) ? nav.languages.slice() : nav.languages,
      platform: nav.platform,
      userAgent: nav.userAgent,
      maxTouchPoints: nav.maxTouchPoints
    };
  }

  // P0 1.3: the old path injected <script src="chrome-extension://..."> into
  // the page DOM so a MAIN-world helper could sample WebGL. That was observable
  // by any page script (MutationObserver, resource timing entries, message
  // listeners) and it ran on every load. MAIN world now owns the WebGL hooks,
  // and manifest.json exposes no web_accessible_resources, so the injection is
  // gone: a dangling chrome.runtime.getURL() would only produce a failed
  // request plus a 1s timeout. Sample from the ISOLATED copy instead.
  function sampleWebGL () {
    const canvas = document.createElement("canvas");
    const gl = safe(
      () => canvas.getContext("webgl") || canvas.getContext("experimental-webgl"),
      null
    );
    if (!gl) return "no-webgl";
    const dbg = safe(() => gl.getExtension("WEBGL_debug_renderer_info"), null);
    return {
      vendor: safe(() => gl.getParameter(gl.VENDOR), null),
      renderer: safe(() => gl.getParameter(gl.RENDERER), null),
      unmaskedVendor: dbg ? safe(() => gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL), null) : null,
      unmaskedRenderer: dbg ? safe(() => gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL), null) : null
    };
  }

  function sampleScreen () {
    const s = window.screen || {};
    return {
      width: s.width, height: s.height, availWidth: s.availWidth, availHeight: s.availHeight,
      colorDepth: s.colorDepth, pixelDepth: s.pixelDepth
    };
  }

  function sampleTimezone () {
    const ro = (typeof Intl !== 'undefined' && Intl.DateTimeFormat)
      ? Intl.DateTimeFormat().resolvedOptions() : {};
    return { timeZone: ro.timeZone, locale: ro.locale };
  }

  function sampleFonts () {
    const fonts = (document && document.fonts) ? document.fonts : null;
    if (!fonts) return "no-fonts";
    return {
      size: (typeof fonts.size === 'number') ? fonts.size : null,
      checkArial: safe(() => fonts.check('16px Arial'), null)
    };
  }

  function sampleWebRTC () {
    return {
      hasRTCPeerConnection: typeof RTCPeerConnection !== 'undefined' || typeof webkitRTCPeerConnection !== 'undefined',
      hasGetUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    };
  }

  function sampleSensors () {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return {
      onLine: navigator.onLine,
      effectiveType: conn ? conn.effectiveType : null,
      deviceMemory: navigator.deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency
    };
  }

  function sampleTouch () {
    return {
      maxTouchPoints: navigator.maxTouchPoints,
      ontouchstart: typeof ontouchstart !== 'undefined'
    };
  }

  function sampleUserAgent () {
    return {
      userAgent: navigator.userAgent,
      appVersion: navigator.appVersion,
      platform: navigator.platform,
      languages: Array.isArray(navigator.languages) ? navigator.languages.slice() : navigator.languages
    };
  }

  function sampleMedia () {
    return {
      hasMediaSource: typeof MediaSource !== 'undefined',
      mp4: (typeof MediaSource !== 'undefined') ? safe(() => MediaSource.isTypeSupported('video/mp4'), null) : null,
      webm: (typeof MediaSource !== 'undefined') ? safe(() => MediaSource.isTypeSupported('video/webm'), null) : null
    };
  }

  function sampleGeolocation () {
    return { hasGeolocation: !!(navigator.geolocation) };
  }

  function sampleDetection () {
    return {
      hidden: document.hidden,
      visibilityState: document.visibilityState,
      hasStorageEstimate: !!(navigator.storage && navigator.storage.estimate)
    };
  }

  function sampleWebGPU () {
    return { hasGPU: !!(navigator.gpu) };
  }

  function sampleKeyboard () {
    return { hasKeyboard: !!(navigator.keyboard) };
  }

  function sampleViewport () {
    const vv = window.visualViewport;
    if (!vv) return "no-viewport";
    return { width: vv.width, height: vv.height, scale: vv.scale };
  }

  // Feature 7.3: a surface is only really covered when the sampler reached it.
  // Hashing the literal string "no-webgl"/"no-audio" produced a perfectly plausible
  // digest, so the self-test reported success on a tab where nothing had been shaped.
  // Name the reason instead of burying it in a hash.
  const UNAVAILABLE = {
    'noctx': 'Canvas 2D context is not available in this tab',
    'canvas-error': 'The canvas sampler threw',
    'no-webgl': 'WebGL is not available in this tab',
    'webgl-error': 'The WebGL sampler threw',
    'no-audio': 'Web Audio is not available in this tab',
    'audio-error': 'The audio sampler threw',
    'nav-error': 'The navigator sampler threw',
    'no-fonts': 'FontFaceSet is not available in this tab',
    'fonts-error': 'The fonts sampler threw',
    'no-viewport': 'visualViewport is not available in this tab',
    'viewport-error': 'The viewport sampler threw'
  };

  // Structured form used by the Options self-test: the composite digest plus the
  // per-surface digests and the list of surfaces the sampler could not reach.
  async function testFingerprintReport () {
    const canvas = safe(sampleCanvas, "canvas-error");
    const webgl = safe(sampleWebGL, "webgl-error");
    const audio = safe(sampleAudio, "audio-error");
    const nav = safe(sampleNavigator, "nav-error");
    const screen = safe(sampleScreen, "screen-error");
    const timezone = safe(sampleTimezone, "timezone-error");
    const fonts = safe(sampleFonts, "fonts-error");
    const webrtc = safe(sampleWebRTC, "webrtc-error");
    const sensors = safe(sampleSensors, "sensors-error");
    const touch = safe(sampleTouch, "touch-error");
    const useragent = safe(sampleUserAgent, "useragent-error");
    const media = safe(sampleMedia, "media-error");
    const geolocation = safe(sampleGeolocation, "geolocation-error");
    const detection = safe(sampleDetection, "detection-error");
    const webgpu = safe(sampleWebGPU, "webgpu-error");
    const keyboard = safe(sampleKeyboard, "keyboard-error");
    const viewport = safe(sampleViewport, "viewport-error");

    dlog("[shapeshift][test] samples", { webgl, canvas: typeof canvas === "string" ? canvas.slice(0, 32) + "..." : canvas, audio: audio, nav });

    const parts = {
      canvas: toHex(hash(String(canvas))),
      webgl: toHex(hash(JSON.stringify(webgl))),
      audio: toHex(hash(JSON.stringify(audio))),
      navigator: toHex(hash(JSON.stringify(nav))),
      screen: toHex(hash(JSON.stringify(screen))),
      timezone: toHex(hash(JSON.stringify(timezone))),
      fonts: toHex(hash(JSON.stringify(fonts))),
      webrtc: toHex(hash(JSON.stringify(webrtc))),
      sensors: toHex(hash(JSON.stringify(sensors))),
      touch: toHex(hash(JSON.stringify(touch))),
      useragent: toHex(hash(JSON.stringify(useragent))),
      media: toHex(hash(JSON.stringify(media))),
      geolocation: toHex(hash(JSON.stringify(geolocation))),
      detection: toHex(hash(JSON.stringify(detection))),
      webgpu: toHex(hash(JSON.stringify(webgpu))),
      keyboard: toHex(hash(JSON.stringify(keyboard))),
      viewport: toHex(hash(JSON.stringify(viewport)))
    };

    const warnings = [];
    [canvas, webgl, audio, nav, screen, timezone, fonts, webrtc, sensors, touch, useragent, media, geolocation, detection, webgpu, keyboard, viewport].forEach(function (sample) {
      if (typeof sample === 'string' && UNAVAILABLE[sample]) warnings.push(UNAVAILABLE[sample]);
    });

    return {
      composite: `C${parts.canvas}W${parts.webgl}A${parts.audio}N${parts.navigator}S${parts.screen}T${parts.timezone}F${parts.fonts}R${parts.webrtc}E${parts.sensors}H${parts.touch}U${parts.useragent}M${parts.media}G${parts.geolocation}D${parts.detection}P${parts.webgpu}K${parts.keyboard}V${parts.viewport}`,
      parts: parts,
      warnings: warnings
    };
  }

  async function testFingerprint () {
    const report = await testFingerprintReport();
    return report.composite;
  }

  globalThis.ssTestFingerprint = testFingerprint;
  globalThis.ssTestFingerprintReport = testFingerprintReport;
})();
