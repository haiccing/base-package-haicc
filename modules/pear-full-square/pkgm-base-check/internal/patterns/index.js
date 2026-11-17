// patterns: what a package implements, by pattern, read from its files;
// and the how-tos there are, each naming the pattern it covers in a
// `Pattern: <name>` line (README.md beside it). A pattern implemented
// with no how-to is a problem: the implementation validation.
import { readFileSync, readdirSync, statSync, existsSync } from 'bare-fs'
import { join } from 'bare-path'

// The patterns, each what makes a package implement it.
export const PATTERNS = {
  package: 'every package',
  'protocol-package': 'a protocol.js: a protocol, its config and its actions',
  component: 'a list of packages and no protocol: several packages deployed together',
  'documentation-package': '"docs": true: pages only, no structure brought',
  app: 'a run.js and neither a protocol nor a list: a program run from its bundle',
  'mrepo-definition': 'a list, mrepo/packages/layer.json: the packages an mrepo is made of',
  layer: 'a layer of its own in mrepo/, beyond the packages and the runtime',
  hooks: 'mrepo/runtime/hooks/: commands run on a status transition',
  service: 'mrepo/runtime/service.json: a service-managed mrepo',
  'continuation-script': 'scripts/: commands to go on with after a deploy',
  documents: '"documents" in its list: every package the sources offer documented, beyond the list'
}

const json = f => JSON.parse(readFileSync(f, 'utf8'))
const dirs = d => existsSync(d) ? readdirSync(d).sort().filter(n => statSync(join(d, n)).isDirectory()) : []

// The patterns a package implements: [name...].
export function patternsOf (pkg) {
  const pj = existsSync(join(pkg, 'package.json')) ? json(join(pkg, 'package.json')) : {}
  const has = p => existsSync(join(pkg, ...p.split('/')))
  const docs = pj.docs === true
  const protocol = has('protocol.js')
  const list = has('mrepo/packages/layer.json')
  const out = ['package']
  if (protocol) out.push('protocol-package')
  if (docs) out.push('documentation-package')
  if (list && !protocol && !docs) out.push('component')
  if (has('run.js') && !protocol && !list) out.push('app')
  if (list) out.push('mrepo-definition')
  if (!docs && dirs(join(pkg, 'mrepo')).some(l => l !== 'packages' && l !== 'runtime' && existsSync(join(pkg, 'mrepo', l, 'layer.json')))) out.push('layer')
  if (has('mrepo/runtime/hooks')) out.push('hooks')
  if (has('mrepo/runtime/service.json')) out.push('service')
  if (has('scripts')) out.push('continuation-script')
  if (list && json(join(pkg, 'mrepo', 'packages', 'layer.json')).documents !== undefined) out.push('documents')
  return out
}

// The how-tos a package holds: each README under its howto/ that names a
// pattern. -> [{ pattern, howto }], howto its folder from the package.
export function howtosOf (pkg) {
  const out = []
  const walk = at => {
    const d = join(pkg, at)
    if (existsSync(join(d, 'README.md'))) for (const m of readFileSync(join(d, 'README.md'), 'utf8').matchAll(/^Pattern: ([a-z][a-z0-9-]*)\s*$/gm)) out.push({ pattern: m[1], howto: at })
    for (const n of dirs(d)) walk(`${at}/${n}`)
  }
  if (existsSync(join(pkg, 'howto'))) walk('howto')
  return out
}

// The implementation validation over a set of packages: every pattern
// implemented has a how-to among them; a how-to names a known pattern.
// -> [{ check, detail }].
export function checkPatterns (packages) {
  const implemented = {}
  const covered = {}
  const out = []
  for (const pkg of packages) {
    const name = pkg.split('/').pop()
    for (const p of patternsOf(pkg)) (implemented[p] ??= []).push(name)
    for (const h of howtosOf(pkg)) {
      if (!PATTERNS[h.pattern]) out.push({ check: 'patterns', detail: `${name}/${h.howto}: Pattern: ${h.pattern}, no such pattern (${Object.keys(PATTERNS).join(', ')})` })
      else (covered[h.pattern] ??= []).push(`${name}/${h.howto}`)
    }
  }
  for (const [p, by] of Object.entries(implemented)) if (!covered[p]) out.push({ check: 'patterns', detail: `${p}: implemented (${by.join(', ')}), no how-to (Pattern: ${p})` })
  return out
}
