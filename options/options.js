// ShapeShift - options controller (control room).

// Architecture §4: the defaults have exactly one definition, in
// core/config-schema.js. options.html loads that file before this controller,
// so the Options page and the hooks can no longer disagree about a default.
// ssFlatDefaults expands the nested groups into the flat keys rendered here.
const DEFAULTS = globalThis.ssFlatDefaults || {};

const GROUPS = {
  groupSurfaces: [
    { key: 'enableCanvasNoise', name: 'Canvas noise', desc: 'Perturb rendered pixels so canvas hashes differ per origin.' },
    { key: 'enableCanvasProtection', name: 'Canvas protection', desc: 'Master toggle for canvas fingerprint spoofing.' },
    { key: 'canvasNoiseStrength', name: 'Canvas strength', desc: 'Pixel delta applied to canvas reads.', range: [0, 10, 0.1] },
    { key: 'enableWebGLMasking', name: 'WebGL masking', desc: 'Alter GPU parameters, vendor and renderer strings.' },
    { key: 'enableWebGlProtection', name: 'WebGL protection', desc: 'Master toggle for WebGL fingerprint spoofing.' },
    { key: 'webglJitter', name: 'WebGL jitter', desc: 'Amount of jitter applied to WebGL parameters.', range: [0, 10, 0.1] },
    { key: 'maskWebGLVendorStrings', name: 'Mask vendor strings', desc: 'Replace GPU vendor and renderer with plausible values.' },
    { key: 'shuffleWebGLExtensions', name: 'Shuffle extensions', desc: 'Randomise extension enumeration order.' },
    { key: 'enableWebGPUProtection', name: 'WebGPU masking', desc: 'Report the same GPU persona through navigator.gpu.' },
    { key: 'enableKeyboardProtection', name: 'Keyboard layout', desc: 'Report a keyboard layout that matches the user-agent persona.' },
    { key: 'enableVisualViewportProtection', name: 'VisualViewport protection', desc: 'Re-assert visualViewport accessors with real values preserved.' },
    { key: 'enableAudioProtection', name: 'Audio protection', desc: 'Master toggle for audio fingerprint spoofing.' },
    { key: 'enableAudioNoise', name: 'Audio noise', desc: 'Subtle offsets in AudioContext sample data.' },
    { key: 'audioNoiseStrength', name: 'Audio strength', desc: 'Magnitude of audio sample perturbation.', number: true },
    { key: 'enableFontProtection', name: 'Font protection', desc: 'Blunt font enumeration and measurement.' }
  ],
  groupNetwork: [
    { key: 'enableWebRTCProtection', name: 'WebRTC protection', desc: 'Stop local IP addresses leaking through ICE candidates.' },
    // P2 7.2: the three WebRTC switches collapsed into one explicit policy.
    // `relay-only` may break peer-to-peer calls, which is why it is not the
    // default; `block-host-srflx` removes the address-bearing candidates while
    // leaving a real call able to negotiate.
    { key: 'webrtcMode', name: 'WebRTC policy', desc: 'How much of the session description ShapeShift rewrites.', enum: true, select: [['block-host-srflx', 'Block host and srflx candidates'], ['relay-only', 'Relay only (strictest)'], ['off', 'Off (leave the SDP untouched)']] },
    { key: 'enableMediaDeviceProtection', name: 'Media device protection', desc: 'Hide the real device inventory.' },
    { key: 'randomizeDeviceIds', name: 'Randomise device IDs', desc: 'Stable fake identifiers per origin.' },
    { key: 'spoofDeviceLabels', name: 'Spoof labels', desc: 'Generic labels instead of real hardware names.' },
    { key: 'enableGeolocationProtection', name: 'Geolocation fuzzing', desc: 'Small coordinate offsets on position reads.' },
    { key: 'noiseLevel', name: 'Geolocation offset', desc: 'Maximum coordinate offset in degrees.', range: [0, 1, 0.001] },
    { key: 'enableSensorProtection', name: 'Sensor protection', desc: 'Battery, performance timing and device sensors.' },
    { key: 'hideGamepads', name: 'Hide gamepads', desc: 'Return no connected gamepads.' }
  ],
  groupIdentity: [
    { key: 'perOriginFingerprint', name: 'Per-origin fingerprints', desc: 'Derive an independent seed for every site.' },
    // FEAT-2: profile presets adjust multiple surface knobs at once. 'balanced'
    // is the default; 'light' reduces noise/strength for performance, and
    // 'maximum' raises them for stronger spoofing. Selecting a preset fills in
    // only the keys it overrides — explicit user edits still win.
    { key: 'profile', name: 'Protection profile', desc: 'Preset that adjusts noise levels and surface coverage.', enum: true, select: [['balanced', 'Balanced (default)'], ['light', 'Light (lower performance impact)'], ['maximum', 'Maximum (strongest spoofing)']] },
    // P2 7.4 (persona profile): 'auto' keeps the seed-derived OS family, the
    // three explicit values pin it so the UA platform, the WebGL renderer, the
    // WebGPU adapter and the keyboard layout all describe one real machine.
    { key: 'persona', name: 'Persona profile', desc: 'Which OS family every spoofed surface should describe.', enum: true, select: [['auto', 'Automatic (derived from seed)'], ['windows', 'Windows'], ['mac', 'macOS'], ['linux', 'Linux']] },
    { key: 'useGaussianNoise', name: 'Gaussian noise', desc: 'Natural distribution instead of uniform noise.' },
    { key: 'enableNavigatorFuzz', name: 'Navigator fuzzing', desc: 'Vary CPU, memory and language signals.' },
    { key: 'fuzzHardwareConcurrency', name: 'Fuzz CPU cores', desc: 'Report a plausible core count.' },
    { key: 'fuzzDeviceMemory', name: 'Fuzz device memory', desc: 'Report a plausible memory tier.' },
    { key: 'shuffleLanguages', name: 'Shuffle languages', desc: 'Reorder the navigator language list.' },
    { key: 'enableScreenProtection', name: 'Screen protection', desc: 'Reshape resolution and pixel ratio.' },
    { key: 'useRealDistribution', name: 'Realistic resolutions', desc: 'Sample from real-world screen sizes.' },
    { key: 'enableTimezoneProtection', name: 'Timezone protection', desc: 'Offset the reported timezone.' },
    { key: 'autoRotateFingerprint', name: 'Auto rotation', desc: 'Regenerate the identity on a schedule.' },
    { key: 'rotationIntervalHours', name: 'Rotation interval', desc: 'Hours between automatic rotations.', select: [[0.5, '30 minutes'], [1, '1 hour'], [6, '6 hours'], [12, '12 hours'], [24, '24 hours'], [72, '3 days'], [168, '7 days']] },
    { key: 'rotateOnStartup', name: 'Rotate on startup', desc: 'New identity every browser launch.' }
  ],
  groupCrypto: [
    { key: 'useStrongKDF', name: 'Strong key derivation', desc: 'Iterated hashing when deriving per-origin seeds.' },
    { key: 'kdfIterations', name: 'KDF iterations', desc: 'Higher is slower and harder to brute force.', range: [1, 200000, 100] },
    { key: 'enableTouchProtection', name: 'Touch protection', desc: 'Normalise touch capability signals.' },
    { key: 'enableUserAgentProtection', name: 'User agent protection', desc: 'Reduce user-agent entropy.' },
    { key: 'enableMediaProtection', name: 'Media codec protection', desc: 'Blunt codec and DRM capability probing.' },
    { key: 'enableDetectionResistance', name: 'Detection resistance', desc: 'Blunt extension and automation detection.' },
    { key: 'timingJitter', name: 'Timing jitter', desc: 'Milliseconds of jitter added to hooked reads (0 disables).', range: [0, 20, 0.5] }
  ],
  groupDebug: [
    { key: 'notifyOnRotation', name: 'Notify on rotation', desc: 'Show a system notification when the identity rotates.' },
    { key: 'reloadTabsOnRotation', name: 'Reload tabs on rotation', desc: 'Refresh the focused tab of each window so it picks up the new identity. Off by default: reloading every tab on every rotation looks like a device change to every site at once.' },
    { key: 'clearSiteDataOnRotation', name: 'Clear site data on rotation', desc: 'Also erase cookies and site storage for the pages you visit, so the new identity gets a fresh session. This logs you out of those sites.' },
    // IMP-1: both keys were read by background/service-worker.js but had no
    // control anywhere, so the bfcache guard cadence and the rotation reload
    // scope could only be changed by hand-editing storage.
    { key: 'rotationReloadScope', name: 'Rotation reload scope', desc: 'Which tabs are refreshed when the identity rotates.', enum: true, select: [['active', 'Focused tab of each window'], ['all', 'Every open tab']] },
    { key: 'saltGuardIntervalMinutes', name: 'Salt guard check', desc: 'How often to look for tabs left on an old identity, in minutes.', range: [1, 1440, 1] },
    { key: 'debug', name: 'Debug logging', desc: 'Verbose console output for troubleshooting.' }
  ]
};

