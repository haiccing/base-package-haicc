// info: a README read (its levels, its menus), the README rules, and an
// mrepo's info layer: its pages addressed by keywords, from the top down
// (README.md beside it).
import { posix } from 'bare-path'
import { registry } from 'mycelium-value-avro'

// The layer the pages are extracted into.
export const LAYER = 'info'
// The two menus: the folders below, the packages an mrepo includes.
export const MENU = 'Links'
export const INCLUDED = 'Included packages'
// What extraction reads of a package's files (its bundle's): its READMEs,
// its package.json, its list, its third-party code's record, the schemas
// it carries, and its how-tos' scripts (each at howto/<name>/steps.haicc, beside its page).
export const STEPS = 'steps.haicc'
// (a schema a package carries: its own, its modules')
const SCHEMA = /^\/(modules\/[^/]+\/[^/]+\/)?schemas\/[^/]+\.json$/
export const WANTED = k => k.endsWith('/README.md') || k === '/package.json' || k === '/mrepo/packages/.layer.json' || k === '/modules/third-party.json' || SCHEMA.test(k) || (k.startsWith('/howto/') && k.endsWith(`/${STEPS}`))

// A how-to's page with its steps: its section ## Steps (made before ##
// Notes, or last, where it has none) holds the script as it is, a fact
// once: what the page shows is what a run runs. Any other page as it is.
export function withSteps (text, script) {
  const lines = String(text).replace(/\r/g, '').split('\n')
  let code = false
  const heads = []
  lines.forEach((l, i) => { if (l.startsWith('```')) code = !code; else if (!code && l.startsWith('## ')) heads.push([i, l.slice(3).trim()]) })
  const block = ['## Steps', '', '```haicc', ...String(script).replace(/\r/g, '').replace(/\n+$/, '').split('\n'), '```', '']
  const at = heads.findIndex(([, t]) => t === 'Steps')
  if (at !== -1) {
    const end = heads[at + 1]?.[0] ?? lines.length
    return [...lines.slice(0, heads[at][0]), ...block, ...lines.slice(end)].join('\n').replace(/\n+$/, '\n')
  }
  const notes = heads.find(([, t]) => t === 'Notes')?.[0] ?? null
  const body = lines.join('\n').replace(/\n+$/, '').split('\n')
  return (notes === null ? [...body, '', ...block] : [...lines.slice(0, notes), ...block, ...lines.slice(notes)]).join('\n').replace(/\n+$/, '\n')
}
// A README's bytes as the layer holds it: a how-to's with its steps.
const pageOf = (files, path) => {
  const script = path.startsWith('/howto/') ? files[path.replace(/README\.md$/, STEPS)] : null
  return script ? Buffer.from(withSteps(Buffer.from(files[path]).toString(), Buffer.from(script).toString())) : Buffer.from(files[path])
}

// The top keyword; the two pages made at extraction.
export const TOP = '.'
export const GENERATED = ['modules', 'third-party', 'schemas']

// The first sentence: up to the first full stop followed by a space or the
// end, outside code spans (`package.json`).
function firstSentence (t) {
  let code = false
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '`') code = !code
    else if (!code && t[i] === '.' && (i + 1 === t.length || t[i + 1] === ' ')) return t.slice(0, i + 1)
  }
  return t
}
// The first paragraph that is prose: no table, no code, no list.
const firstProse = text => (String(text).split(/\n\s*\n/).find(p => p.trim() && !/^\s*(\||```|<|[-*]\s)/.test(p)) ?? '').replace(/\s+/g, ' ').trim()

// A word in its keyword form: lowercase, a hyphen between words, nothing
// else ("A structure unit" a-structure-unit, `package.json` package-json).
export const keyword = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
// An included package's keyword: its name without the prefix, the first
// two words (base-package-boot boot, base-docs-package package).
export const packageKeyword = pkg => { const name = pkg.split('/').pop(); const w = name.split('-'); return w.length > 2 ? w.slice(2).join('-') : name }
// A package's keywords in full form: its name fully qualified,
// <org>/<package> (haiccing/base-package-boot), as a package is always
// named: every package alike, the mrepo's own too; no two the same.
export const packageKey = pkg => pkg

// The links of a list, in order: [{ label, target }].
const listed = text => [...String(text).matchAll(/^\s*[-*]\s+\[([^\]]+)\]\(([^)\s]+)\)/gm)].map(m => ({ label: m[1], target: m[2] }))
// The relative links of a README without a menu (the old form: a table,
// a list in its summary) to what is below it, outside code blocks, in
// order; a link up, to a sibling, is a reference.
const loose = text => {
  let code = false
  const prose = String(text).split('\n').filter(l => { if (l.startsWith('```')) code = !code; return !code && !l.startsWith('```') }).join('\n')
  return [...prose.matchAll(/\[([^\]]+)\]\(([^)\s#]+)\)/g)].map(m => ({ label: m[1].replace(/`/g, ''), target: m[2] })).filter(l => !/^[a-z]+:/.test(l.target) && !l.target.startsWith('../') && /(\/|\.md)$/.test(l.target))
}

