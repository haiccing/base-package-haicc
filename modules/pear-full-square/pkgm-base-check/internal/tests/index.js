// tests: a module's test page against its tests. test/README.md has a
// section a file, `## \`<file>\``, and in it each test of that file by its
// name, a `- ` entry (README.md beside it). -> [{ check, detail }].
import { readFileSync, readdirSync, existsSync } from 'bare-fs'
import { join } from 'bare-path'

// The names of the tests a file declares: each `test('<name>'` call, its
// quotes undone. A name written as a template is a pattern: what is in
// `${...}` stands for any text, and a leading `${...}: ` may be left out
// (a suite run under several names); one such test may have several
// entries, one for each name it runs under. -> [{ name, pattern }], pattern a
// RegExp or null.
export function testNames (text) {
  const out = []
  for (const m of text.matchAll(/(?<![.\w$`])test\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    const name = m[2].replace(/\\(.)/g, '$1')
    if (m[1] !== '`' || !name.includes('${')) { out.push({ name, pattern: null }); continue }
    const parts = name.split(/\$\{[^}]*\}/)
    const body = parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
    const short = name.replace(/^\$\{[^}]*\}[:\s]*/, '')
    const alt = short !== name ? '|' + short.split(/\$\{[^}]*\}/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') : ''
    out.push({ name, pattern: new RegExp(`^(?:${body}${alt})$`) })
  }
  return out
}

// A test page read: its sections, each its file and its entries; an entry
// running on over indented lines is one. -> { [file]: [entry...] }
export function pageSections (text) {
  const out = {}
  let at = null
  let last = null
  for (const line of text.split('\n')) {
    const h = line.match(/^## `([^`]+)`\s*$/)
    if (h) { at = out[h[1]] = []; last = null; continue }
    if (/^#/.test(line)) { at = null; last = null; continue }
    if (!at) continue
    if (line.startsWith('- ')) { at.push(line.slice(2).trim()); last = at.length - 1 } else if (last !== null && /^\s+\S/.test(line)) at[last] += ' ' + line.trim()
    else last = null
  }
  return out
}

// A module's tests and its page: the page there; a section for every file
// of test/ that declares tests, and none for a file not there (a fixture
// may have one); in each,
// every test by its name and nothing else.
export function checkTestPage (mod) {
  const out = []
  const at = detail => out.push({ check: 'tests', file: 'test/README.md', detail })
  const dir = join(mod, 'test')
  if (!existsSync(dir)) return out
  const all = readdirSync(dir).sort()
  const files = all.filter(f => f.endsWith('.js'))
  const declared = Object.fromEntries(files.map(f => [f, testNames(readFileSync(join(dir, f), 'utf8'))]).filter(([, n]) => n.length))
  if (!Object.keys(declared).length) return out
  if (!existsSync(join(dir, 'README.md'))) { at('not there: the page of its tests'); return out }
  const page = pageSections(readFileSync(join(dir, 'README.md'), 'utf8'))
  for (const f of Object.keys(page)) if (!all.includes(f)) at(`${f}: a section, no such file`)
  for (const [f, names] of Object.entries(declared)) {
    const entries = page[f]
    if (!entries) { at(`${f}: no section`); continue }
    const matched = new Set()
    for (const n of names) {
      const i = entries.findIndex((e, k) => !matched.has(k) && (n.pattern ? n.pattern.test(e) : e === n.name))
      if (i < 0) at(`${f}: not listed: ${n.name}`)
      else matched.add(i)
    }
    // a template run under several names: each entry it fits is its
    entries.forEach((e, k) => { if (!matched.has(k) && names.some(n => n.pattern?.test(e))) matched.add(k) })
    entries.forEach((e, k) => { if (!matched.has(k)) at(`${f}: listed, no such test: ${e}`) })
  }
  return out
}