const TITLES = { overview: ['Overview', 'Control how ShapeShift reshapes your fingerprint.'], surfaces: ['Surfaces', 'Rendering-level signals: canvas, WebGL, audio and fonts.'], network: ['Network & media', 'Connections, capture devices and low-level sensors.'], identity: ['Identity', 'How seeds are derived, fuzzed and rotated.'], sites: ['Sites', 'Origins where protection is paused.'], advanced: ['Advanced', 'Cryptography, extra surfaces and diagnostics.'], about: ['About', 'Version, data handling and licence.'] };

function $(id) { return document.getElementById(id); }

function get(keys) { return new Promise(function (r) { try { chrome.storage.local.get(keys, function (x) { r(x || {}); }); } catch (e) { r({}); } }); }
function set(items) { return new Promise(function (r) { try { chrome.storage.local.set(items, function () { r(true); }); } catch (e) { r(false); } }); }
function remove(keys) { return new Promise(function (r) { try { chrome.storage.local.remove(keys, function () { r(true); }); } catch (e) { r(false); } }); }

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove('show'); }, 4000);
}

function isControl(item) { return !!(item.range || item.select || item.number); }

function makeRow(item) {
  const row = document.createElement('div');
  row.className = 'row';
  const text = document.createElement('div');
  text.className = 'row-text';
  const strong = document.createElement('strong');
  strong.textContent = item.name;
  const span = document.createElement('span');
  span.textContent = item.desc;
  text.appendChild(strong);
  text.appendChild(span);
  row.appendChild(text);
  return row;
}

function switchRow(item, config) {
  const row = makeRow(item);
  const label = document.createElement('label');
  label.className = 'switch';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.dataset.key = item.key;
  input.setAttribute('aria-label', item.name);
  // P1: an absent key used to render as ON (`!== false`), so every
  // default-false switch (debug, forceRelay, autoRotateFingerprint,
  // rotateOnStartup) appeared enabled on a fresh install even though the
  // hooks read the schema default and left it off. Fall back to the same
  // schema default the hooks use, so the panel and the runtime agree.
  const storedSwitch = config[item.key];
  input.checked = storedSwitch !== undefined
    ? storedSwitch !== false
    : DEFAULTS[item.key] !== false;
  const track = document.createElement('span');
  track.className = 'switch-track';
  const thumb = document.createElement('span');
  thumb.className = 'switch-thumb';
  track.appendChild(thumb);
  label.appendChild(input);
  label.appendChild(track);
  row.appendChild(label);
  return row;
}

function controlRow(item, config) {
  const row = makeRow(item);
  const control = document.createElement('div');
  control.className = 'row-control';
  const value = config[item.key] !== undefined ? config[item.key] : DEFAULTS[item.key];

  if (item.range) {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = item.range[0];
    input.max = item.range[1];
    input.step = item.range[2];
    input.value = value;
    input.dataset.key = item.key;
    input.dataset.kind = 'number';
    input.setAttribute('aria-label', item.name);
    const formatValue = function (v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return String(v);
      const step = Number(item.range[2]);
      if (step >= 1) return String(Math.round(n));
      const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
      return n.toFixed(decimals);
    };
    const chip = document.createElement('span');
    chip.className = 'value-chip';
    chip.textContent = formatValue(value);
    input.addEventListener('input', function () { chip.textContent = formatValue(input.value); });
    control.appendChild(input);
    control.appendChild(chip);
  } else if (item.select) {
    const select = document.createElement('select');
    select.dataset.key = item.key;
    // P2 7.2: a select may be numeric (rotation interval) or a string enum
    // (WebRTC policy). Tagging every select as 'number' made collect() run a
    // string value through clampNumber, so the enum was written back as NaN.
    select.dataset.kind = item.enum ? 'enum' : 'number';
    item.select.forEach(function (pair) {
      const opt = document.createElement('option');
      opt.value = pair[0];
      opt.textContent = pair[1];
      if (String(pair[0]) === String(value)) opt.selected = true;
      select.appendChild(opt);
    });
    control.appendChild(select);
  } else {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = value;
    input.dataset.key = item.key;
    input.dataset.kind = 'number';
    control.appendChild(input);
  }

  row.appendChild(control);
  return row;
}

function renderGroups(config) {
  Object.keys(GROUPS).forEach(function (groupId) {
    const host = $(groupId);
    if (!host) return;
    host.textContent = '';
    GROUPS[groupId].forEach(function (item) {
      host.appendChild(isControl(item) ? controlRow(item, config) : switchRow(item, config));
    });
  });
}

// Bounds for the free-form numeric inputs are the shared engine bounds exposed
// as globalThis.ssConfigNumericBounds by core/config.js (single source of truth,
// Architecture §4). A negative or absurd value used to be written straight into
// ssConfig, where it reached the hooks as NaN/garbage (e.g. a negative
// kdfIterations made seed derivation degrade to one pass).
function clampNumber(key, raw) {
  const bounds = (globalThis.ssConfigNumericBounds || {})[key];
  let value = Number(raw);
  if (!isFinite(value)) {
    value = Number(DEFAULTS[key]);
    if (!isFinite(value)) value = 0;
  }
  if (bounds) value = Math.min(bounds[1], Math.max(bounds[0], value));
  return value;
}

