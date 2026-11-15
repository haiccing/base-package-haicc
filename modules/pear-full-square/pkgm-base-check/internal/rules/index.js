// rules: the code rules on a module of ours, or on a package's own code
// (README.md beside it). Mechanical: structure, imports, references; and,
// in a module's own code (its tests aside), how it logs and how it handles
// what goes wrong: read from the code, not run.
import { readFileSync, readdirSync, statSync, existsSync } from 'bare-fs'
import { join, dirname, resolve, relative, sep } from 'bare-path'

const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/g
const TRANSIENT = /(?<![\w/-])(docs\/(design|guides|rules)|steps\/\d)[\w./-]*/g

// --- logging and handling ---
// What is decided in the code is said there, in a remark on the line, or
// in the comment lines right above it: `// <kind>: <why>`.
const remarked = (lines, n, kind) => {
  if (lines[n].includes(`// ${kind}:`)) return true
  for (let i = n - 1; i >= 0 && /^\s*\/\//.test(lines[i]); i--) if (new RegExp(`^\\s*// ${kind}:`).test(lines[i])) return true
  return false
}
const lineOf = (text, index) => text.slice(0, index).split('\n').length - 1
// The block opened by the brace at `open`: its text, braces matched
// (strings and templates balance their own, near enough for a check).
function block (text, open) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return text.slice(open, i + 1)
  }
  return text.slice(open)
}
// The body of the function whose signature starts at `index` (line n): past
// its parameters (their parentheses matched), a block; or an arrow's
// expression: the rest of its line and the lines indented under it.
function bodyOf (text, lines, index, n) {
  let i = index
  const paren = text.indexOf('(', index)
  const arrow = text.indexOf('=>', index)
  if (paren >= 0 && (arrow < 0 || paren < arrow)) {
    let depth = 0
    for (i = paren; i < text.length; i++) {
      if (text[i] === '(') depth++
      else if (text[i] === ')' && --depth === 0) { i++; break }
    }
  }
  let rest = text.slice(i)
  const isArrow = /^\s*=>/.test(rest) || (paren < 0 || (arrow >= 0 && arrow < paren))
  if (isArrow) rest = text.slice(text.indexOf('=>', i === index ? index : i) + 2)
  if (/^\s*\{/.test(rest)) return block(rest, rest.indexOf('{'))
  if (!isArrow) return ''
  // an expression: this line's rest, and what is indented under the signature
  const indent = lines[n].match(/^\s*/)[0].length
  const out = [rest.slice(0, rest.indexOf('\n') < 0 ? rest.length : rest.indexOf('\n'))]
  for (let k = n + 1; k < lines.length && lines[k].trim() !== '' && lines[k].match(/^\s*/)[0].length > indent; k++) out.push(lines[k])
  return out.join('\n')
}

// A function handed the execution context: its first parameter exec.
const TAKES_EXEC = /(?:function\s+\w*\s*\(\s*exec\b|=\s*(?:async\s+)?\(\s*exec\b|=\s*(?:async\s+)?exec\s*=>|\(\s*async\s+exec\s*=>)/g
const LOGS = /\bexec\.(log|step)\s*\(/
const LEVELS = ['error', 'warn', 'info', 'verbose', 'debug']

// The rules on one file's text: [{ check, detail }].
//   console   nothing printed: code run under a request logs through
//             exec.log; a print that is meant says why (// console:)
//   catch     an error caught is used; one taken without looking says what
//             is expected (// catch:)
//   cause     an error thrown in a catch carries the one caught
//   logging   a function handed the execution context logs (exec.log,
//             exec.step), or says where its entries are, or why it has
//             none (// log:); a level written is one there is
//   request   what is the request's is not done by an action: no time
//             taken, no failure returned as a value, no entry of the
//             boundary's kind
export function checkText (text) {
  const problems = []
  const lines = text.split('\n')
  const at = (check, n, detail) => problems.push({ check, detail: `line ${n + 1}: ${detail}` })
  for (const m of text.matchAll(/\bconsole\.(log|error|warn|info|debug)\s*\(/g)) {
    const n = lineOf(text, m.index)
    if (!remarked(lines, n, 'console')) at('console', n, `console.${m[1]}: log through the execution context (or say why here: // console: <why>)`)
  }
  // catches: try's, then the handlers of a promise
  for (const m of text.matchAll(/\bcatch\s*(?:\(\s*(\w+)\s*\)\s*)?\{/g)) {
    const n = lineOf(text, m.index)
    const body = block(text, m.index + m[0].length - 1)
    const used = m[1] && new RegExp(`\\b${m[1]}\\b`).test(body)
    if (!used && !remarked(lines, n, 'catch')) at('catch', n, 'an error caught and not used (use it, or say what is expected: // catch: <what>)')
    if (/\bthrow\s+new\s+\w+\s*\(/.test(body) && !/\bcause\b/.test(body)) at('cause', n, 'an error thrown in a catch without the one caught ({ cause })')
  }
  for (const m of text.matchAll(/\.catch\(\s*\(\s*\)\s*=>|\.then\((?:[^()]|\([^()]*\))*,\s*\(\s*\)\s*=>/g)) {
    const n = lineOf(text, m.index + m[0].length)
    if (!remarked(lines, n, 'catch')) at('catch', n, 'a rejection taken without looking (name what is expected: // catch: <what>)')
  }
  // functions handed the execution context
  let takes = false
  for (const m of text.matchAll(TAKES_EXEC)) {
    takes = true
    const n = lineOf(text, m.index)
    if (!LOGS.test(bodyOf(text, lines, m.index, n)) && !remarked(lines, n, 'log')) at('logging', n, 'handed the execution context and logs nothing (exec.log, exec.step; or say where its entries are: // log: <where, or why none>)')
  }
  for (const m of text.matchAll(/\bexec\.log\s*\(\s*(['"])([^'"]*)\1\s*,\s*(['"])([^'"]*)\3/g)) {
    const n = lineOf(text, m.index)
    if (!LEVELS.includes(m[2])) at('logging', n, `not a log level: ${m[2]} (${LEVELS.join(', ')})`)
    if (/^(request|train)\./.test(m[4])) at('request', n, `${m[4]}: an entry of the boundary's kind, written by an action`)
  }
  if (takes) {
    for (const m of text.matchAll(/\b(Date\.now|performance\.now|hrtime)\s*\(/g)) {
      const n = lineOf(text, m.index)
      if (!remarked(lines, n, 'time')) at('request', n, `${m[1]}: an action takes no time itself (exec.step measures a step; or say why here: // time: <why>)`)
    }
    for (const m of text.matchAll(/\bcatch\s*\(\s*(\w+)\s*\)\s*\{/g)) {
      const body = block(text, m.index + m[0].length - 1)
      if (new RegExp(`\\breturn\\b[^\\n]*\\b${m[1]}\\.message`).test(body)) at('request', lineOf(text, m.index), 'a failure returned as a value: an action throws, the request records it')
    }
  }
  return problems
}

// A module's own code: not its tests (test/, validate/, *.test.js).
const isTest = rel => /^(test|validate)\//.test(rel) || /\.test\.(c|m)?js$/.test(rel)

// The .js files of a folder, its node_modules aside.
export function jsFiles (dir) {
  const out = []
  for (const n of readdirSync(dir).sort()) {
    if (n === 'node_modules' || n.startsWith('.')) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...jsFiles(p))
    else if (/\.(c|m)?js$/.test(n)) out.push(p)
  }
  return out
}

// The rules on one module of ours, its folder: [{ file, check, detail }].
//   ours   our modules' names (imported by name, never into their files)
export function checkModule (dir, { ours = [] } = {}) {
  const problems = []
  const at = (file, check, detail) => problems.push({ file: relative(dir, file).split(sep).join('/') || '.', check, detail })
  // structure: a method directory, its code and its README
  for (const group of ['external', 'internal']) {
    const g = join(dir, group)
    if (!existsSync(g)) continue
    for (const n of readdirSync(g).sort()) {
      const m = join(g, n)
      if (!statSync(m).isDirectory()) continue
      for (const f of ['index.js', 'README.md']) if (!existsSync(join(m, f))) at(m, 'structure', `${group}/${n}: no ${f}`)
    }
  }
  for (const file of jsFiles(dir)) {
    const text = readFileSync(file, 'utf8')
    for (const [, , spec] of text.matchAll(SPEC)) {
      if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec)
        if (!(target + sep).startsWith(resolve(dir) + sep)) at(file, 'imports', `${spec}: out of the module (import it by name)`)
        continue
      }
      const [first, second] = spec.split('/')
      const name = first.startsWith('@') ? `${first}/${second}` : first
      // a test may share another module's test helpers, by name: <module>/test/...
      const sharing = relative(dir, file).split(sep)[0] === 'test' && spec.startsWith(`${name}/test/`)
      if (ours.includes(name) && spec !== name && !sharing) at(file, 'imports', `${spec}: into another module's files (import ${name})`)
    }
    const refs = [...new Set(text.match(TRANSIENT) ?? [])]
    if (refs.length) at(file, 'transient', refs.join(', '))
    if (!isTest(relative(dir, file).split(sep).join('/'))) for (const p of checkText(text)) at(file, p.check, p.detail)
  }
  return problems
}

// The rules on a package's own code (its entry points, its test runners):
// references only; it reaches its modules by path, as it must.
export function checkPackage (dir) {
  const problems = []
  for (const file of jsFiles(dir).filter(f => !relative(dir, f).startsWith('modules'))) {
    const refs = [...new Set(readFileSync(file, 'utf8').match(TRANSIENT) ?? [])]
    if (refs.length) problems.push({ file: relative(dir, file).split(sep).join('/'), check: 'transient', detail: refs.join(', ') })
  }
  return problems
}
