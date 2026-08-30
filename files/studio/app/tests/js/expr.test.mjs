import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, evaluate, test as truth, ExprError } from '../../studio/static/expr.js';

const ctx = (self, values = {}) => ({
  self,
  get: (name) => (name in values ? values[name] : null),
  today: new Date(2026, 7, 30), // 2026-08-30, local time
});

const run = (source, self, values) => evaluate(parse(source), ctx(self, values));

test('numeric ranges', () => {
  assert.equal(run('. >= 0 and . <= 120', 45), true);
  assert.equal(run('. >= 0 and . <= 120', 121), false);
  assert.equal(run('. >= 0 and . <= 120', -1), false);
  assert.equal(run('. >= 0 and . <= 120', '45'), true, 'string input is coerced');
});

test('comparison operators', () => {
  assert.equal(run('. > 5', 6), true);
  assert.equal(run('. < 5', 6), false);
  assert.equal(run('. = 5', '5'), true);
  assert.equal(run('. != 5', 4), true);
});

test('references to other questions', () => {
  assert.equal(run('. >= ${start}', '2026-05-02', { start: '2026-05-01' }), true);
  assert.equal(run('. >= ${start}', '2026-04-30', { start: '2026-05-01' }), false);
  assert.equal(run('. > ${hhsize}', 5, { hhsize: 3 }), true);
});

test('and / or / not precedence', () => {
  assert.equal(run('1 = 1 or 1 = 2 and 1 = 3', null), true, 'and binds tighter than or');
  assert.equal(run('(1 = 1 or 1 = 2) and 1 = 3', null), false);
  assert.equal(run('not(. > 5)', 3), true);
});

test('arithmetic', () => {
  assert.equal(run('1 + 2 * 3', null), 7);
  assert.equal(run('(1 + 2) * 3', null), 9);
  assert.equal(run('7 div 2', null), 3.5);
  assert.equal(run('7 mod 2', null), 1);
  assert.equal(run('-3 + 1', null), -2);
  assert.equal(run('${a} + ${b}', null, { a: 2, b: 40 }), 42);
});

test('select_multiple helpers', () => {
  assert.equal(run("selected(., 'en')", 'en fj'), true);
  assert.equal(run("selected(., 'hi')", 'en fj'), false);
  assert.equal(run('count-selected(.) <= 3', 'en fj hi'), true);
  assert.equal(run('count-selected(.) <= 3', 'en fj hi es'), false);
  assert.equal(run('count-selected(.)', ''), 0);
});

test('string functions', () => {
  assert.equal(run('string-length(.) = 8', '12345678'), true);
  assert.equal(run("regex(., '^[0-9]{7,10}$')", '0771234'), true);
  assert.equal(run("regex(., '^[0-9]{7,10}$')", '07712'), false);
  assert.equal(run("contains(., 'foo')", 'a foo b'), true);
  assert.equal(run("starts-with(., 'FJ')", 'FJ-01'), true);
  assert.equal(run("concat(${a}, '-', ${b})", null, { a: 'x', b: 'y' }), 'x-y');
  assert.equal(run("substring(., 0, 3)", 'abcdef'), 'abc');
});

test('dates', () => {
  assert.equal(run('. <= today()', '2026-08-29'), true);
  assert.equal(run('. <= today()', '2026-09-01'), false);
  assert.equal(run('today()', null), '2026-08-30');
});

test('numeric helpers', () => {
  assert.equal(run('int(.)', '7.9'), 7);
  assert.equal(run('round(., 2)', 3.14159), 3.14);
  assert.equal(run('abs(.)', -4), 4);
  assert.equal(run("if(. > 5, 'big', 'small')", 9), 'big');
  assert.equal(run("if(. > 5, 'big', 'small')", 2), 'small');
  assert.equal(run('coalesce(${a}, 0)', null, { a: null }), 0);
});

test('unanswered values behave like ODK', () => {
  // A blank answer compares as not-a-number, so range checks are simply false;
  // the caller is responsible for skipping constraints on blank answers.
  assert.equal(run('. > 5', null), false);
  assert.equal(run('. > 5', ''), false);
  assert.equal(run("selected(., 'x')", null), false);
  assert.equal(run('string-length(.)', null), 0);
});

test('booleans from expressions', () => {
  assert.equal(truth('. > 5', ctx(9)), true);
  assert.equal(truth('. > 5', ctx(1)), false);
  assert.equal(truth("${sex} = '1'", ctx(null, { sex: '1' })), true);
});

test('hyphenated function names are not read as subtraction', () => {
  assert.equal(run('count-selected(.)', 'a b'), 2);
  assert.equal(run('string-length(.) - 1', 'abc'), 2, 'real subtraction still works');
});

test('unsupported syntax is reported, not guessed', () => {
  assert.throws(() => parse('position(..)'), ExprError);
  assert.throws(() => parse('indexed-repeat(${a}, ${b}, 1)'), ExprError);
  assert.throws(() => parse('. >'), ExprError);
  assert.throws(() => parse("'unclosed"), ExprError);
  assert.throws(() => parse('${unclosed'), ExprError);
  assert.throws(() => parse('1 +'), ExprError);
  assert.throws(() => evaluate(parse('once(.)'), ctx(1)), ExprError);
});

test('realistic constraints from the docs', () => {
  assert.equal(run('. >= 0', -5), false);
  assert.equal(run('. > 0 and . <= 30', 30), true);
  assert.equal(run('. > 0 and . <= 30', 31), false);
  assert.equal(run('${end} >= ${start}', null, { end: '2026-01-02', start: '2026-01-01' }), true);
});