function collect() {
  const config = {};
  const nodes = document.querySelectorAll('[data-key]');
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (el.dataset.kind === 'enum') {
      // P1-4: validate the selected value against the rendered <option> list so
      // a stale DOM (options removed but value lingering) cannot write an
      // invalid enum into ssConfig, where hooks would receive NaN/garbage.
      const select = el;
      let valid = false;
      for (let j = 0; j < select.options.length; j++) {
        if (select.options[j].value === select.value) { valid = true; break; }
      }
      config[el.dataset.key] = valid ? select.value :
        (DEFAULTS && DEFAULTS[el.dataset.key] !== undefined ? DEFAULTS[el.dataset.key] : select.value);
    } else {
      config[el.dataset.key] = el.dataset.kind === 'number' ? clampNumber(el.dataset.key, el.value) : el.checked;
    }
  }
  return config;
}

// The canonical set of protection surfaces, shared with popup.js `MODULES`.
// The score used to be computed over every switch in GROUPS (33 of them here)
// while the popup scored the 10 primary surfaces, so the same configuration
// displayed two different numbers. Both UIs now report the same percentage.
const MODULE_KEYS = [
  'enableCanvasNoise',
  'enableWebGLMasking',
  'enableWebGPUProtection',
  'enableKeyboardProtection',
  'enableVisualViewportProtection',
  'enableAudioNoise',
  'enableWebRTCProtection',
  'enableScreenProtection',
  'enableFontProtection',
  'enableTimezoneProtection',
  'enableSensorProtection',
  'enableNavigatorFuzz',
  'enableGeolocationProtection'
];

function switchKeys() {
  return MODULE_KEYS;
}

function updateOverview(config) {
  const keys = switchKeys();
  let on = 0;
  keys.forEach(function (k) { if (config[k] !== false) on++; });
  const pct = Math.round((on / keys.length) * 100);
  const ring = $('overviewRing');
  if (ring) ring.setAttribute('stroke-dashoffset', String((globalThis.ssRingCircumference || 251.3) * (1 - pct / 100)));
  if ($('overviewScore')) $('overviewScore').textContent = String(pct);
  if ($('statSurfaces')) $('statSurfaces').textContent = String(on);
  if ($('overviewStatus')) $('overviewStatus').textContent = on === keys.length ? 'Full coverage' : on + ' of ' + keys.length + ' surfaces on';
}

async function refreshStats() {
  const data = await get(['ss_stats', 'ss_site_settings', 'ss_rotation_info']);
  const stats = data.ss_stats || {};
  // IMP-4: same shared list the popup uses, so both UIs report one total.
  const total = typeof globalThis.ssSumStats === 'function' ? globalThis.ssSumStats(stats) : 0;
  const sites = Object.keys(data.ss_site_settings || {}).length;
  if ($('statSites')) $('statSites').textContent = String(sites);
  if ($('statSignals')) $('statSignals').textContent = String(total);
  // Feature 5.9: the About pane shows the same local counters the popup
  // aggregates. Rendering them from ss_stats keeps one source of truth, and
  // nothing here is uploaded - these are read-only numbers on this machine.
  if ($('aboutSites')) $('aboutSites').textContent = String(stats.sitesProtected || 0);
  if ($('aboutSignals')) $('aboutSignals').textContent = String(total);
  if ($('aboutRotations')) $('aboutRotations').textContent = String((data.ss_rotation_info || {}).rotationCount || 0);
}

// Diagnostics (P2): the hook installers report failures to the service worker,
// which stores them in storage.session and raises the toolbar badge. This pane
// is the readable half - it tells the user *which* load degraded instead of
// leaving a red dot with no explanation.
function diagnosticRow(label, value) {
  const row = document.createElement('div');
  row.className = 'row';
  const text = document.createElement('div');
  text.className = 'row-text';
  const strong = document.createElement('strong');
  strong.textContent = label;
  const span = document.createElement('span');
  span.textContent = value;
  text.appendChild(strong);
  text.appendChild(span);
  row.appendChild(text);
  return row;
}

async function renderDiagnostics() {
  const host = $('diagnosticsBody');
  if (!host) return;
  host.textContent = '';
  let diagnostics = null;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_DIAGNOSTICS' });
    if (res && res.success) diagnostics = res.diagnostics;
  } catch (e) { /* service worker may be restarting */ }
  if (!diagnostics) {
    host.appendChild(diagnosticRow('Status', 'Unavailable - reload the extension and try again.'));
    return;
  }
  const failed = Number(diagnostics.failedInstallers) || 0;
  const total = Number(diagnostics.totalInstallers) || 0;
  host.appendChild(diagnosticRow('Last load', failed > 0
    ? failed + ' of ' + (total || '?') + ' installers failed'
    : 'All installers succeeded'));
  if (diagnostics.lastFailureAt) {
    host.appendChild(diagnosticRow('Last failure', new Date(diagnostics.lastFailureAt).toLocaleString()));
  }
  if (diagnostics.lastFailureOrigin) {
    host.appendChild(diagnosticRow('Last failure origin', diagnostics.lastFailureOrigin));
  }

  // IMP-2: core/config.js records the keys ssValidateConfig() rejected. Those
  // were written to the same storage key this pane reads but were never shown,
  // so the card said "All installers succeeded" while a config problem was
  // silently active.
  const rejected = Array.isArray(diagnostics.invalidConfigKeys) ? diagnostics.invalidConfigKeys : [];
  if (rejected.length > 0) {
    const shown = rejected.slice(0, 10).join(', ');
    const more = rejected.length - 10;
    host.appendChild(diagnosticRow('Rejected settings', shown + (more > 0 ? ' (+' + more + ' more)' : '')));
    if (diagnostics.invalidConfigAt) {
      host.appendChild(diagnosticRow('Rejected at', new Date(diagnostics.invalidConfigAt).toLocaleString()));
    }
  }

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn ghost';
  clearBtn.type = 'button';
  clearBtn.textContent = 'Clear diagnostics';
  clearBtn.addEventListener('click', async function () {
    try {
      await new Promise(function (resolve) {
        chrome.storage.session.remove(['ss_diagnostics'], function () { resolve(); });
      });
      toast('Diagnostics cleared');
      renderDiagnostics();
    } catch (e) {
      toast('Could not clear diagnostics');
    }
  });
  host.appendChild(clearBtn);
}

