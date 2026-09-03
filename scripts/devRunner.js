process.env.NODE_ENV = 'development';
// process.env.ELECTRON_ENABLE_LOGGING = true
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = false;

const electron = require('electron');
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const kill = require('tree-kill');

const path = require('path');
const { styleText } = require('util');
const { spawn } = require('child_process');

const mainConfig = require('../webpack.main.config');
const rendererConfig = require('../webpack.renderer.config');
const workersConfig = require('../webpack.workers.config');

let electronProcess = null;
let manualRestart = null;
const remoteDebugging = process.argv.includes('--remote-debug');

if (remoteDebugging) {
   // disable devtools open in electron
   process.env.RENDERER_REMOTE_DEBUGGING = true;
}

async function killElectron (pid) {
   return new Promise((resolve, reject) => {
      if (pid) {
         kill(pid, 'SIGKILL', err => {
            if (err) reject(err);

            resolve();
         });
      }
      else
         resolve();
   });
}

function logCompileResult (name, compilation) {
   if (compilation.errors.length)
      console.error(styleText('red', `\nFailed to compile ${name} script, ${compilation.errors.length} error(s) above`));
   else
      console.log(styleText('gray', `\nCompiled ${name} script!`));
}

async function restartElectron () {
   console.log(styleText('gray', '\nStarting electron...'));

   const { pid } = electronProcess || {};
   await killElectron(pid);

   electronProcess = spawn(electron, [
      path.join(__dirname, '../dist/main.js'),
      // '--enable-logging', // Enable to show logs from all electron processes
      remoteDebugging ? '--inspect=9222' : '',
      remoteDebugging ? '--remote-debugging-port=9223' : ''
   ]);

   electronProcess.stdout.on('data', data => {
      console.log(styleText('white', data.toString()));
   });

   electronProcess.stderr.on('data', data => {
      console.error(styleText('red', data.toString()));
   });

   electronProcess.on('exit', () => {
      if (!manualRestart) process.exit(0);
   });
}
function startWorkers () {
   const compiler = webpack(workersConfig);
   const { name } = compiler;

   compiler.hooks.afterEmit.tap('afterEmit', compilation => {
      logCompileResult(name, compilation);
      console.log(styleText('gray', `\nWatching file changes for ${name} script...`));
   });

   compiler.watch({ aggregateTimeout: 500 }, err => {
      if (err) console.error(styleText('red', String(err)));
   });
}

function startMain () {
   const compiler = webpack(mainConfig);
   const { name } = compiler;

   compiler.hooks.afterEmit.tap('afterEmit', async compilation => {
      logCompileResult(name, compilation);

      manualRestart = true;
      await restartElectron();
      startWorkers();

      setTimeout(() => {
         manualRestart = false;
      }, 2500);

      console.log(styleText('gray', `\nWatching file changes for ${name} script...`));
   });

   compiler.watch({ aggregateTimeout: 500 }, err => {
      if (err) console.error(styleText('red', String(err)));
   });
}

function startRenderer (callback) {
   const compiler = webpack(rendererConfig);
   const { name } = compiler;

   compiler.hooks.afterEmit.tap('afterEmit', compilation => {
      logCompileResult(name, compilation);
      console.log(styleText('gray', `\nWatching file changes for ${name} script...`));
   });

   const server = new WebpackDevServer({
      port: 9080,
      hot: true,
      client: {
         overlay: true,
         logging: 'warn'
      }
   }, compiler);

   server.startCallback(err => {
      if (err) console.error(styleText('red', String(err)));

      callback();
   });
}

startRenderer(startMain);
