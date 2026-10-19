# ShapeShift — Architecture

*A visual + textual guide to how the extension's two-world model, salt/seed
chain, and message routing fit together. Ground-truth references point to
file names and line numbers in the repository.*

---

## 1. The two-world model

```
┌─────────────────────────────────────┐  ┌──────────────────────────────────────────┐
│  ISOLATED world (content scripts)    │  │  MAIN world (page context)                │
│                                       │  │                                          │
│  ┌─────────────────────────────────┐  │  │  ┌──────────────────────────────────┐   │
│  │ manifest.json → content_scripts  │  │  │  │ page_world_injector.js           │   │
│  │ [0] ISOLATED                   │  │  │  │ (single file, document_start)    │   │
│  │                                 │  │  │  │                                  │   │
│  │ core/config-schema.js  ← SSOT   │  │  │  │ Inlines FNV-1a + Chrome table    │   │
│  │ core/config.js          load    │  │  │  │ (cannot import core/ files)      │   │
│  │ core/hash.js            derive  │  │  │  │                                  │   │
│  │ core/chrome-versions.js  table  │  │  │  │ Hooks all page-visible APIs:     │   │
│  │ core/prng.js             PRNG   │  │  │  │   canvas, webgl, audio, screen,  │   │
│  │ core/timing.js         timing    │  │  │  │   navigator, webrtc, fonts, etc.  │   │
│  │ core/stealth.js        patch     │  │  │  │   toString guard, worker shim   │   │
│  │ core/salts.js          salt       │  │  │  │                                  │   │
│  │ hooks_*.js (14 files)  hooks     │  │  │  │ Non-enumerable props on page     │   │
│  │                                 │  │  │  │ prototypes via Object.defineProperty│   │
│  │ bootstrap.js           seed      │  │  │  │                                  │   │
│  │ stats_tracker.js       counts    │  │  │  │ P0 1.6: nonce-gated latch,       │   │
│  │ test_fingerprint.js    self-test   │  │  │  │  one-shot, cannot be re-forged  │   │
│  │ content_main.js       install      │  │  │  └──────────────────────────────────┘   │
│  └─────────────────────────────────┘  │  └──────────────────────────────────────────┘
│                                       │
│  chrome.runtime.sendMessage ────────► │  window.postMessage (MAIN ← ISOLATED)        │
│                                       │                                             │
│  chrome.storage.local/session         │                                             │
│  (no access in MAIN world)            │                                             │
└─────────────────────────────────────┘  └──────────────────────────────────────────┘
```

**Invariant (AGANTS.md §4):** anything a page can observe must be patched in
the MAIN world. The ISOLATED world only loads config and computes values; it
cannot `eval` page code or touch the DOM in a way the page could read.

Content scripts load at `document_start` (manifest.json lines 71, 81). The
ISOLATED script array (manifest.json lines 43–69) runs in dependency order:

```
core/config-schema.js → core/config.js → core/hash.js → core/chrome-versions.js
→ core/prng.js → core/timing.js → core/stealth.js → core/salts.js
→ hooks_canvas.js → hooks_webgl.js → … → hooks_detection.js
→ bootstrap.js → stats_tracker.js → test_fingerprint.js → content_main.js
```

---

## 2. The nonce handshake (Security §3)

```
time →

ISOLATED  │  page_world_injector.js (MAIN)          ISOLATED  │  bootstrap.js (ISOLATED)
          │                                            │          │
document  │  SS_PAGE_WORLD_READY(nonce) ──postMessage──►           │
_start    │  (one-shot message listener)                        │
          │                                                      │
          │  SS_PAGE_WORLD_HELLO ──postMessage──────────────────►│
          │                                            │          │
          │  (listener still alive)                          │  nonce = msg.nonce
          │  SS_INIT_PAGE_HOOKS(nonce, config, seed)            │
          │  ←── window.postMessage —──────────────────────────  │  config loaded
          │                                            │  salt derived
          │                                            │  seed = deriveSeed(salt, origin)
          │                                            │  postMessage(SS_INIT_PAGE_HOOKS)
          │  ┌─ nonce matches? ✓                          │
          │  └─ yes → install all hooks (one-shot latch set)  │
          │         no → silently drop
          │
          │  "All hooks installed successfully" (console, debug only)
```