// Feature 7.3 (self-test surface): ask a real page to sample every surface.
// The tab answers with one digest per surface plus a warning for every surface
// it could not reach, so a tab without WebGL or Web Audio no longer reports a
// healthy-looking composite hash that proved nothing.
async function renderSelfTest() {
  const host = $('selfTestBody');
  if (!host) return;
  host.textContent = '';
  host.appendChild(diagnosticRow('Status', 'Running...'));

  let tabs = [];
  try {
    tabs = await new Promise(function (resolve) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (list) { resolve(list || []); });
    });
    if (!tabs.length) {
      tabs = await new Promise(function (resolve) {
        chrome.tabs.query({}, function (list) { resolve(list || []); });
      });
    }
  } catch (e) { /* tabs permission unavailable */ }

  // The options page itself is chrome-extension://, so it never qualifies.
  const candidates = tabs.filter(function (t) {
    return t && t.id != null && /^https?:/i.test(t.url || '');
  });
  let tab = null;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].active) { tab = candidates[i]; break; }
  }
  if (!tab) tab = candidates[0] || null;

  host.textContent = '';
  if (!tab) {
    host.appendChild(diagnosticRow('Status', 'No http(s) tab is open - load a site and run the test again.'));
    return;
  }

  let response = null;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { type: 'SS_RUN_SELF_TEST' });
  } catch (e) { /* no content script answered */ }

  host.textContent = '';
  if (!response || !response.success) {
    host.appendChild(diagnosticRow('Target', tab.url || 'unknown'));
    host.appendChild(diagnosticRow('Status', 'Not installed on this tab - reload it and run the test again.'));
    if (response && response.error) host.appendChild(diagnosticRow('Reason', response.error));
    return;
  }

  const report = response.report || {};
  const parts = report.parts || {};
  const labels = {
    canvas: 'Canvas', webgl: 'WebGL', audio: 'Audio', navigator: 'Navigator',
    screen: 'Screen', timezone: 'Timezone', fonts: 'Fonts', webrtc: 'WebRTC',
    sensors: 'Sensors', touch: 'Touch', useragent: 'User agent', media: 'Media',
    geolocation: 'Geolocation', detection: 'Detection', webgpu: 'WebGPU',
    keyboard: 'Keyboard', viewport: 'Viewport'
  };
  Object.keys(labels).forEach(function (key) {
    if (parts[key]) host.appendChild(diagnosticRow(labels[key], parts[key]));
  });
  const compositeRow = diagnosticRow('Composite', report.composite || 'unavailable');
  host.appendChild(compositeRow);
  host.appendChild(diagnosticRow('Target', tab.url || 'unknown'));

  // IMP-7: add a "Copy fingerprint hash" button after the composite digest so
  // a user can paste it into a threat-intel query or bug report. Uses
  // navigator.clipboard.writeText; falls back to execCommand('copy') when the
  // Permissions Policy blocks the async clipboard API.
  const compositeValue = report.composite || '';
  if (compositeValue) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn ghost';
    copyBtn.textContent = 'Copy hash';
    copyBtn.addEventListener('click', async function () {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(compositeValue);
        } else {
          const ta = document.createElement('textarea');
          ta.value = compositeValue;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        copyBtn.textContent = 'Copied!';
        setTimeout(function () { copyBtn.textContent = 'Copy hash'; }, 2000);
      } catch (e) {
        copyBtn.textContent = 'Denied';
        setTimeout(function () { copyBtn.textContent = 'Copy hash'; }, 2000);
      }
    });
    host.appendChild(copyBtn);
  }

  const warnings = Array.isArray(report.warnings) ? report.warnings : [];
  if (warnings.length) {
    warnings.forEach(function (w) { host.appendChild(diagnosticRow('Not available', w)); });
  } else {
    host.appendChild(diagnosticRow('Warnings', 'None - every surface answered'));
  }
}

// Feature 5.1: import / export. Only ssConfig travels; the salt lives in
// chrome.storage.local and is deliberately never written to the file, so a
// shared profile cannot clone the identity of the machine that exported it.
// Per-origin site settings (persona, rotation hours, noise overrides) travel
// too so they survive a backup/restore cycle.
async function exportConfigToFile() {
  const stored = (await get(['ssConfig', 'ss_site_settings']));
  const payload = {
    app: 'ShapeShift',
    kind: 'ssConfig',
    exportedAt: new Date().toISOString(),
    config: stored.ssConfig || {},
    siteSettings: stored.ss_site_settings || {}
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'shapeshift-config.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

// P8-1: sanitize imported per-origin site settings so a forged or hand-edited
// import file cannot push rotationHours, persona or noise overrides past the
// schema bounds that bootstrap.js clamps against. Unknown keys are dropped.
const SITE_PERSONA_MODES = ['auto', 'windows', 'mac', 'linux'];
const SITE_ROTATION_HOURS = [0.5, 8760];
const SITE_NOISE_LEVEL = [0, 1];
function sanitizeSiteSettings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  let count = 0;
  const MAX_ENTRIES = 1000;
  for (const origin in raw) {
    if (count >= MAX_ENTRIES) break;
    if (typeof origin !== 'string' || !/^https?:\/\/[^\/]+$/i.test(origin)) continue;
    const entry = raw[origin];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const cleaned = {};
    if (typeof entry.enabled === 'boolean') cleaned.enabled = entry.enabled;
    if (typeof entry.reason === 'string') cleaned.reason = entry.reason.slice(0, 200);
    // FEAT-1: a timed pause travels with a config backup. Keep only a valid
    // ISO timestamp, normalized, so a hand-edited import cannot create a pause
    // that never expires or one carrying a garbage label.
    if (typeof entry.pausedUntil === 'string' && entry.pausedUntil.length <= 40) {
      const pausedUntilMs = Date.parse(entry.pausedUntil);
      if (Number.isFinite(pausedUntilMs)) cleaned.pausedUntil = new Date(pausedUntilMs).toISOString();
    }
    if (typeof entry.rotationHours === 'number' && Number.isFinite(entry.rotationHours)) {
      cleaned.rotationHours = Math.min(SITE_ROTATION_HOURS[1], Math.max(SITE_ROTATION_HOURS[0], entry.rotationHours));
    }
    if (typeof entry.persona === 'string' && SITE_PERSONA_MODES.indexOf(entry.persona) !== -1) {
      cleaned.persona = entry.persona;
    }
    if (entry.noiseOverrides && typeof entry.noiseOverrides === 'object' && !Array.isArray(entry.noiseOverrides)) {
      const geo = {};
      const n = entry.noiseOverrides.geolocation;
      if (n && typeof n === 'object' && !Array.isArray(n)) {
        if (typeof n.noiseLevel === 'number' && Number.isFinite(n.noiseLevel)) {
          geo.noiseLevel = Math.min(SITE_NOISE_LEVEL[1], Math.max(SITE_NOISE_LEVEL[0], n.noiseLevel));
        }
      }
      if (Object.keys(geo).length > 0) cleaned.noiseOverrides = { geolocation: geo };
    }
    out[origin] = cleaned;
    count++;
  }
  return out;
}

async function importConfigFromFile(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error('not valid JSON');
  }
  const incoming = parsed && typeof parsed === 'object' && parsed.config ? parsed.config : parsed;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    throw new Error('missing a config object');
  }
  // Normalize + validate the imported config before persisting, so a stale
  // schema version, legacy flat keys or invalid enums cannot reach the hooks.
  const normalized = typeof globalThis.ssNormalizeConfig === 'function'
    ? globalThis.ssNormalizeConfig(incoming)
    : incoming;
  const validated = typeof globalThis.ssValidateConfig === 'function'
    ? globalThis.ssValidateConfig(normalized)
    : { valid: normalized, dropped: [] };
  const cleaned = Object.assign({}, validated.valid);
  cleaned.ssConfigVersion = (globalThis.ssConfigSchema && globalThis.ssConfigSchema.version) || 1;
  // Only ssConfig is written. A file containing ss_salt is ignored on purpose.
  await set({ ssConfig: cleaned });
  // P10-1: surface dropped/invalid keys so an import never silently loses settings.
  if (validated.dropped && validated.dropped.length > 0) {
    toast('Import dropped invalid keys: ' + validated.dropped.join(', '));
  }
  // Restore per-origin site settings when present in the payload, sanitized so
  // a forged or hand-edited import cannot push rotationHours/persona/noise past
  // the schema bounds or inject unknown keys. Merge with existing settings
  // (rather than replacing) so pauses/overrides not present in the file are
  // preserved.
  if (parsed && typeof parsed === 'object' && parsed.siteSettings && !Array.isArray(parsed.siteSettings)) {
    const existing = (await get(['ss_site_settings'])).ss_site_settings || {};
    const imported = sanitizeSiteSettings(parsed.siteSettings);
    const merged = Object.assign({}, existing, imported);
    await set({ ss_site_settings: merged });
  }
}

