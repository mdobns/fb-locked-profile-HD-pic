'use strict';

/**
 * Tests for the local launcher's argument parsing.
 * Kept separate so requiring the launcher module never starts a server.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs } = require('../scripts/start-local.js');

test('start-local parseArgs: defaults', () => {
  const saved = process.env.PORT;
  delete process.env.PORT;
  const opts = parseArgs([]);
  assert.equal(opts.port, '3000');
  assert.equal(opts.open, true);
  assert.equal(opts.help, undefined);
  if (saved === undefined) delete process.env.PORT;
  else process.env.PORT = saved;
});

test('start-local parseArgs: --no-open disables browser launch', () => {
  assert.equal(parseArgs(['--no-open']).open, false);
});

test('start-local parseArgs: --port and -p', () => {
  assert.equal(parseArgs(['--port', '4000']).port, '4000');
  assert.equal(parseArgs(['-p', '5000']).port, '5000');
  assert.equal(parseArgs(['--port=6000']).port, '6000');
});

test('start-local parseArgs: --help', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
});

test('start-local parseArgs: honours $PORT as the default', () => {
  const saved = process.env.PORT;
  process.env.PORT = '7777';
  assert.equal(parseArgs([]).port, '7777');
  if (saved === undefined) delete process.env.PORT;
  else process.env.PORT = saved;
});
