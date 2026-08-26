// The client classes reach for electron-store (MySQLClient.getStructure reads the
// show_table_size setting). Outside a real Electron main process that module throws,
// so tests get an in-memory stand-in.
const Module = require('module');
const settings = new Map();

class FakeStore {
   static initRenderer () {
      // nothing to wire up outside a real main process
   }

   get (key, fallback) {
      return settings.has(key) ? settings.get(key) : fallback;
   }

   set (key, value) {
      settings.set(key, value);
   }

   delete (key) {
      settings.delete(key);
   }
}

FakeStore.settings = settings;

const orig = Module._load;
Module._load = function (request, ...rest) {
   if (request === 'electron-store') return FakeStore;
   return orig.call(this, request, ...rest);
};

module.exports = { FakeStore, settings };
