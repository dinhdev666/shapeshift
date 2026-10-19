// Worker-realm bootstrap: repeats the spoofed navigator persona so that worker
// realms report the same hardwareConcurrency / deviceMemory / platform as the
// page world. Loaded in the MAIN world before page_world_injector.js, so the
// builder is available as globalThis.ssBuildWorkerShim.
//
// P4: this template was previously an inline array of joined strings buried in
// the middle of the 2700-line page_world_injector.js IIFE. Extracting it into
// its own file makes it lintable, reviewable, and — crucially — testable by
// test.mjs (which can load this script and call ssBuildWorkerShim directly).
(function () {
  // The shim source is built with explicit concatenation (not JSON.stringify of
  // the whole template) so that every defineProperty call is visible to
  // ESLint and review. `P` is the persona, injected as a JSON literal.
  function buildWorkerShim(persona) {
    var pJson = JSON.stringify(persona || {});
    var lines = [
      '(function(){',
      '  var P=' + pJson + ';',
      '  try{Object.defineProperty(navigator,"hardwareConcurrency",{get:function(){return P.hardwareConcurrency;},configurable:true});}catch(e){}',
      '  try{Object.defineProperty(navigator,"deviceMemory",{get:function(){return P.deviceMemory;},configurable:true});}catch(e){}',
      '  try{Object.defineProperty(navigator,"platform",{get:function(){return P.platform;},configurable:true});}catch(e){}',
      '})();',
    ];
    return lines.join(String.fromCharCode(10));
  }

  // P1 (worklet clock): AudioWorkletGlobalScope.prototype.currentTime must NOT
  // be pinned — the shim only patches navigator properties because those are the
  // only fingerprint surfaces a worker realm exposes. An audio clock frozen to
  // `this.__ssTime || 0` is an oracle, not a protection.
  // Documented here so a reviewer cannot "fix" the shim to include it.
  var FORBIDDEN_KEYS = ['currentTime', '__ssTime', 'timing'];

  // Self-check: the shim must never patch the forbidden keys.
  function validateShim(source) {
    for (var i = 0; i < FORBIDDEN_KEYS.length; i++) {
      if (source.indexOf(FORBIDDEN_KEYS[i]) !== -1) {
        throw new Error('worker shim must not patch: ' + FORBIDDEN_KEYS[i]);
      }
    }
    return true;
  }

  // Expose the builder AND a wrapping entry point that validates before
  // returning source, so callers cannot accidentally skip the guard.
  globalThis.ssBuildWorkerShim = function (persona) {
    var source = buildWorkerShim(persona);
    validateShim(source);
    return source;
  };
})();