// A README read: its title, one-liner, summary, sections (in order, the
// menus not among them), its menu, its included packages, and the links of
// a table where it has no menu (the old form).
export function parse (text) {
  const lines = String(text).replace(/\r/g, '').split('\n')
  const at = lines.findIndex(l => l.startsWith('# '))
  const title = at === -1 ? '' : lines[at].slice(2).trim()
  const body = lines.slice(at + 1)
  let code = false
  const heading = body.map(l => { if (l.startsWith('```')) code = !code; return !code && l.startsWith('## ') })
  const first = heading.indexOf(true)
  const summary = (first === -1 ? body : body.slice(0, first)).join('\n').trim()
  const all = []
  if (first !== -1) {
    let cur = null
    body.slice(first).forEach((l, i) => {
      if (heading[first + i]) { cur = { title: l.slice(3).trim(), lines: [] }; all.push(cur) } else cur.lines.push(l)
    })
  }
  const sections = all.map(s => ({ title: s.title, text: s.lines.join('\n').trim() }))
  const named = t => sections.find(s => s.title === t)
  const menu = named(MENU) ? listed(named(MENU).text) : null
  const included = named(INCLUDED) ? listed(named(INCLUDED).text) : null
  const table = menu ? [] : loose([summary, ...sections.filter(s => s.title !== INCLUDED).map(s => s.text)].join('\n\n'))
  const oneliner = firstSentence(firstProse(summary))
  return { title, oneliner, summary, sections: sections.filter(s => s.title !== MENU && s.title !== INCLUDED), menu, included, table, first: sections[0]?.title ?? null }
}

