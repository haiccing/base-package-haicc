// mrepo: the integrity of a package's mrepo side: its structure, its
// protocols, what it carries (README.md beside it). Each -> [{ check, detail }].
import { readFileSync, readdirSync, statSync, lstatSync, existsSync } from 'bare-fs'
import { join } from 'bare-path'
import { pathToFileURL } from 'bare-url'
import { isSegment, isHidden, HIDDEN } from 'mycelium-uri'
import { isType, TYPES } from 'mycelium-xpath-physical'

const MODES = ['atomic', 'replicated', 'non-atomic']
// the layers that stream: the boxes and what is done, what only grows
const STREAMING = ['inbox', 'outbox', 'request/done']
// The status transitions a hook can hang on: boot (the runtime's), the rest the service's.
const TRANSITIONS = ['boot', 'commission', 'initialise', 'start', 'stop', 'shutdown', 'decommission']
const json = f => JSON.parse(readFileSync(f, 'utf8'))
// The one package that lays types into an mrepo's avro layer at deploy.
const AVRO_BRINGER = 'base-package-runtime'

// The leaves of a structure: each folder holding a .layer.json, by its path.
export function leaves (root, rel = '') {
  const dir = join(root, rel)
  if (existsSync(join(dir, '.layer.json'))) return [rel]
  return readdirSync(dir).sort().filter(n => statSync(join(dir, n)).isDirectory()).flatMap(n => leaves(root, rel ? `${rel}/${n}` : n))
}

// The files a structure contributes to layers it does not define itself
// (another package's: runtime/service.json into the runtime layer), by path.
export function contributions (root, ls = leaves(root), rel = '') {
  return readdirSync(join(root, rel)).sort().flatMap(n => {
    const p = rel ? `${rel}/${n}` : n
    if (statSync(join(root, p)).isDirectory()) return ls.includes(p) ? [] : contributions(root, ls, p)
    return n === 'README.md' || !rel ? [] : [p]
  })
}