// Feature 5.1 (statistics export): download ss_stats as a JSON file, mirroring
// the config export pattern. Only counters travel — no raw salt or seed.
async function exportStatsToFile() {
  const stored = (await get(['ss_stats'])).ss_stats || {};
  const payload = {
    app: 'ShapeShift',
    kind: 'ssStats',
    exportedAt: new Date().toISOString(),
    stats: stored
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'shapeshift-stats.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

// Feature 5.2 (diagnostics export): download ss_diagnostics as a JSON file,
// mirroring the config/stats export pattern. Diagnostics live in
// chrome.storage.session (invalid config keys, hook-installer failures) and
// contain no salt or seed — only origin strings already stored.
async function exportDiagnosticsToFile() {
  let diagnostics = {};
  try {
    const stored = await new Promise(function (resolve) {
      chrome.storage.session.get(['ss_diagnostics'], resolve);
    });
    diagnostics = (stored && stored.ss_diagnostics) || {};
  } catch (e) { /* session storage unavailable */ }
  const storedConfig = (await get(['ssConfig'])).ssConfig || {};
  const normalized = typeof globalThis.ssNormalizeConfig === 'function'
    ? globalThis.ssNormalizeConfig(storedConfig)
    : storedConfig;
  const validated = typeof globalThis.ssValidateConfig === 'function'
    ? globalThis.ssValidateConfig(normalized)
    : { valid: normalized, dropped: [] };
  const payload = {
    app: 'ShapeShift',
    kind: 'ssDiagnostics',
    exportedAt: new Date().toISOString(),
    diagnostics: diagnostics,
    // FEAT-3: ship the effective config too. A bug report with hook health but
    // no settings could not be reproduced. The config is normalized and
    // validated first, so the file describes exactly what the hooks receive,
    // and ss_salt is never read here - it is the root of every derived
    // identity, so a shared file containing it would clone this machine's
    // fingerprints onto the reporter's browser.
    config: validated.valid
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'shapeshift-diagnostics.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

async function renderSites() {
  const host = $('siteList');
  if (!host) return;
  host.textContent = '';
  const store = (await get(['ss_site_settings'])).ss_site_settings || {};
  const origins = Object.keys(store);
  if (!origins.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Protection is active on every site. Add an origin to pause it there.';
    host.appendChild(empty);
    return;
  }
  origins.forEach(function (origin) {
    const entry = store[origin] || {};
    const paused = entry.enabled === false;
    const item = document.createElement('div');
    item.className = 'site-item';
    const text = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = origin;
    const span = document.createElement('span');
    if (paused) {
      // FEAT-1: say when a timed pause ends instead of implying it is permanent.
      const pausedUntilMs = entry.pausedUntil ? Date.parse(entry.pausedUntil) : NaN;
      span.textContent = Number.isFinite(pausedUntilMs)
        ? 'Protection paused until ' + new Date(pausedUntilMs).toLocaleString()
        : 'Protection paused';
    }
    else if (entry.rotationHours != null || (entry.persona && entry.persona !== 'auto') || (entry.noiseOverrides && Object.keys(entry.noiseOverrides).length > 0)) span.textContent = 'Protection on (overrides active)';
    else span.textContent = 'Protection on';
    text.appendChild(strong);
    text.appendChild(span);
    const btn = document.createElement('button');
    btn.className = 'btn ghost';
    btn.type = 'button';
    btn.textContent = paused ? 'Resume' : 'Pause';
    btn.addEventListener('click', async function () {
      const current = (await get(['ss_site_settings'])).ss_site_settings || {};
      if (!current[origin]) current[origin] = {};
      if (paused) {
        current[origin].enabled = true;
        delete current[origin].pausedUntil;
        // Drop the entry entirely when no overrides remain, so the default
        // (protection on) is represented by absence.
        const keys = Object.keys(current[origin]);
        if (keys.length === 1 && keys[0] === 'enabled' && current[origin].enabled !== false) {
          delete current[origin];
        }
        await set({ ss_site_settings: current });
        toast('Protection resumed on ' + origin + ' - affected tabs reloaded');
        // Reload affected tabs so the resumed identity takes effect.
        try {
          const tabs = await new Promise(function (resolve) {
            chrome.tabs.query({ url: origin + '/*' }, function (list) { resolve(list || []); });
          });
          for (const t of tabs) if (t && t.id != null) chrome.tabs.reload(t.id);
        } catch (e) { /* best effort */ }
      } else {
        current[origin] = Object.assign({}, current[origin], { enabled: false });
        await set({ ss_site_settings: current });
        // IMP-6: reload the affected tabs here too. Pausing used to write the
        // entry and stop, so the hooks already installed in the open tab kept
        // running while the toast claimed protection was paused - and resuming
        // silently reloaded, which made the two directions behave differently
        // with nothing in the UI saying so.
        try {
          const tabs = await new Promise(function (resolve) {
            chrome.tabs.query({ url: origin + '/*' }, function (list) { resolve(list || []); });
          });
          for (const t of tabs) if (t && t.id != null) chrome.tabs.reload(t.id);
        } catch (e) { /* best effort */ }
        toast('Protection paused on ' + origin + ' - affected tabs reloaded');
      }
      renderSites();
      refreshStats();
    });
    const rotBtn = document.createElement('button');
    rotBtn.className = 'btn';
    rotBtn.type = 'button';
    rotBtn.textContent = 'Rotate this site';
    rotBtn.addEventListener('click', async function () {
      try {
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'ROTATE_ORIGIN', origin }, function (response) {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(response);
          });
        });
        toast('Salt rotated for ' + origin);
        refreshStats();
      } catch (e) {
        console.error('Failed to rotate origin salt:', e);
        toast('Rotation failed for ' + origin);
      }
    });
    // FEAT-1: a pause that expires on its own. Pausing indefinitely is right for
    // a site the user distrusts, but the common case is "let me look at this one
    // page with my real fingerprint" - and that user then forgets to resume.
    if (!paused) {
      const timedBtn = document.createElement('button');
      timedBtn.className = 'btn ghost';
      timedBtn.type = 'button';
      timedBtn.textContent = 'Pause 1h';
      timedBtn.title = 'Pause protection here for one hour';
      timedBtn.setAttribute('aria-label', 'Pause protection on ' + origin + ' for one hour');
      timedBtn.addEventListener('click', async function () {
        const current = (await get(['ss_site_settings'])).ss_site_settings || {};
        const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        current[origin] = Object.assign({}, current[origin], {
          enabled: false,
          pausedUntil: until,
          reason: 'Paused for one hour in options'
        });
        await set({ ss_site_settings: current });
        try {
          const tabs = await new Promise(function (resolve) {
            chrome.tabs.query({ url: origin + '/*' }, function (list) { resolve(list || []); });
          });
          for (const t of tabs) if (t && t.id != null) chrome.tabs.reload(t.id);
        } catch (e) { /* best effort */ }
        toast('Protection paused on ' + origin + ' until ' + new Date(until).toLocaleTimeString());
        renderSites();
        refreshStats();
      });
      item.appendChild(timedBtn);
    }
    item.appendChild(text);
    item.appendChild(btn);
    item.appendChild(rotBtn);
    host.appendChild(item);
  });
}


