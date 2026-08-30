// A small evaluator for the subset of XPath that XLSForm expressions use.
//
// It exists so the designer's preview can run relevance, constraints and
// calculations as you type. It is not a complete XPath engine: anything it
// cannot parse raises ExprError, and the preview reports that rule as not
// evaluated rather than guessing at an answer.

export class ExprError extends Error {}

// Hyphenated names must be matched before the '-' operator gets a chance.
const FUNCTIONS = [
  'count-selected', 'string-length', 'selected-at', 'boolean-from-string',
  'format-date', 'decimal-date-time', 'starts-with', 'ends-with',
  'substring-before', 'substring-after', 'regex', 'selected', 'concat',
  'coalesce', 'substring', 'contains', 'translate', 'string', 'number',
  'round', 'int', 'not', 'if', 'today', 'now', 'count', 'sum', 'min', 'max',
  'abs', 'position', 'once', 'uuid', 'true', 'false',
];
const SORTED_FUNCTIONS = [...FUNCTIONS].sort((a, b) => b.length - a.length);

const WORD_OPERATORS = new Set(['and', 'or', 'div', 'mod']);

// -- lexer -----------------------------------------------------------------

function tokenize(source) {
  const tokens = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (/\s/.test(ch)) { i += 1; continue; }

    if (ch === '$' && source[i + 1] === '{') {
      const end = source.indexOf('}', i + 2);
      if (end === -1) throw new ExprError('unclosed ${...} reference');
      tokens.push({ type: 'ref', value: source.slice(i + 2, end).trim() });
      i = end + 1;
      continue;
    }

    if (ch === "'" || ch === '"') {
      const end = source.indexOf(ch, i + 1);
      if (end === -1) throw new ExprError('unclosed string literal');
      tokens.push({ type: 'string', value: source.slice(i + 1, end) });
      i = end + 1;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] || ''))) {
      const match = /^[0-9]*\.?[0-9]+/.exec(source.slice(i));
      tokens.push({ type: 'number', value: Number(match[0]) });
      i += match[0].length;
      continue;
    }

    // '.' on its own is the value of the question being validated.
    if (ch === '.') {
      if (source[i + 1] === '.') throw new ExprError("'..' is not supported in preview");
      tokens.push({ type: 'self' });
      i += 1;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const rest = source.slice(i);
      const fn = SORTED_FUNCTIONS.find(
        (name) => rest.startsWith(name) && !/[A-Za-z0-9_-]/.test(rest[name.length] || ''),
      );
      if (fn) {
        tokens.push({ type: 'name', value: fn });
        i += fn.length;
        continue;
      }
      const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest)[0];
      if (WORD_OPERATORS.has(word)) tokens.push({ type: 'op', value: word });
      else tokens.push({ type: 'name', value: word });
      i += word.length;
      continue;
    }

    const two = source.slice(i, i + 2);
    if (two === '!=' || two === '<=' || two === '>=') {
      tokens.push({ type: 'op', value: two });
      i += 2;
      continue;
    }

    if ('=<>+-*'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i += 1; continue; }
    if (ch === '(' || ch === ')' || ch === ',') { tokens.push({ type: ch }); i += 1; continue; }

    throw new ExprError(`unexpected character '${ch}'`);
  }

  return tokens;
}

// -- parser ----------------------------------------------------------------

const BINARY_LEVELS = [
  ['or'], ['and'], ['=', '!='], ['<', '<=', '>', '>='], ['+', '-'], ['*', 'div', 'mod'],
];