// Its mrepo/ part: every leaf's .layer.json valid; no file at its top but a
// README, no README inside a layer; a file in a folder it gives no
// .layer.json a contribution to a layer another package defines, valid JSON
// where it is JSON; its preloaded requests records; its packages by name.
export function checkStructure (pkg) {
  const root = join(pkg, 'mrepo')
  const out = []
  const at = (detail) => out.push({ check: 'structure', detail })
  if (!existsSync(root)) return out
  const ls = leaves(root)
  for (const n of readdirSync(root).sort()) if (!statSync(join(root, n)).isDirectory() && n !== 'README.md') at(`mrepo/${n}: a file outside a layer`)
  // the avro layer: laid in at deploy by the runtime package alone, its
  // essential types, the exception for bootstrapping; an mrepo's other
  // types come from the schema registry, never from a package's structure
  if (existsSync(join(root, 'avro'))) {
    // catch: no package.json that reads: no name (said by the package check)
    const { name = null, docs = false } = (() => { try { return json(join(pkg, 'package.json')) } catch { return {} } })()
    // (a documentation package brings no structure at deploy: its mrepo/ is pages, the layer's among them)
    if (name !== AVRO_BRINGER && docs !== true) at(`mrepo/avro: a package lays nothing into the avro layer (the ${AVRO_BRINGER} alone does, its essential types; any other type comes from the schema registry)`)
  }
  // every name it lays in: a URI's name, and then data; or hidden, a name
  // starting with a dot, and then one of those there are (a layer's
  // config, a node's document, its shortcuts); a README is external
  const names = rel => readdirSync(join(root, rel)).sort().flatMap(n => {
    const p = rel ? `${rel}/${n}` : n
    const bad = n === 'README.md' ? [] : isHidden(n) ? (HIDDEN.includes(n) ? [] : [`mrepo/${p}: a hidden name there is none of (${HIDDEN.join(', ')})`]) : isSegment(n) ? [] : [`mrepo/${p}: not a URI's name (lowercase letters, digits, hyphens, its extensions; hidden: a name starting with a dot)`]
    return [...bad, ...(statSync(join(root, p)).isDirectory() ? names(p) : [])]
  })
  for (const problem of names('')) at(problem)
  for (const c of contributions(root, ls)) if (c.endsWith('.json')) { try { json(join(root, c)) } catch (err) { at(`mrepo/${c}: ${err.message}`) } }
  // its hooks: runtime/hooks/<transition>.haicc, a file a transition, its
  // lines simple commands (what it drops into the runtime layer)
  const hooksDir = join(root, 'runtime', 'hooks')
  if (existsSync(hooksDir)) {
    const walk = rel => readdirSync(join(hooksDir, rel)).sort().flatMap(n => statSync(join(hooksDir, rel, n)).isDirectory() ? walk(rel ? `${rel}/${n}` : n) : [rel ? `${rel}/${n}` : n])
    for (const f of walk('')) {
      const [file, ...more] = f.split('/')
      const transition = file.replace(/\.haicc$/, '')
      if (more.length || !file.endsWith('.haicc')) { at(`mrepo/runtime/hooks/${f}: not a hook's place (hooks/<transition>.haicc, a file a transition)`); continue }
      if (!TRANSITIONS.includes(transition)) { at(`mrepo/runtime/hooks/${f}: no transition ${transition} (${TRANSITIONS.join(', ')})`); continue }
      // its lines: each a simple command, <protocol>/<action> first; blank
      // lines and # comments none; at least one
      const lines = readFileSync(join(hooksDir, f), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
      if (!lines.length) at(`mrepo/runtime/hooks/${f}: no command in it`)
      for (const l of lines) if (!/^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)?(\s|$)/.test(l)) at(`mrepo/runtime/hooks/${f}: not a command: ${l} (<protocol>/<action> <URI> <arguments>)`)
    }
  }
  for (const l of ls) {
    let cfg = null
    try { cfg = json(join(root, l, '.layer.json')) } catch (err) { at(`mrepo/${l}/.layer.json: ${err.message}`); continue }
    if (!MODES.includes(cfg.mode)) at(`mrepo/${l}/.layer.json: mode ${cfg.mode} (one of ${MODES.join(', ')})`)
    if (!cfg.description) at(`mrepo/${l}/.layer.json: no description`)
    // explicit, always: a layer that streams (a box, request/done: what
    // only grows) declares its structure; one that declares none is a folder
    if (STREAMING.includes(l) && cfg.structure?.type !== 'offset-files') at(`mrepo/${l}/.layer.json: no structure declared (a streaming layer says it: "structure": { "type": "offset-files", "levels": [5, 6] }; without it the layer is a folder)`)
    // how it is stored, where it says: a structure type there is (the
    // physical side's: mycelium-xpath-physical), and what that type needs
    if (cfg.structure !== undefined) {
      const st = cfg.structure
      if (!isType(st?.type)) at(`mrepo/${l}/.layer.json: structure type ${st?.type} (one of ${Object.keys(TYPES).join(', ')})`)
      else if (st.type === 'offset-files') {
        const levels = st.levels ?? []
        if (!(Array.isArray(levels) && levels.length && levels.every((n, i) => Number.isInteger(n) && n > (levels[i - 1] ?? 0) && n < 13))) at(`mrepo/${l}/.layer.json: structure levels (how many of an offset's 13 digits name each folder, growing: [5, 6])`)
        if (st.batch !== undefined && !(Number.isInteger(st.batch) && st.batch > 0)) at(`mrepo/${l}/.layer.json: structure batch (a number of records)`)
      }
    }
    const files = (function all (rel) { return readdirSync(join(root, l, rel)).sort().flatMap(n => statSync(join(root, l, rel, n)).isDirectory() ? all(join(rel, n)) : [rel ? `${rel}/${n}` : n]) })('')
    for (const f of files) {
      if (f.endsWith('README.md')) at(`mrepo/${l}/${f}: a README inside a layer (it would be committed into it)`)
      if (!f.endsWith('.json')) continue
      try { json(join(root, l, f)) } catch (err) { at(`mrepo/${l}/${f}: ${err.message}`) }
    }
    if (l === 'packages' && !(Array.isArray(cfg.packages) && cfg.packages.every(p => /^[a-z0-9-]+\/[a-z0-9-]+$/.test(p)))) at('mrepo/packages/.layer.json: packages, a list of <org>/<package>')
    // its list ends with the package itself: the last package of a list
    // defines the mrepo (its runtime config is the one laid in)
    else if (l === 'packages') {
      // catch: no package.json that reads: no name (said by the package check)
      const name = (() => { try { return json(join(pkg, 'package.json')).name } catch { return null } })()
      if (name && cfg.packages.at(-1)?.split('/')[1] !== name) at(`mrepo/packages/.layer.json: its list ends with ${cfg.packages.at(-1)}, not with the package itself (${name})`)
    }
    if (l.startsWith('request/pending/')) {
      for (const f of files.filter(f => f !== '.layer.json' && f.endsWith('.json'))) {
        let r = null
        // catch: not JSON: said where JSON is checked
        try { r = json(join(root, l, f)) } catch { continue }
        const form = r?.value?.value
        if (r.topic !== `/${l}`) at(`mrepo/${l}/${f}: its envelope's topic ${r.topic} (/${l})`)
        // a request's one identity: its offset, a number, its file's name (13 digits), its core's
        if (!Number.isInteger(r.offset) || `${String(r.offset).padStart(13, '0')}.json` !== f || r.value?.offset !== r.offset) at(`mrepo/${l}/${f}: its offset (a number; the file's name, 13 digits; the core's)`)
        if (!form?.protocol || !form?.action || !form?.uri) at(`mrepo/${l}/${f}: its form (protocol, action, uri)`)
      }
    }
  }
  return out
}