async function renderOverrides() {
  const host = $('overrideList');
  if (!host) return;
  host.textContent = '';
  const store = (await get(['ss_site_settings'])).ss_site_settings || {};
  const origins = Object.keys(store);
  const overrides = origins.filter(function (o) {
    const e = store[o];
    return e && (e.rotationHours != null || (e.persona && e.persona !== 'auto') || (e.noiseOverrides && Object.keys(e.noiseOverrides).length > 0));
  });
  if (!overrides.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No per-origin overrides set. Add one above.';
    host.appendChild(empty);
    return;
  }
  overrides.forEach(function (origin) {
    const item = document.createElement('div');
    item.className = 'site-item';
    const text = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = origin;
    const span = document.createElement('span');
    const parts = [];
    const e = store[origin];
    if (e.rotationHours != null) parts.push('rotate every ' + e.rotationHours + 'h');
    if (e.persona) parts.push('persona: ' + e.persona);
    if (e.noiseOverrides && e.noiseOverrides.geolocation && e.noiseOverrides.geolocation.noiseLevel != null) {
      parts.push('geo noise: ' + e.noiseOverrides.geolocation.noiseLevel);
    }
    span.textContent = parts.join(', ');
    text.appendChild(strong);
    text.appendChild(span);
    const btn = document.createElement('button');
    btn.className = 'btn ghost';
    btn.type = 'button';
    btn.textContent = 'Clear';
    btn.addEventListener('click', async function () {
      const current = (await get(['ss_site_settings'])).ss_site_settings || {};
      if (current[origin]) {
        delete current[origin].rotationHours;
        delete current[origin].persona;
        delete current[origin].noiseOverrides;
        // If no other overrides remain, remove the entry entirely (which means
        // protection is ON for this origin, the default).
        const keys = Object.keys(current[origin]);
        if (keys.length === 0 || (keys.length === 1 && keys[0] === 'enabled' && current[origin].enabled !== false)) {
          delete current[origin];
        }
      }
      await set({ ss_site_settings: current });
      toast('Override removed for ' + origin);
      renderOverrides();
    });
    item.appendChild(text);
    item.appendChild(btn);
    host.appendChild(item);
  });
}

// FEAT-2: the rotation log recorded by background/service-worker.js. Built here
// rather than in the markup so the card uses createElement + textContent like
// every other dynamic list on this page.
async function renderRotationHistory() {
  const panel = $('panel-identity');
  if (!panel) return;
  let card = $('rotationHistoryCard');
  if (!card) {
    card = document.createElement('div');
    card.className = 'card';
    card.id = 'rotationHistoryCard';
    const head = document.createElement('div');
    head.className = 'card-head';
    const title = document.createElement('h3');
    title.textContent = 'Rotation history';
    head.appendChild(title);
    const listBody = document.createElement('div');
    listBody.id = 'rotationHistoryBody';
    listBody.className = 'rows';
    card.appendChild(head);
    card.appendChild(listBody);
    panel.appendChild(card);
  }
  const body = $('rotationHistoryBody');
  if (!body) return;
  body.textContent = '';
  const stored = await get(['ss_rotation_history']);
  const history = Array.isArray(stored.ss_rotation_history) ? stored.ss_rotation_history : [];
  if (!history.length) {
    body.appendChild(diagnosticRow('No rotations yet', 'A rotation will appear here with its time and scope.'));
    return;
  }
  history
    .slice()
    .reverse()
    .forEach(function (entry) {
      const at = entry && entry.at ? new Date(entry.at) : null;
      const when = at && Number.isFinite(at.getTime()) ? at.toLocaleString() : 'Unknown time';
      const scope = entry && entry.scope === 'global' ? 'All sites' : (entry && entry.scope) || 'Unknown scope';
      const reason = (entry && entry.reason) || 'rotation';
      body.appendChild(diagnosticRow(when, scope + ' - ' + reason));
    });
}

// FEAT-4: one filter box for every settings pane. Pure DOM filtering - no
// storage write, no new dependency, and the typed value is only compared
// against textContent, never injected as HTML.
function installSettingsFilter() {
  const nav = $('nav');
  if (!nav || !nav.parentElement) return;
  if ($('settingsFilter')) return;
  const wrap = document.createElement('div');
  wrap.className = 'filter-wrap';
  const input = document.createElement('input');
  input.id = 'settingsFilter';
  input.className = 'filter-input';
  input.placeholder = 'Filter settings';
  input.setAttribute('aria-label', 'Filter settings');
  wrap.appendChild(input);
  nav.parentElement.insertBefore(wrap, nav.nextSibling);
  input.addEventListener('input', function () {
    const term = input.value.trim().toLowerCase();
    const rows = document.querySelectorAll('.row');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      row.hidden = term !== '' && row.textContent.toLowerCase().indexOf(term) === -1;
    }
  });
}// IMP-5: chrome.storage.sync is a one-way mirror by default - core/config.js
// writes every ssConfig change there and only adopts it when local is ABSENT,
// so a second machine that ever saved settings never sees the synced copy. This
// gives the user an explicit, validated way to pull it back. Local keeps
// winning automatically; the pull is the deliberate override.
async function pullConfigFromSync() {
  try {
    const synced = await new Promise(function (resolve) {
      chrome.storage.sync.get(['ssConfig'], function (result) { resolve(result || {}); });
    });
    if (!synced.ssConfig || typeof synced.ssConfig !== 'object' || Array.isArray(synced.ssConfig)) return false;
    // Same normalize + validate path every other write uses, so a config from
    // an older build or a hand-edited sync store cannot reach the hooks raw.
    const normalized = typeof globalThis.ssNormalizeConfig === 'function'
      ? globalThis.ssNormalizeConfig(synced.ssConfig)
      : synced.ssConfig;
    const validated = typeof globalThis.ssValidateConfig === 'function'
      ? globalThis.ssValidateConfig(normalized)
      : { valid: normalized, dropped: [] };
    const cleaned = Object.assign({}, validated.valid);
    cleaned.ssConfigVersion = (globalThis.ssConfigSchema && globalThis.ssConfigSchema.version) || 1;
    await set({ ssConfig: cleaned });
    if (validated.dropped && validated.dropped.length > 0) {
      toast('Pulled settings, dropped: ' + validated.dropped.join(', '));
    }
    return true;
  } catch (e) {
    return false;
  }
}