**Key points:**
- The MAIN world publishes the nonce first (line 2033 of `page_world_injector.js`).
- `bootstrap.js` (line 24) sends `SS_PAGE_WORLD_HELLO` to trigger a re-announce
  if its listener was registered after the first `READY`.
- The injector uses a **one-shot latch** (not `{ once: true }` on
  `addEventListener`, which consumed the HELLO and left no receiver for
  `SS_INIT_PAGE_HOOKS`). The P0 guard for this is in `verify.mjs` line 279.
- Config is **not secret**: the page can read every field. The nonce + whitelist
  (`CONFIG_BOUNDS` in `page_world_injector.js` line 54) + one-shot latch are what
  prevent a forged first message.

---

## 3. Salt → seed → persona derivation chain

```
chrome.storage.local                    chrome.storage.session
┌─────────────────┐                     ┌─────────────────┐
│ "ss_salt:<origin>"│  (or "ss_salt")   │ "ss_site_settings"│
│ hex128 string   │                     │ {origin: {enabled}}│
└────────┬────────┘                     └────────┬────────┘
         │                                        │
         ▼                                        │
  salts.js getSalt()                              │
  (per-origin, cached + in-flight)                │
         │                                        │
         ▼                                        │
  hash.js deriveSeed(salt, origin)                │
  (PBKDF2-style, 1000 rounds by default)          │
         │                                        │
         ▼                                        │
  seed (uint32) ────► bootstrap.js builds env    │
  (env.seed)                  │                   │
                              ▼                   ▼
                    prng = createPRNG(seed)    site enabled?
                    noise = uniformNoise|gauss |   │
                    prngFor = deriveSurfaceSeed   │
                              │                  │
                    ┌─────────┴─────────┐         │
                    │ ISOLATED hooks    │         │
                    │ (read from env)   │         │
                    └─────────┬─────────┘         │
                              │                   │
                              ▼                   │
                    postMessage(SS_INIT_PAGE_HOOKS, {seed})
                              │                   │
                              ▼                   │
                    MAIN world: hashString(seed + ':surface:field')
                    (inlined FNV-1a, same table as core/hash.js)
                              │
                    ┌─────────┴─────────┐
                    │ MAIN hooks        │
                    │ (apply to page    │
                    │  prototypes)      │
                    └───────────────────┘
```

**Determinism (AGANTS.md §4):** `(salt, origin, config)` → same seed → same
spoofed values every load. No `Math.random()` or `Date.now()` enters the
derivation path. `core/salts.js` uses `crypto.getRandomValues` (the only source
of entropy), and only at salt-creation time.

---

## 4. Cross-world value derivation

The ISOLATED hooks compute values from `env.seed` (derived via
`ssDeriveSeed` / `ssDeriveSurfaceSeed` from `core/hash.js`). The MAIN-world
injector receives only the `seed` and re-derives the same per-surface values
using the same `hashString` function (inlined at `page_world_injector.js`
lines 23–37).

| Surface | ISOLATED hook file | MAIN world patch location |
|---|---|---|
| Canvas | `hooks_canvas.js` | `page_world_injector.js` (canvas block) |
| WebGL | `hooks_webgl.js` | `page_world_injector.js` (webgl block) |
| Audio | `hooks_audio.js` | `page_world_injector.js` (audio block) |
| Screen | `hooks_screen.js` | `page_world_injector.js` (screen block) |
| Navigator | `hooks_navigator.js` | `page_world_injector.js` (navigator block) |
| WebRTC | `hooks_webrtc.js` | `page_world_injector.js` (webrtc block) |
| Fonts | `hooks_fonts.js` | `page_world_injector.js` (fonts block) |
| Timezone | `hooks_timezone.js` | `page_world_injector.js` (timezone block) |
| Sensors | `hooks_sensors.js` | `page_world_injector.js` (sensors block) |
| Touch | `hooks_touch.js` | `page_world_injector.js` (touch block) |
| User Agent | `hooks_useragent.js` | `page_world_injector.js` (useragent block) |
| Media | `hooks_media.js` | `page_world_injector.js` (media block) |
| Geolocation | `hooks_geolocation.js` | `page_world_injector.js` (geolocation block) |
| Detection | `hooks_detection.js` | `page_world_injector.js` (detection block) |

