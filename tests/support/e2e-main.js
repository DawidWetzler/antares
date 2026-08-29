// Playwright evaluates main-process code without module scope, so `require` is unreachable
// there and a singleton held inside the bundle cannot be reached. This runs first and leaves a
// closure over the main process's own require behind.
globalThis.__requireFromMain = id => require(id);

require('../../dist/main.js');