// The methods the modules a package carries document as protocol actions:
// modules/<org>/<module>/external/<action>/, by action.
function methodsOf (pkg) {
  const mods = join(pkg, 'modules')
  const out = {}
  const dirs = d => existsSync(d) ? readdirSync(d).sort().filter(n => statSync(join(d, n)).isDirectory()) : []
  for (const org of dirs(mods).filter(n => n !== 'node_modules')) {
    for (const mod of dirs(join(mods, org))) {
      for (const a of dirs(join(mods, org, mod, 'external'))) (out[a] ??= []).push({ module: `${org}/${mod}`, dir: join(mods, org, mod, 'external', a) })
    }
  }
  return out
}

// What a method's README states, an action's: its sections.
const SECTIONS = ['Signature', 'Returns', 'Errors']

// Its protocol.js: each protocol's config with its package and description;
// every action configured has its function, every function its config; and
// every action is a documented method: the function mounted is the one
// external/<action>/ of a module it carries exports, its README stating
// its signature, what it returns, its errors, and its arguments where the
// config names any.
export async function checkProtocol (pkg) {
  const file = join(pkg, 'protocol.js')
  const out = []
  const at = (detail) => out.push({ check: 'protocol', detail })
  if (!existsSync(file)) return out
  let m = null
  try { m = await import(pathToFileURL(file).href) } catch (err) { at(`protocol.js: ${err.message}`); return out }
  const { protocols = {}, actions = {} } = m
  const methods = methodsOf(pkg)
  for (const [p, cfg] of Object.entries(protocols)) {
    if (!cfg.package) at(`${p}: no package`)
    if (!cfg.description) at(`${p}: no description`)
    for (const [a, c] of Object.entries(cfg.actions || {})) {
      if (typeof actions[p]?.[a] !== 'function') at(`${p} ${a}: configured, no function`)
      if (!c.description) at(`${p} ${a}: no description`)
      if (!Array.isArray(c.uris) || !c.uris.length) at(`${p} ${a}: no uris`)
      if (typeof actions[p]?.[a] !== 'function') continue
      const found = methods[a] ?? []
      let method = null
      for (const m of found) {
        // catch: a method that does not load is not the one: the next (none found is the problem said)
        try { if (Object.values(await import(pathToFileURL(join(m.dir, 'index.js')).href)).includes(actions[p][a])) { method = m; break } } catch {}
      }
      if (!method) { at(found.length ? `${p} ${a}: the function mounted is not its method's (external/${a}/ in ${found.map(m => m.module).join(', ')})` : `${p} ${a}: not a documented method (external/${a}/ in a module it carries)`); continue }
      const readme = join(method.dir, 'README.md')
      const text = existsSync(readme) ? readFileSync(readme, 'utf8') : ''
      for (const section of [...SECTIONS, ...((c.args ?? []).length ? ['Arguments'] : [])]) {
        if (!new RegExp(`^## ${section}\\s*$`, 'm').test(text)) at(`${p} ${a}: its README does not state its ${section.toLowerCase()} (${method.module}, external/${a}/README.md, "## ${section}")`)
      }
    }
  }
  for (const [p, fns] of Object.entries(actions)) for (const a of Object.keys(fns)) if (!protocols[p]?.actions?.[a]) at(`${p} ${a}: a function, not configured`)
  return out
}

// What it carries: its package.json's main there; no third-party module
// carried that its record does not name, each at its recorded version; an
// omitted one, where present, its stub. (A bundle holds only the code that
// is reached: less than the record, never more.)
export function checkCarried (pkg) {
  const out = []
  const at = (detail) => out.push({ check: 'carried', detail })
  const pj = json(join(pkg, 'package.json'))
  if (!pj.name) at('package.json: no name')
  if (pj.main && !existsSync(join(pkg, pj.main))) at(`package.json: main ${pj.main} not there`)
  const rec = join(pkg, 'modules', 'third-party.json')
  const nm = join(pkg, 'modules', 'node_modules')
  if (!existsSync(rec) || !existsSync(nm)) return out
  const { modules = [], omitted = [] } = json(rec)
  const recorded = new Map(modules.map(m => [m.name, m.version]))
  const names = readdirSync(nm).sort().flatMap(n => n.startsWith('@') ? readdirSync(join(nm, n)).sort().map(x => `${n}/${x}`) : [n])
  for (const name of names) {
    const dir = join(nm, name)
    if (name.startsWith('.') || lstatSync(dir).isSymbolicLink()) continue // a link to one of ours
    const f = join(dir, 'package.json')
    if (!existsSync(f)) continue // code without its package.json: a bundle's
    const version = json(f).version
    if (omitted.includes(name)) { if (version !== '0.0.0-omitted') at(`${name}: omitted, yet carried (${version})`); continue }
    if (!recorded.has(name)) at(`${name}: carried, not recorded`)
    else if (recorded.get(name) !== version) at(`${name}: ${version} carried, ${recorded.get(name)} recorded`)
  }
  return out
}