**Invariant:** both worlds must use the same key. The ISOLATED hook reads
`env.seed` and the MAIN injector reads the same `seed` from the nonce message.
Both derive `hashString(seed + ':canvas')` etc. The verify gate pins this by
extracting the `CHROME_STABLE_VERSIONS` table and FNV constants from both
files and asserting equality.

---

## 5. Service-worker message router

`background/service-worker.js` (741 lines) is the single message hub. All
messages flow through `chrome.runtime.onMessage` (line 59):

| Message type | Direction | Handler |
|---|---|---|
| `UPDATE_STATS` | content → SW | `updateStats()` — increments `ss_stats` counters |
| `HOOK_STATUS` | content → SW | `recordDiagnostics()` — failed/total installer counts into `ss_diagnostics` (session storage) |
| `GET_ROTATION_STATUS` | popup → SW | Returns rotation alarm state + next fire time |
| `ROTATE_NOW` | popup/options → SW | `rotateFingerprintNow()` — removes all salts, bumps generation, reloads tabs |
| `ROTATE_ORIGIN` | popup → SW | Removes only the per-origin salt for one origin |
| `SS_RUN_SELF_TEST` | options → content (via tabs.sendMessage) | Runs `ssTestFingerprintReport()` in the tab, returns per-surface digests |

**Rotation paths (line 120–165):**
- **Global rotation:** `ROTATE_NOW` → removes every `ss_salt:*` key → bumps
  `ss_salt_generation` → reloads open tabs → raises a notification.
- **Per-origin rotation:** `ROTATE_ORIGIN` → removes only `ss_salt:<origin>`.

**bfcache guard (line 698–718):** `ss_salt_generation` + per-tab
`ss_tab_gen_<tabId>` stamps ensure a bfcached tab is reloaded on activation if
a rotation occurred while it was in the cache. The tab generation is stamped at
`document_start`; if the stored value is lower than the current
`ss_salt_generation`, the tab reloads before hooks install.

---

## 6. Global-to-file mapping

| Global | File | Purpose |
|---|---|---|
| `ssFlatDefaults`, `ssDefaultConfig`, `ssFlatToNested`, `ssConfigSchema` | `core/config-schema.js` | Single source of truth for config |
| `ssLoadConfig`, `ssNormalizeConfig`, `ssMigrateConfig` | `core/config.js` | Load + merge stored config |
| `ssHashString`, `ssMixString`, `ssClampIterations`, `ssFnvInit`, `ssFnvUpdate` | `core/hash.js` | FNV-1a + KDF |
| `ssDeriveSeed`, `ssDeriveStrongSeed`, `ssDeriveSeedSimple`, `ssDeriveSurfaceSeed` | `core/hash.js` | Seed derivation |
| `ssCreatePRNG`, `ssCreateMulberry32`, `ssPRNG`, `ssNoise` | `core/prng.js` | Xoshiro128** + mulberry32 |
| `ssGetSalt` | `core/salts.js` | Per-origin persistent salt |
| `ssTimingUtils` | `core/timing.js` | Timing jitter helpers |
| `ssStealth` | `core/stealth.js` | Patch tracking + global cleanup |
| `ssHookInstallers` | all `hooks_*.js` | Installer registration list |
| `ssReady`, `ssEnv` | `content/bootstrap.js` | Async env promise + resolved env |
| `ssStatsTracker` | `content/stats_tracker.js` | Counter batching |
| `ssTestFingerprint`, `ssTestFingerprintReport` | `content/test_fingerprint.js` | Diagnostic self-test |
| `ssRingCircumference` | `core/config-schema.js` | SVG progress ring length |
| `ssChromeStableVersions`, `ssPickChromeVersion` | `core/chrome-versions.js` | Real Chrome version table |

