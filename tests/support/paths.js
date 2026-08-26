const path = require('path');
const Module = require('module');
const root = path.join(__dirname, '..', '..');
const aliases = { 'common/': 'src/common/', '@/': 'src/renderer/' };
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
   for (const [prefix, target] of Object.entries(aliases)) {
      if (request.startsWith(prefix))
         return orig.call(this, path.join(root, target, request.slice(prefix.length)), ...rest);
   }
   return orig.call(this, request, ...rest);
};