export function parse(source) {
  const tokens = tokenize(String(source ?? ''));
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = (type) => {
    const token = tokens[pos];
    if (!token || token.type !== type) throw new ExprError(`expected ${type}`);
    pos += 1;
    return token;
  };

  function parseBinary(level) {
    if (level === BINARY_LEVELS.length) return parseUnary();
    let left = parseBinary(level + 1);
    for (;;) {
      const token = peek();
      if (!token || token.type !== 'op' || !BINARY_LEVELS[level].includes(token.value)) break;
      pos += 1;
      left = { kind: 'binary', op: token.value, left, right: parseBinary(level + 1) };
    }
    return left;
  }

  function parseUnary() {
    const token = peek();
    if (token && token.type === 'op' && token.value === '-') {
      pos += 1;
      return { kind: 'negate', value: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const token = peek();
    if (!token) throw new ExprError('unexpected end of expression');

    if (token.type === 'number' || token.type === 'string') {
      pos += 1;
      return { kind: 'literal', value: token.value };
    }
    if (token.type === 'self') { pos += 1; return { kind: 'self' }; }
    if (token.type === 'ref') { pos += 1; return { kind: 'ref', name: token.value }; }
    if (token.type === '(') {
      pos += 1;
      const inner = parseBinary(0);
      eat(')');
      return inner;
    }
    if (token.type === 'name') {
      pos += 1;
      if (!peek() || peek().type !== '(') {
        throw new ExprError(`'${token.value}' is not supported in preview`);
      }
      eat('(');
      const args = [];
      if (peek() && peek().type !== ')') {
        args.push(parseBinary(0));
        while (peek() && peek().type === ',') { pos += 1; args.push(parseBinary(0)); }
      }
      eat(')');
      return { kind: 'call', name: token.value, args };
    }
    throw new ExprError(`unexpected token '${token.value ?? token.type}'`);
  }

  const ast = parseBinary(0);
  if (pos !== tokens.length) throw new ExprError('unexpected trailing input');
  return ast;
}

// -- values ----------------------------------------------------------------

const isBlank = (v) => v === null || v === undefined || v === '';

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (isBlank(value)) return NaN;
  return Number(String(value).trim());
}

function toStringValue(value) {
  if (isBlank(value)) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  return !isBlank(value);
}

function compare(op, left, right) {
  const a = toNumber(left);
  const b = toNumber(right);
  const numeric = !Number.isNaN(a) && !Number.isNaN(b);
  // Dates are ISO strings, so string comparison is also chronological.
  const [x, y] = numeric ? [a, b] : [toStringValue(left), toStringValue(right)];
  switch (op) {
    case '=': return x === y;
    case '!=': return x !== y;
    case '<': return x < y;
    case '<=': return x <= y;
    case '>': return x > y;
    case '>=': return x >= y;
    default: throw new ExprError(`unknown operator ${op}`);
  }
}

function tokensOf(value) {
  return toStringValue(value).split(/\s+/).filter(Boolean);
}

function isoDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const CALLS = {
  'not': (a) => !toBoolean(a[0]),
  'if': (a) => (toBoolean(a[0]) ? a[1] : a[2]),
  'selected': (a) => tokensOf(a[0]).includes(toStringValue(a[1])),
  'count-selected': (a) => tokensOf(a[0]).length,
  'selected-at': (a) => tokensOf(a[0])[toNumber(a[1])] ?? '',
  'string-length': (a) => toStringValue(a[0]).length,
  'string': (a) => toStringValue(a[0]),
  'number': (a) => toNumber(a[0]),
  'int': (a) => Math.trunc(toNumber(a[0])),
  'abs': (a) => Math.abs(toNumber(a[0])),
  'round': (a) => {
    const digits = a.length > 1 ? toNumber(a[1]) : 0;
    const factor = 10 ** digits;
    return Math.round(toNumber(a[0]) * factor) / factor;
  },
  'concat': (a) => a.map(toStringValue).join(''),
  'coalesce': (a) => (isBlank(a[0]) ? a[1] : a[0]),
  'contains': (a) => toStringValue(a[0]).includes(toStringValue(a[1])),
  'starts-with': (a) => toStringValue(a[0]).startsWith(toStringValue(a[1])),
  'ends-with': (a) => toStringValue(a[0]).endsWith(toStringValue(a[1])),
  'substring': (a) => {
    const text = toStringValue(a[0]);
    const start = toNumber(a[1]);
    return a.length > 2 ? text.slice(start, toNumber(a[2])) : text.slice(start);
  },
  'substring-before': (a) => {
    const text = toStringValue(a[0]);
    const at = text.indexOf(toStringValue(a[1]));
    return at === -1 ? '' : text.slice(0, at);
  },
  'substring-after': (a) => {
    const text = toStringValue(a[0]);
    const needle = toStringValue(a[1]);
    const at = text.indexOf(needle);
    return at === -1 ? '' : text.slice(at + needle.length);
  },
  'regex': (a) => {
    try {
      return new RegExp(toStringValue(a[1])).test(toStringValue(a[0]));
    } catch (error) {
      throw new ExprError(`invalid regular expression: ${error.message}`);
    }
  },
  'boolean-from-string': (a) => ['true', '1'].includes(toStringValue(a[0]).toLowerCase()),
  'true': () => true,
  'false': () => false,
  'sum': (a) => a.reduce((total, v) => total + (Number.isNaN(toNumber(v)) ? 0 : toNumber(v)), 0),
  'min': (a) => Math.min(...a.map(toNumber)),
  'max': (a) => Math.max(...a.map(toNumber)),
};

export function evaluate(ast, context = {}) {
  const self = () => (context.self === undefined ? null : context.self);
  const lookup = (name) => (context.get ? context.get(name) : null);
  const today = () => isoDate(context.today instanceof Date ? context.today : new Date());

  function walk(node) {
    switch (node.kind) {
      case 'literal': return node.value;
      case 'self': return self();
      case 'ref': return lookup(node.name);
      case 'negate': return -toNumber(walk(node.value));
      case 'binary': {
        const { op } = node;
        if (op === 'and') return toBoolean(walk(node.left)) && toBoolean(walk(node.right));
        if (op === 'or') return toBoolean(walk(node.left)) || toBoolean(walk(node.right));
        const left = walk(node.left);
        const right = walk(node.right);
        if (['=', '!=', '<', '<=', '>', '>='].includes(op)) return compare(op, left, right);
        const a = toNumber(left);
        const b = toNumber(right);
        switch (op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case 'div': return a / b;
          case 'mod': return a % b;
          default: throw new ExprError(`unknown operator ${op}`);
        }
      }
      case 'call': {
        if (node.name === 'today' || node.name === 'now') return today();
        if (node.name === 'count') {
          const value = walk(node.args[0]);
          return Array.isArray(value) ? value.length : tokensOf(value).length;
        }
        if (node.name === 'position' || node.name === 'once' || node.name === 'uuid') {
          throw new ExprError(`${node.name}() is not supported in preview`);
        }
        const fn = CALLS[node.name];
        if (!fn) throw new ExprError(`${node.name}() is not supported in preview`);
        // if() must not evaluate both branches eagerly for side-effect-free
        // expressions it makes no difference, and keeping it simple is worth more.
        return fn(node.args.map(walk));
      }
      default: throw new ExprError('malformed expression');
    }
  }

  return walk(ast);
}

// Convenience for callers that just want a yes/no answer.
export function test(source, context) {
  return toBoolean(evaluate(parse(source), context));
}

export const helpers = { toBoolean, toNumber, toStringValue, isBlank, isoDate };
