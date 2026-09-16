#!/usr/bin/env node
'use strict';

/**
 * Local launcher for the full web app.
 *
 * Runs the Express server on your own machine and opens it in the browser.
 * Running locally is the fully-featured mode: because your home connection is
 * not treated as a datacenter, every input type works — numeric IDs, numeric
 * profile URLs, usernames, and share links.
 *
 * Usage:
 *   npm run local                 # start on port 3000 (or $PORT) and open browser
 *   npm run local -- --port 4000  # custom port
 *   npm run local -- --no-open    # do not open a browser
 *   npm run local -- --help
 */

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'server.js');

function parseArgs(argv) {
  const opts = { open: true, port: process.env.PORT || '3000' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--no-open') opts.open = false;
    else if (arg === '--port' || arg === '-p') opts.port = argv[++i];
    else if (arg.startsWith('--port=')) opts.port = arg.split('=')[1];
  }
  return opts;
}

function printHelp() {
  console.log(`
Run the Facebook Profile Picture Downloader locally (all features enabled).

Usage:
  npm run local [-- --port <n>] [-- --no-open]

Options:
  -p, --port <n>   Port to listen on (default: 3000 or $PORT)
      --no-open    Start the server without opening a browser
  -h, --help       Show this message

Why run locally?
  Facebook withholds username and share-link data from cloud/datacenter IPs.
  On a normal home connection, every input type works — including usernames
  like "zuck" and share links such as facebook.com/share/...

Then open the printed URL, or press Ctrl+C to stop the server.
`);
}

/** Polls the health endpoint until the server responds or the timeout elapses. */
function waitForServer(port, timeoutMs = 15000) {
  const started = Date.now();
  return new Promise(resolve => {
    const attempt = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 1500 }, res => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) return resolve(false);
        setTimeout(attempt, 300);
      });
      req.on('timeout', () => {
        req.destroy();
        if (Date.now() - started > timeoutMs) return resolve(false);
        setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

function openBrowser(url) {
  const platform = process.platform;
  let command;
  let args;

  if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '""', url];
  } else if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {
      console.log(`Could not open a browser automatically. Open this URL manually: ${url}`);
    });
    child.unref();
  } catch {
    console.log(`Could not open a browser automatically. Open this URL manually: ${url}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  const port = String(opts.port || '3000');
  const url = `http://localhost:${port}`;

  console.log('Starting Facebook Profile Picture Downloader locally...');
  console.log('All input types are enabled on a local connection (ID, URL, username, share link).');
  console.log('');

  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, PORT: port },
    stdio: 'inherit',
  });

  const shutdown = signal => {
    if (!child.killed) child.kill(signal);
  };
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });

  child.on('exit', code => {
    process.exit(code === null ? 0 : code);
  });

  const ready = await waitForServer(port);
  if (ready) {
    console.log('');
    console.log(`  ✅ Running at ${url}`);
    console.log('     Press Ctrl+C to stop.');
    console.log('');
    if (opts.open) openBrowser(url);
  } else {
    console.log('');
    console.log(`  ⚠️  Could not confirm the server started on port ${port}.`);
    console.log('     Check the log output above (the port may already be in use).');
  }
}

module.exports = { parseArgs, printHelp };

if (require.main === module) {
  main().catch(err => {
    console.error('Failed to start:', err && err.message ? err.message : err);
    process.exit(1);
  });
}