// The control lives in the Advanced pane, next to the other import/export
// actions, and is created here rather than in the markup so it needs no
// dependency on the HTML layout.
function installSyncPull() {
  const panel = $('panel-advanced');
  if (!panel || $('pullSyncBtn')) return;
  const btn = document.createElement('button');
  btn.className = 'btn ghost';
  btn.id = 'pullSyncBtn';
  btn.type = 'button';
  btn.textContent = 'Pull settings from sync';
  btn.setAttribute('aria-label', 'Pull settings from browser sync');
  btn.addEventListener('click', async function () {
    btn.disabled = true;
    const pulled = await pullConfigFromSync();
    btn.disabled = false;
    toast(pulled ? 'Settings pulled from sync - reloading' : 'No synced settings found');
    if (pulled) setTimeout(function () { location.reload(); }, 600);
  });
  panel.appendChild(btn);
}

async function main() {
  const stored = (await get(['ssConfig'])).ssConfig || {};
  const flatStored = (typeof globalThis.ssFlattenConfig === 'function') ? globalThis.ssFlattenConfig(stored) : stored;
  const config = Object.assign({}, DEFAULTS, flatStored);

  renderGroups(config);
  updateOverview(config);
  refreshStats();
  renderSites();
  renderOverrides();
  renderRotationHistory();
  installSettingsFilter();
  installSyncPull();
  // Populate the Hook health card on load too. renderDiagnostics() was only
  // reachable from the Advanced nav click and the Refresh button, so the pane
  // showed placeholder text until the user interacted with it.
  renderDiagnostics();
  if ($('aboutVersion')) {
    try { $('aboutVersion').textContent = chrome.runtime.getManifest().version; } catch (e) { }
  }

  document.addEventListener('change', function () { updateOverview(collect()); });
  document.addEventListener('input', function () { updateOverview(collect()); });

  const nav = $('nav');
  if (nav) {
    nav.addEventListener('click', function (event) {
      const btn = event.target.closest('.nav-item');
      if (!btn) return;
      const target = btn.dataset.panel;
      const items = nav.querySelectorAll('.nav-item');
      for (let i = 0; i < items.length; i++) items[i].classList.toggle('active', items[i] === btn);
      for (let i = 0; i < items.length; i++) items[i].setAttribute('aria-current', items[i] === btn ? 'page' : 'false');
      const panels = document.querySelectorAll('.panel');
      for (let i = 0; i < panels.length; i++) panels[i].classList.toggle('active', panels[i].id === 'panel-' + target);
      const meta = TITLES[target] || ['', ''];
      if ($('panelTitle')) $('panelTitle').textContent = meta[0];
      if ($('panelSub')) $('panelSub').textContent = meta[1];
      if (target === 'identity') renderRotationHistory();
      if (target === 'sites') renderSites();
      if (target === 'advanced') renderDiagnostics();
      if (target === 'about' || target === 'overview') { updateOverview(collect()); refreshStats(); }
    });
  }

  // P2 7.2 (feature): the named profiles were `balanced` / `strict` / `compat`
  // and the patch was applied with a two-way branch - `number` wrote `.value`,
  // everything else wrote `.checked`. `webrtcMode` is a <select> rendered with
  // `data-kind="enum"`, so every preset wrote a *string* into `.checked` (a
  // no-op property) and the WebRTC policy silently stayed whatever it was. The
  // preset row therefore never actually changed the one setting it advertised.
  // Three explicit levels now, each patching the enum through `.value`.
  // UI-4: apply profile preset when the dropdown changes, so the profile is
  // not inert. The save path persists the resolved flat keys.
  const profileSelect = document.querySelector('[data-key="profile"]');
  if (profileSelect) {
    profileSelect.addEventListener('change', function () {
      const name = profileSelect.value;
      const patch = presets[name];
      if (!patch || name === 'balanced') return;
      Object.keys(patch).forEach(function (key) {
        const el = document.querySelector('[data-key="' + key + '"]');
        if (!el) return;
        if (!el.dataset.kind) {
          el.checked = !!patch[key];
        } else {
          el.value = patch[key];
          el.dispatchEvent(new Event('input', { bubbles: false }));
        }
      });
      updateOverview(collect());
      toast('Profile applied: ' + name + '. Remember to save.');
    });
  }
  // BUG-3: read the single preset table from core/config-schema.js. The local
  // copy that used to live here disagreed with it on canvasNoiseStrength,
  // webglJitter and audioNoiseStrength, so the profile dropdown and these
  // preset buttons wrote different values for the same profile name.
  const presets = (globalThis.ssConfigSchema && globalThis.ssConfigSchema.presets) || {};
  const presetLabels = { light: 'Light', balanced: 'Balanced', maximum: 'Maximum' };
  const presetBtns = document.querySelectorAll('.preset');
  for (let i = 0; i < presetBtns.length; i++) {
    presetBtns[i].addEventListener('click', function () {
      const name = presetBtns[i].dataset.preset;
      // BUG-3: one preset table, in core/config-schema.js. 'balanced' is empty
      // there because it *is* the defaults, so this button restores the schema
      // defaults for every key the other presets touch.
      let patch = presets[name];
      if (name === 'balanced') {
        patch = {};
        Object.keys(presets).forEach(function (profile) {
          Object.keys(presets[profile] || {}).forEach(function (key) {
            if (patch[key] !== undefined) return;
            patch[key] = key === 'webrtcMode' ? DEFAULTS.mode : DEFAULTS[key];
          });
        });
      }
      if (!patch) return;
      Object.keys(patch).forEach(function (key) {
        const el = document.querySelector('[data-key="' + key + '"]');
        if (!el) return;
        // A checkbox is the only control without an explicit kind; selects are
        // 'enum' and sliders/number inputs are 'number'. Both of those take the
        // value directly so a string enum reaches the right property.
        if (!el.dataset.kind) {
          el.checked = !!patch[key];
        } else {
          el.value = patch[key];
          // A slider's value chip is refreshed only by its own 'input' listener,
          // so a preset that wrote .value directly left the chip showing the old
          // number next to the new slider position. Dispatch the event the
          // control already listens for instead of duplicating the formatting.
          el.dispatchEvent(new Event('input', { bubbles: false }));
        }
      });
      updateOverview(collect());
      toast('Preset applied: ' + (presetLabels[name] || name) + '. Remember to save.');
    });
  }

  if ($('saveBtn')) {
    $('saveBtn').addEventListener('click', async function () {
      const merged = Object.assign({}, config, collect());
      // P8-3: normalize legacy flat keys, validate against the schema, stamp the
      // current schema version and persist only the validated subset - so a
      // stray key, an out-of-range number or a wrong-typed boolean can never
      // reach the hooks through the save path.
      const normalized = typeof globalThis.ssNormalizeConfig === 'function'
        ? globalThis.ssNormalizeConfig(merged) : merged;
      const validated = typeof globalThis.ssValidateConfig === 'function'
        ? globalThis.ssValidateConfig(normalized) : { valid: normalized, dropped: [] };
      const cleaned = Object.assign({}, validated.valid);
      cleaned.ssConfigVersion = (globalThis.ssConfigSchema && globalThis.ssConfigSchema.version) || 1;
      await set({ ssConfig: cleaned });
      try { await chrome.runtime.sendMessage({ type: 'UPDATE_ROTATION_CONFIG' }); } catch (e) { }
      if ($('sideStatus')) $('sideStatus').textContent = 'Saved ' + new Date().toLocaleTimeString();
      // P10-1: surface dropped/invalid keys so a save never silently loses settings.
      if (validated.dropped && validated.dropped.length > 0) {
        toast('Dropped invalid keys: ' + validated.dropped.join(', '));
      } else {
        toast('Settings saved');
      }
      updateOverview(merged);
    });
  }

  if ($('refreshDiagnosticsBtn')) {
    $('refreshDiagnosticsBtn').addEventListener('click', function () {
      renderDiagnostics();
      toast('Diagnostics refreshed');
    });
  }

  if ($('runSelfTestBtn')) {
    $('runSelfTestBtn').addEventListener('click', async function () {
      toast('Running self-test');
      await renderSelfTest();
    });
  }

  if ($('exportConfigBtn')) {
    $('exportConfigBtn').addEventListener('click', async function () {
      await exportConfigToFile();
      toast('Configuration exported');
    });
  }

  if ($('exportStatsBtn')) {
    $('exportStatsBtn').addEventListener('click', async function () {
      await exportStatsToFile();
      toast('Statistics exported');
    });
  }

  if ($('exportDiagnosticsBtn')) {
    $('exportDiagnosticsBtn').addEventListener('click', async function () {
      await exportDiagnosticsToFile();
      toast('Diagnostics exported');
    });
  }

  if ($('importConfigBtn') && $('importConfigFile')) {
    $('importConfigBtn').addEventListener('click', function () {
      $('importConfigFile').click();
    });
    $('importConfigFile').addEventListener('change', async function (event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        await importConfigFromFile(file);
        toast('Configuration imported - reloading');
        setTimeout(function () { location.reload(); }, 600);
      } catch (e) {
        toast('Import failed: ' + ((e && e.message) || 'invalid file'));
      }
      event.target.value = '';
    });
  }

  if ($('resetAllBtn')) {
    $('resetAllBtn').addEventListener('click', async function () {
      if (!window.confirm('Reset all settings to defaults? This cannot be undone.')) return;
      await remove('ssConfig');
      toast('Settings restored to defaults');
      setTimeout(function () { location.reload(); }, 600);
    });
  }

  if ($('rotateNowBtn')) {
    $('rotateNowBtn').addEventListener('click', async function () {
      // Same path as the popup: let the service worker own the rotation so the
      // notification, rotation info and alarm re-arm all happen exactly once.
      let rotated = false;
      try {
        const res = await chrome.runtime.sendMessage({ type: 'ROTATE_NOW' });
        rotated = !!(res && res.success);
      } catch (e) { /* fall through to the local path */ }
      if (!rotated) {
        // Per-origin salts live under "ss_salt:<origin>", so removing the single
        // legacy key would no longer rotate anything.
        try {
          const allSalts = await chrome.storage.local.get(null);
          const saltKeys = Object.keys(allSalts || {}).filter((k) => k === 'ss_salt' || k.indexOf('ss_salt:') === 0);
          if (saltKeys.length) await chrome.storage.local.remove(saltKeys);
        } catch (e) { /* best effort */ }
        const rotation = (await get(['ss_rotation_info'])).ss_rotation_info || {};
        await set({ ss_rotation_info: { lastRotation: new Date().toISOString(), rotationCount: (rotation.rotationCount || 0) + 1 } });
        toast('New identity generated - reloading tabs');
        try {
          const tabs = await new Promise(function (resolve) {
            chrome.tabs.query({}, function (list) { resolve(list || []); });
          });
          for (const t of tabs) {
            if (t && t.url && /^https?:/i.test(t.url) && t.id != null) chrome.tabs.reload(t.id);
          }
        } catch (e) { /* reload is best-effort */ }
        return;
      }
      toast('New identity generated');
      refreshStats();
    });
  }


  if ($('addOverrideBtn')) {
    $('addOverrideBtn').addEventListener('click', async function () {
      const input = $('overrideSiteInput');
      const raw = (input.value || '').trim().toLowerCase();
      if (!raw) return;
      let origin;
      try { origin = new URL(/^https?:/.test(raw) ? raw : 'https://' + raw).origin; }
      catch (e) { toast('Enter a valid domain'); return; }
      const store = (await get(['ss_site_settings'])).ss_site_settings || {};
      const entry = store[origin] || { enabled: true };
      const rotHours = $('overrideRotationHours').value;
      const personaVal = $('overridePersona').value;
      const noiseLevel = $('overrideNoiseLevel').value;
      if (rotHours) {
        const n = clampNumber('rotationIntervalHours', rotHours);
        if (!Number.isFinite(n)) { toast('Rotation hours out of range'); return; }
        entry.rotationHours = n;
      } else delete entry.rotationHours;
      if (personaVal) entry.persona = personaVal;
      else delete entry.persona;
      if (noiseLevel) {
        const n = clampNumber('noiseLevel', noiseLevel);
        if (!Number.isFinite(n)) { toast('Noise level out of range'); return; }
        entry.noiseOverrides = entry.noiseOverrides || {};
        entry.noiseOverrides.geolocation = entry.noiseOverrides.geolocation || {};
        entry.noiseOverrides.geolocation.noiseLevel = n;
      } else if (entry.noiseOverrides) {
        delete entry.noiseOverrides.geolocation;
        if (Object.keys(entry.noiseOverrides).length === 0) delete entry.noiseOverrides;
      }
      // Preserve the user's paused state instead of silently un-pausing.
      if (store[origin] && typeof store[origin].enabled === 'boolean') entry.enabled = store[origin].enabled;
      else entry.enabled = true;
      store[origin] = entry;
      await set({ ss_site_settings: store });
      input.value = '';
      $('overrideRotationHours').value = '';
      $('overridePersona').value = '';
      $('overrideNoiseLevel').value = '';
      toast('Override saved for ' + origin);
      renderOverrides();
    });
  }
  if ($('addSiteBtn')) {
    $('addSiteBtn').addEventListener('click', async function () {
      const input = $('newSiteInput');
      const raw = (input.value || '').trim().toLowerCase();
      if (!raw) return;
      let origin;
      try { origin = new URL(/^https?:/.test(raw) ? raw : 'https://' + raw).origin; }
      catch (e) { toast('Enter a valid domain'); return; }
      const store = (await get(['ss_site_settings'])).ss_site_settings || {};
      store[origin] = { enabled: false, reason: 'Disabled in options' };
      await set({ ss_site_settings: store });
      input.value = '';
      toast('Paused on ' + origin);
      renderSites();
      refreshStats();
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