// The rules on one README's text (haiccing/base-docs-package,
// "READMEs"): [[check, detail]...]. Its shape, its length, its references,
// its menu's form; where the menus point is the extraction's to check.
export function check (text) {
  const r = parse(text)
  const out = []
  if (!r.oneliner) out.push(['oneliner', 'none'])
  else {
    if (r.oneliner.length > 120) out.push(['oneliner', `${r.oneliner.length} characters`])
    if (/[()]/.test(r.oneliner)) out.push(['oneliner', 'parentheses'])
    if (!/[.]$/.test(r.oneliner)) out.push(['oneliner', `not one sentence: "${r.oneliner.slice(0, 60)}"`])
  }
  const words = r.summary.split('\n').filter(l => !l.trim().startsWith('|')).join(' ').split(/\s+/).filter(Boolean).length
  if (words > 100) out.push(['summary', `${words} words`])
  for (const s of r.sections) if (!/^`?[\w.-]+`?$/.test(s.title) && (s.title.split(/\s+/).length > 3 || /[:;,.()`]/.test(s.title))) out.push(['sections', s.title])
  const transient = String(text).match(/(?<![\w/-])(docs\/(design|guides|rules|readme)|steps\/\d)[\w./-]*|[\w.-]*dev-env-\d[\w.-]*|\bdev(?:elopment)?[ -]repo(?:sitor(?:y|ies))?\b/gi) ?? []
  if (transient.length) out.push(['transient', [...new Set(transient)].join(', ')])
  if (r.table.length) out.push(['menu', 'links, not a menu (## Links)'])
  if (r.menu && r.first !== MENU) out.push(['menu', `## ${MENU} is not its first section`])
  return out
}

// A module's place: /modules/<org>/<module>/... -> { module, rest }.
const moduleOf = path => { const m = path.match(/^\/modules\/([^/]+)\/([^/]+)(\/.*)$/); return m && m[1] !== 'node_modules' ? { module: `${m[1]}/${m[2]}`, rest: m[3] } : null }
// A schema as a row: its URI (its name's), its fingerprint, its fields;
// named types it refers to found among those read before it.
function schemaRow (schema, reg) {
  const { fingerprint, uri } = reg.add(schema)
  const t = reg.type(fingerprint)
  const fields = (t.underlyingType ?? t).fields?.map(f => `\`${f.name}\``).join(', ') ?? `\`${JSON.stringify(t.schema())}\``
  return { fingerprint, uri, name: (t.underlyingType ?? t).name ?? null, fields }
}
const family = name => name.split('-').slice(0, name.startsWith('mrepo-') || name.startsWith('pkgm-') ? 2 : 1).join('-')

// The info layer from an mrepo's packages, in deploy order, the mrepo's
// own last: each { pkg, files: { path: bytes } (its READMEs, its
// package.json, its list, its third-party.json), paths: [its bundle's
// files], documented?: true when it is documented only, beyond the
// list (documents) }. -> the files to write, by path in the layer: each
// page once at its source's place, the pages made here; split on
// package: each package's index beside its pages,
// packages/<org>/<package>/index.json (its short keyword -> its choices,
// one a page or a section that keyword reaches: [{ page, section?, see?,
// oneliner, below, generated? }]; '.' its README), the mrepo's own
// keywords in index.json (the top, the organisations, modules,
// third-party, schemas), keywords.json (a short keyword -> the packages
// that have it), packages.json (each package, the contexts: { oneliner,
// own?, documented? }), problems.json ([{ keyword?, page?, check, detail
// }]).
export function extract (packages, { alone = false } = {}) {
  const out = {}
  // (the schemas read, in memory: what each is)
  const reg = registry()
  const index = {}
  const problems = []
  const byName = Object.fromEntries(packages.map(p => [p.pkg.split('/').pop(), p]))
  // the mrepo's own: the last of its list (the documented come after it)
  const own = packages.filter(p => !p.documented).pop()
  // each module once: its first carrier in deploy order; a copy that
  // differs, a problem
  const carrier = {}
  for (const p of packages) {
    for (const path of Object.keys(p.files)) {
      const m = moduleOf(path)
      if (!m || !path.endsWith('/README.md')) continue
      const c = carrier[m.module]
      if (!c) { carrier[m.module] = p; continue }
      if (c !== p && c.files[path] && !Buffer.from(c.files[path]).equals(Buffer.from(p.files[path]))) problems.push({ page: `modules/${m.module}${m.rest}`, check: 'module', detail: `its copy in ${p.pkg} differs from ${c.pkg}'s` })
    }
  }
  // a README's place in the layer: a module's once, a package's under it
  const placed = (p, path) => { const m = moduleOf(path); return m ? { p: carrier[m.module], path, at: `/modules/${m.module}${m.rest}` } : { p, path, at: `/packages/${p.pkg}${path}` } }
  const reached = new Set()
  const checked = new Set()
  const put = ({ p, path, at }) => {
    if (out[at]) return parse(out[at].toString())
    out[at] = pageOf(p.files, path)
    const text = out[at].toString()
    if (!checked.has(at)) { checked.add(at); for (const [c, d] of check(text)) problems.push({ page: at.slice(1).replace(/\/README\.md$/, ''), check: c, detail: d }) }
    return parse(text)
  }
  // a choice at a keyword: one page, or one section of it, once
  const choose = (k, c) => {
    const all = index[k] ??= []
    const same = all.find(x => x.page === c.page && x.section === c.section)
    if (same) return null
    all.push(c)
    return c
  }
  const below = (c, child) => { if (!c.below.includes(child)) c.below.push(child) }
  // a page at a keyword, and all below it: its menu (or its table, the old
  // form), its sections; a page above it not again. A link to a module's
  // top points to its one place (modules/<module>), not walked again; at
  // the top, modules and third-party are the generated pages'.
  const walk = (k, src, above = []) => {
    reached.add(`${src.p.pkg}:${src.path}`)
    const r = put(src)
    const c = choose(k, { page: src.at.slice(1), oneliner: r.oneliner, below: [] })
    if (!c || above.includes(src.at)) return c
    const chain = [...above, src.at]
    for (const l of r.menu ?? r.table) {
      if (/^[a-z]+:/.test(l.target)) continue
      const target = posix.normalize(posix.join(posix.dirname(src.path), l.target))
      const readme = target.endsWith('.md') ? target : posix.join(target, 'README.md')
      if (!src.p.files[readme]) { problems.push({ keyword: k, page: src.at.slice(1).replace(/\/README\.md$/, ''), check: 'links', detail: `${l.target}: nothing there` }); continue }
      const label = keyword(l.label.replace(/\/$/, '').split('/').pop())
      if (k === TOP && GENERATED.includes(label)) { reached.add(`${src.p.pkg}:${readme}`); continue }
      const child = k === TOP ? label : `${k}/${label}`
      below(c, child)
      const m = moduleOf(readme)
      if (m && m.rest === '/README.md') { reached.add(`${carrier[m.module].pkg}:${readme}`); choose(child, { page: `modules/${m.module}/README.md`, see: `modules/${m.module.split('/')[1]}`, oneliner: parse(src.p.files[readme].toString()).oneliner, below: [] }); continue }
      walk(child, placed(src.p, readme), chain)
    }
    for (const s of r.sections) {
      const child = k === TOP ? keyword(s.title) : `${k}/${keyword(s.title)}`
      below(c, child)
      choose(child, { page: src.at.slice(1), section: s.title, oneliner: firstSentence(firstProse(s.text)), below: [] })
    }
    return c
  }
  // a package's own: its README at its keyword; its included packages,
  // against its list
  const listOf = p => { const b = p.files['/mrepo/packages/.layer.json']; if (!b) return null; try { return JSON.parse(b.toString()).packages ?? null } catch (err) { problems.push({ page: `packages/${p.pkg}/mrepo/packages/.layer.json`, check: 'list', detail: err.message }); return null } }
  // the organisations, each a node below the top: its packages below it,
  // by their keywords, in the order they were listed
  const orgs = {}
  const listed = new Set()
  const under = q => {
    const k = packageKey(q.pkg)
    if (!q.files['/README.md']) { problems.push({ keyword: k, check: 'readme', detail: `${q.pkg}: none` }); return }
    const org = q.pkg.split('/')[0]
    if (!orgs[org]) {
      orgs[org] = []
      below(index[TOP][0], org)
      choose(org, { page: `packages/${org}/README.md`, oneliner: `The ${org} packages of this mrepo, each by its name.`, below: [], generated: true })
    }
    if (listed.has(q.pkg)) return
    listed.add(q.pkg)
    orgs[org].push(q)
    below(index[org][0], k)
    walk(k, { p: q, path: '/README.md', at: `/packages/${q.pkg}/README.md` })
  }
  // the top: the mrepo's own package's README, the page; below it the
  // organisations (its own package there too, at its full keyword) and
  // what is made here
  const top = p => {
    if (!p.files['/README.md']) { problems.push({ page: `packages/${p.pkg}`, check: 'readme', detail: 'none' }); return }
    const r = put({ p, path: '/README.md', at: `/packages/${p.pkg}/README.md` })
    choose(TOP, { page: `packages/${p.pkg}/README.md`, oneliner: r.oneliner, below: [] })
    under(p)
    const list = (listOf(p) ?? []).filter(x => x !== p.pkg)
    const named = (r.included ?? []).map(l => l.target.replace(/^\.\.\//, '').replace(/\/$/, ''))
    if (list.length && !r.included) problems.push({ keyword: TOP, check: 'included', detail: `no ## ${INCLUDED}: its list's ${list.length} packages taken from the list` })
    else if (r.included && named.join(',') !== list.map(x => x.split('/').pop()).join(',')) problems.push({ keyword: TOP, check: 'included', detail: `not its list, in deploy order: ${named.join(', ')}` })
    const included = r.included ? named : list.map(x => x.split('/').pop())
    for (const name of included) {
      const q = byName[name]
      if (!q) { if (!alone) problems.push({ keyword: TOP, check: 'included', detail: `${name}: not in this mrepo` }); continue }
      under(q)
    }
  }
  if (own) top(own)
  // documented beyond its list: each below its organisation, as an
  // included package is
  if (index[TOP]?.[0]) for (const q of packages.filter(x => x.documented && x !== own)) under(q)
  const head = index[TOP]?.[0] ?? null
  // modules: every module once, by its name, families as headings
  const modules = Object.keys(carrier).sort((a, b) => a.split('/')[1] < b.split('/')[1] ? -1 : 1)
  const families = [...new Set(modules.map(m => family(m.split('/')[1])))]
  out['/modules/README.md'] = Buffer.from(`# modules\n\nThe modules this mrepo's packages carry, each once.\n\nGenerated at extraction from the packages' bundles.\n\n## Links\n\n${families.map(f => `### ${f}\n\n${modules.filter(m => family(m.split('/')[1]) === f).map(m => `- [${m.split('/')[1]}](${m.split('/')[1]}/)`).join('\n')}\n`).join('\n')}`)
  if (head) {
    below(head, 'modules')
    const c = choose('modules', { page: 'modules/README.md', oneliner: 'The modules this mrepo\'s packages carry, each once.', below: [], generated: true })
    for (const m of modules) {
      const k = `modules/${m.split('/')[1]}`
      const path = `/modules/${m}/README.md`
      if (!carrier[m].files[path]) { problems.push({ keyword: k, check: 'readme', detail: 'none' }); continue }
      below(c, k)
      walk(k, placed(carrier[m], path))
    }
  }
  // third-party: each module once, from the packages' third-party.json
  const third = {}
  for (const p of packages) {
    const b = p.files['/modules/third-party.json']
    if (!b) continue
    let t
    try { t = JSON.parse(b.toString()) } catch (err) { problems.push({ page: `packages/${p.pkg}/modules/third-party.json`, check: 'third-party', detail: err.message }); continue }
    for (const m of t.modules ?? []) {
      const e = third[m.name] ??= { name: m.name, versions: new Set(), license: m.license, resolved: m.resolved, packages: [] }
      e.versions.add(m.version)
      e.packages.push(p.pkg.split('/').pop())
    }
  }
  const rows = Object.values(third).sort((a, b) => a.name < b.name ? -1 : 1)
  for (const e of rows) if (e.versions.size > 1) problems.push({ keyword: 'third-party', check: 'third-party', detail: `${e.name}: ${[...e.versions].join(', ')}` })
  out['/third-party/README.md'] = Buffer.from(`# third-party\n\nThe third-party code in this mrepo's packages, each module once.\n\nGenerated at extraction from the packages' \`modules/third-party.json\`.\n\n## Modules\n\n| module | version | licence | carried by |\n|---|---|---|---|\n${rows.map(e => `| [${e.name}](${e.resolved ?? ''}) | ${[...e.versions].join(', ')} | ${e.license ?? ''} | ${e.packages.length} packages |`).join('\n')}\n`)
  if (head) {
    below(head, 'third-party')
    choose('third-party', { page: 'third-party/README.md', oneliner: 'The third-party code in this mrepo\'s packages, each module once.', below: [], generated: true })
  }
  // schemas: each once, by its URI, from the packages' schemas (their own,
  // their modules'): its fingerprint, its fields, who carries it
  const schemas = {}
  for (const p of packages) {
    for (const [path, b] of Object.entries(p.files)) {
      if (!/^\/(modules\/[^/]+\/[^/]+\/)?schemas\/[^/]+\.json$/.test(path)) continue
      let row
      // catch: not a schema: a problem, said with where
      try { row = schemaRow(JSON.parse(b.toString()), reg) } catch (err) { problems.push({ page: `packages/${p.pkg}${path}`, check: 'schema', detail: err.message }); continue }
      const e = schemas[row.fingerprint] ??= { ...row, packages: [] }
      e.packages.push(p.pkg.split('/').pop())
    }
  }
  const srows = Object.values(schemas).sort((a, b) => String(a.uri) < String(b.uri) ? -1 : 1)
  out['/schemas/README.md'] = Buffer.from(`# schemas\n\nThe schemas this mrepo's packages carry, each once, by its URI and its fingerprint.\n\nGenerated at extraction from the packages' \`schemas/\` and their modules'. A binary record names its schema by its fingerprint (\`mycelium-value-avro\`): this says what each is; \`crud/read\` decodes one.\n\n## Schemas\n\n| schema | fingerprint | fields | carried by |\n|---|---|---|---|\n${srows.map(e => `| \`${e.uri ?? e.name}\` | \`${e.fingerprint}\` | ${e.fields} | ${e.packages.length} packages |`).join('\n')}\n`)
  if (head) {
    below(head, 'schemas')
    choose('schemas', { page: 'schemas/README.md', oneliner: 'The schemas this mrepo\'s packages carry, each once, by its URI and its fingerprint.', below: [], generated: true })
  }
  // each organisation's page: its packages, by their keywords
  for (const [org, qs] of Object.entries(orgs)) out[`/packages/${org}/README.md`] = Buffer.from(`# ${org}\n\nThe ${org} packages of this mrepo, each by its name.\n\nGenerated at extraction: \`info/get ${org}/<package>\`.\n\n## Links\n\n${qs.map(q => `- [${q.pkg.split('/')[1]}](${q.pkg.split('/')[1]}/)`).join('\n')}\n`)
  // every README of a package reached from the top, or from its module's
  for (const p of packages) {
    if (!head || !listed.has(p.pkg)) continue
    for (const path of Object.keys(p.files)) {
      if (!path.endsWith('/README.md') || path.startsWith('/modules/node_modules/')) continue
      const m = moduleOf(path)
      const key = m ? `${carrier[m.module].pkg}:${path}` : `${p.pkg}:${path}`
      if (!reached.has(key)) problems.push({ page: (m ? `modules/${m.module}${m.rest}` : `packages/${p.pkg}${path}`).replace(/\/README\.md$/, ''), check: 'reached', detail: 'no menu leads to it' })
    }
  }
  // Split on package: each package's keywords its own, in its own index
  // beside its pages, by its short keywords ('.' its README); the
  // mrepo's (the top, the organisations, what is made here) in
  // index.json; which packages have a short keyword, keywords.json; the
  // packages, the contexts, packages.json.
  const mine = {}
  const keywords = {}
  for (const q of packages.filter(q => listed.has(q.pkg))) {
    const K = packageKey(q.pkg)
    const rel = k => (k === K ? TOP : k.slice(K.length + 1))
    const idx = {}
    for (const [k, choices] of Object.entries(index)) {
      if (k !== K && !k.startsWith(`${K}/`)) continue
      idx[rel(k)] = choices.map(c => ({ ...c, below: c.below.map(rel) }))
      delete index[k]
      if (k !== K) (keywords[rel(k)] ??= []).push(q.pkg)
    }
    out[`/packages/${q.pkg}/index.json`] = Buffer.from(JSON.stringify(idx, null, 2) + '\n')
    mine[q.pkg] = { oneliner: idx[TOP]?.[0]?.oneliner ?? '', ...(q === own ? { own: true } : {}), ...(q.documented ? { documented: true } : {}) }
  }
  out['/packages.json'] = Buffer.from(JSON.stringify(mine, null, 2) + '\n')
  out['/keywords.json'] = Buffer.from(JSON.stringify(keywords, null, 2) + '\n')
  out['/index.json'] = Buffer.from(JSON.stringify(index, null, 2) + '\n')
  const seen = new Set()
  out['/problems.json'] = Buffer.from(JSON.stringify(problems.filter(x => { const s = JSON.stringify(x); return !seen.has(s) && seen.add(s) }), null, 2) + '\n')
  return out
}

// What an extraction wrote in the info layer, as its documents name it:
// the pages its indexes name, each package's index, the documents made
// here; by path in the layer. (The layer's own config not among them.)
// log: none (reads only; the action that uses it says what it did)
export async function built (exec) {
  const json = async p => { const b = await exec.find(`/${LAYER}${p}`); return b === null ? null : JSON.parse(b.toString()) }
  const out = new Set()
  const named = idx => { for (const c of Object.values(idx ?? {}).flat()) out.add(`/${c.page}`) }
  const top = await json('/index.json')
  if (top === null) return out
  named(top)
  for (const f of ['/index.json', '/packages.json', '/keywords.json', '/problems.json']) if (await exec.find(`/${LAYER}${f}`) !== null) out.add(f)
  for (const pkg of Object.keys((await json('/packages.json')) ?? {})) {
    out.add(`/packages/${pkg}/index.json`)
    named(await json(`/packages/${pkg}/index.json`))
  }
  return out
}
