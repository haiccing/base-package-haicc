// The code rules on modules written here: one that keeps them, one that
// breaks each.
import test from 'brittle'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'bare-fs'
import { join, dirname } from 'bare-path'
import { tmpdir } from 'bare-os'
import { checkModule, checkPackage, checkText } from '../index.js'

// The samples' imports and references built, so this file itself keeps the rules.
const q = "'"
const from = spec => `from ${q}${spec}${q}`
const ref = 'docs' + '/design/x.md'

function write (dir, files) { for (const [p, t] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), t) } }

test('a module that keeps the rules: none', (t) => {
  const d = mkdtempSync(join(tmpdir(), 'check-'))
  try {
    write(d, { 'test/t.test.js': `import f ${from('other/test/fixture.js')}\n`, 'index.js': `export { a } ${from('./external/a/index.js')}\nimport x ${from('other')}\n`, 'external/a/index.js': `import { b } ${from('../../internal/b.js')}\nexport const a = 1\n`, 'external/a/README.md': '# a\n', 'internal/b.js': 'export const b = 2\n' })
    t.alike(checkModule(d, { ours: ['other'] }), [])
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('a module that breaks each: structure, imports, references', (t) => {
  const d = mkdtempSync(join(tmpdir(), 'check-'))
  try {
    write(d, { 'index.js': `import x ${from('../sibling/index.js')}\nimport y ${from('other/lib/deep.js')}\n// see ${ref}\n`, 'internal/m/index.js': 'export const m = 1\n' })
    t.alike(checkModule(d, { ours: ['other'] }).map(p => `${p.file} ${p.check}`).sort(), ['index.js imports', 'index.js imports', 'index.js transient', 'internal/m structure'].sort())
    t.alike(checkPackage(d).map(p => p.check), ['transient'], 'a package\'s own code: references')
  } finally { rmSync(d, { recursive: true, force: true }) }
})

// The samples written so that this file keeps the rules it tests: a print,
// a catch and a remark are put together from their parts.
const print = 'console' + '.log'
const katch = 'cat' + 'ch'
const say = kind => '/' + '/ ' + kind + ': '
const checks = text => checkText(text).map(p => p.check)

test('logging and handling: code that keeps the rules', (t) => {
  t.alike(checkText([
    'export async function act (exec, { uri }) {',
    "  exec.log('verbose', 'looked', { uri })",
    "  const found = await exec.step('select', r => ({ n: r.length }), () => exec.select(uri))",
    '  try { return JSON.parse(found) } ' + katch + " (err) { throw new Error('not a document', { cause: err }) }",
    '}',
    say('log') + 'in act, above',
    'export const again = exec => act(exec, {})',
    say('log') + 'none (one read)',
    'const one = async (exec, p) => {',
    '  return exec.find(p)',
    '}',
    say('catch') + 'not there: not a folder',
    'const isFolder = f => { try { return stat(f) } ' + katch + ' { return false } }',
    say(katch) + 'gone meanwhile: seen where it went',
    'const read = p => layer.read(p).' + katch + '(() => null)',
    say('console') + "the command line's own output",
    'const out = line => ' + print + '(line)',
    'export function plain (uri) { return uri.split("/") }'
  ].join('\n')), [], 'entries where the context is handed in; a decision said where it is made')
})

test('logging and handling: each rule broken', (t) => {
  t.alike(checks('const out = line => ' + print + '(line)\n'), ['console'], 'a print')
  t.alike(checks('try { a() } ' + katch + ' { b() }\n'), ['catch'], 'an error caught and not looked at')
  t.alike(checks('try { a() } ' + katch + ' (err) { b() }\n'), ['catch'], 'bound, and not used')
  t.alike(checks('const r = p.' + katch + '(() => null)\n'), ['catch'], 'a rejection taken without looking')
  t.alike(checks('const r = p.then(x => x, () => null)\n'), ['catch'], 'the same, as then\'s second')
  t.alike(checks('try { a() } ' + katch + " (err) { throw new Error('worse') }\n"), ['catch', 'cause'], 'an error thrown in place of the one caught')
  t.alike(checks('try { a() } ' + katch + " (err) { log(err); throw new Error('worse') }\n"), ['cause'], 'used, and still not passed on')
  t.alike(checks('try { a() } ' + katch + ' (err) { log(err); throw err }\n'), [], 'thrown again as it is: nothing lost')
  t.alike(checks('export async function act (exec, { uri }) {\n  return exec.read(uri)\n}\n'), ['logging'], 'handed the context, logs nothing')
  t.alike(checks('export const act = async (exec, form) => {\n  return exec.read(form.uri)\n}\n'), ['logging'], 'an arrow')
  t.alike(checks('export const act = exec => exec.read(1)\n'), ['logging'], 'an expression')
  t.alike(checks("export async function act (exec) {\n  exec.log('loud', 'x')\n}\n"), ['logging'], 'a level there is not')
  t.alike(checks("export async function act (exec) {\n  exec.log('info', 'request.metrics', {})\n}\n"), ['request'], 'an entry of the boundary\'s kind')
  t.alike(checks("export async function act (exec) {\n  const t = Date.now()\n  exec.log('verbose', 'x', { ms: Date.now() - t })\n}\n"), ['request', 'request'], 'time taken by the action itself')
  t.alike(checks("export async function act (exec) {\n  exec.log('verbose', 'x')\n  try { await go() } " + katch + ' (err) { return { ok: false, error: err.message } }\n}\n'), ['request'], 'a failure returned as a value')
  t.alike(checks('const t = Date.now()\n'), [], 'time, where no context is handed in: not an action\'s')
  t.ok(checkText('const out = line => ' + print + '(line)\n')[0].detail.startsWith('line 1: '), 'each with its line')
})

test('logging and handling: a module\'s own code, not its tests', (t) => {
  const d = mkdtempSync(join(tmpdir(), 'check-'))
  try {
    const bad = 'try { a() } ' + katch + ' { b() }\n'
    write(d, { 'index.js': bad, 'lib/x.js': bad, 'test/t.test.js': bad, 'validate/v.test.js': bad, 'test/fixture.js': bad })
    t.alike(checkModule(d).map(p => `${p.file} ${p.check}`).sort(), ['index.js catch', 'lib/x.js catch'])
    t.alike(checkPackage(d), [], 'nor a package\'s own entry points')
  } finally { rmSync(d, { recursive: true, force: true }) }
})