All `ss*` globals are made non-enumerable by `core/stealth.js`
(`cleanupGlobals` / `makeNonEnumerable`) so a single
`Object.keys(globalThis)` cannot detect the extension.

---

## 7. Rotation lifecycle

```
User clicks "Generate new identity"
  │
  ▼
popup.js / options.js → chrome.runtime.sendMessage({ type: 'ROTATE_NOW' })
  │
  ▼
background/service-worker.js
  1. chrome.storage.local.remove(['ss_salt', 'ss_salt:<origin>', …])
  2. ss_salt_generation++   (stored in chrome.storage.local)
  3. If reloadTabsOnRotation:
     chrome.tabs.query({}) → reload each tab's active tab
  4. chrome.notifications.create(...)  (unless suppressed)
  │
  ▼
Tab reloads → document_start → ISOLATED scripts re-run
  → bootstrap.js reads new generation stamp
  → if stale: reload again (bfcache guard)
  → salt regeneration → new seed → new persona
  → handshake → MAIN-world hooks installed
```

---

## 8. Testing strategy

| Layer | File | What it checks |
|---|---|---|
| Syntax | `verify.mjs` | All 30 runtime `.js` files pass `node --check` |
| Structure | `verify.mjs` | Namespace, storage contract, manifest, config SSOT |
| Behaviour | `test.mjs` | Core determinism (hash, PRNG, config sanitize) |
| Behavioural | `test.mjs` | MAIN-world handshake (vm context, nonce flow) |
| Structural | `test.mjs` | `toString` prefixes, method shims, cross-world parity |
| Build | `build.mjs` | dist/ freshness (runs verify twice) |

**Gaps:** None — Playwright/browser-level integration tests exist under
`tests/e2e/`, and ISOLATED hook registration is covered by `test.mjs` P8.

---

## 9. File layout

```
shapeshift/
├── manifest.json                    MV3 manifest, 5 permissions, 2 content scripts
├── popup/
│   ├── popup.html                   Shell, loads config-schema → config → popup.js
│   ├── popup.css                    Dark glass theme, CSS vars, aurora rings
│   └── popup.js                     Status, per-site toggle, rotation, stats
├── options/
│   ├── options.html                 Tabbed control room (identity, surfaces, …)
│   ├── options.css                  Full-page glass theme
│   └── options.js                   300+ lines: config UI, presets, diagnostics,
│                                     site list, override editor, export/import
├── core/                            Pure engine, no DOM assumptions
│   ├── config-schema.js             DefaultS + schema + presets + ring constant
│   ├── config.js                    Load/merge/migrate stored config
│   ├── hash.js                      FNV-1a + PBKDF2-style KDF
│   ├── chrome-versions.js           Real Chrome stable version table
│   ├── prng.js                      Xoshiro128** + mulberry32
│   ├── timing.js                    Timing jitter
│   ├── stealth.js                   Patch tracking + global cleanup
│   └── salts.js                     Per-origin salt management
├── content/                         ISOLATED world content scripts
│   ├── hooks_*.js                    14 surface hooks (canvas…detection)
│   ├── bootstrap.js                  Seed + env + handshake
│   ├── stats_tracker.js             Counter batching
│   ├── test_fingerprint.js           Diagnostic sampler (debug only)
│   ├── content_main.js               Installs registered hooks
│   └── page_world_injector.js        MAIN world bridge (2703 lines)
├── background/
│   └── service-worker.js             Message router + rotation + bfcache guard
├── scripts/
│   ├── verify.mjs                    63-check structural gate
│   ├── test.mjs                      177 deterministic + behavioural tests
│   ├── build.mjs                     Package runtime tree into dist/
│   ├── bump-version.mjs              Sync version across manifest + package
│   ├── generate-icons.mjs            Regenerate toolbar icons
│   ├── rename-namespace.mjs          One-shot fp* → ss* migration
│   └── bench.mjs                     Benchmark harness
├── images/                           Icon assets (16/32/48/128)
├── _locales/                         en/ + vi/ message catalogs
├── dist/                             Built extension (committed, freshness-checked)
└── AGENTS.md                         Contribution rules + non-negotiable invariants
```
