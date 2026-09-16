#!/usr/bin/env node
'use strict';

/**
 * Local numeric-ID resolver.
 *
 * Facebook hides the username -> numeric-ID mapping from cloud/datacenter IPs
 * (Render, AWS, etc.) but serves it to normal residential connections. Run this
 * on your own machine to turn a username or share link into a numeric ID, then
 * paste that numeric ID (or profile.php?id=... link) into the hosted app, where
 * it works reliably.
 *
 * Usage:
 *   node resolve-id.js zuck
 *   node resolve-id.js https://www.facebook.com/zuck
 *   node resolve-id.js https://www.facebook.com/share/1EMhdXTEaV/
 *   node resolve-id.js --json zuck
 */

const { resolveProfileLocally } = require('./server.js');

function printUsage() {
  console.log(`
Find the numeric Facebook profile ID for a username or share link.

Usage:
  node resolve-id.js <username | profile-url | share-url | numeric-id> [...more]

Options:
  --json    Print raw JSON instead of a formatted report
  --help    Show this message

Examples:
  node resolve-id.js zuck
  node resolve-id.js https://www.facebook.com/zuck
  node resolve-id.js https://www.facebook.com/share/1EMhdXTEaV/

Why run this locally?
  Facebook blocks username lookups from cloud/datacenter IPs, so the hosted app
  cannot always resolve them. Your home connection usually can. Take the numeric
  ID this prints and use it in the hosted app (or in a profile.php?id=... link).
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const asJson = args.includes('--json');
  const inputs = args.filter(a => !a.startsWith('--'));

  if (inputs.length === 0) {
    printUsage();
    process.exit(1);
  }

  const results = [];
  for (const input of inputs) {
    const result = await resolveProfileLocally(input);
    results.push(result);

    if (asJson) continue;

    console.log('');
    console.log('Input      : ' + input);
    if (!result.success) {
      console.log('Result     : FAILED');
      console.log('Reason     : ' + result.error);
      if (/shared|numeric|login wall/i.test(result.error)) {
        console.log('Suggestion : Run this from a normal residential connection (not a VPN,');
        console.log('             proxy, or cloud server) and try again.');
      }
      continue;
    }

    console.log('Name       : ' + (result.name || '(not exposed)'));
    console.log('Numeric ID : ' + (result.numericId || '(not found)'));
    if (result.imageUrl) {
      console.log('Image      : ' + result.imageUrl);
      if (result.mxResolution) console.log('Resolution : ' + result.mxResolution);
    }
    if (result.note) console.log('Note       : ' + result.note);

    if (result.numericId) {
      console.log('');
      console.log('Use this in the hosted app:');
      console.log('  ' + result.numericId);
      console.log('  https://www.facebook.com/profile.php?id=' + result.numericId);
    } else {
      console.log('');
      console.log('No numeric ID was exposed for this input.');
    }
  }

  if (asJson) {
    console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  }

  console.log('');
  process.exit(results.every(r => r.success) ? 0 : 1);
}

main().catch(err => {
  console.error('Unexpected error:', err && err.message ? err.message : err);
  process.exit(1);
});
