// patterns: what a package implements, by pattern, read from its files;
// and the how-tos there are, each naming the pattern it covers in a
// `Pattern: <name>` line (README.md beside it). A pattern implemented
// with no how-to is a problem: the implementation validation.
import { readFileSync, readdirSync, statSync, existsSync } from 'bare-fs'
import { join, basename, dirname } from 'bare-path'

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
  documents: '"documents" in its list: every package the sources offer documented, beyond the list',
  program: 'a hook that starts a placed package\'s program beside the mrepo (runtime/start)',
  platform: '"platform": "<org>" in its package.json: an mrepo that deploys its components, its organisation\'s, with the boot protocol and lays their packages on top of them (a dual install)',
  '<org>-component': 'a list of a platform\'s organisation: a component on that platform, its packages laid on top of an mrepo the platform deployed'
}

// A platform's component pattern, by the organisation the platform
// declares: <org>-component.
const COMPONENT = /^([a-z][a-z0-9-]*)-component$/
export const componentPattern = org => `${org}-component`
// Is a name a pattern: one of PATTERNS, or a declared platform's component.
const known = (name, platforms) => (name in PATTERNS && name !== '<org>-component') || platforms.includes(COMPONENT.exec(name)?.[1])

const json = f => JSON.parse(readFileSync(f, 'utf8'))
const dirs = d => existsSync(d) ? readdirSync(d).sort().filter(n => statSync(join(d, n)).isDirectory()) : []

// The organisations the platforms among a set of packages declare, each
// in its package.json ("platform": "<org>"): [org...].
export function platformsOf (packages) {
  return [...new Set(packages.map(p => existsSync(join(p, 'package.json')) ? json(join(p, 'package.json')).platform : null).filter(o => typeof o === 'string'))].sort()
}

// The patterns a package implements: [name...]. platforms: the
// organisations the platforms declare (platformsOf); a list of one of
// them, that platform's component.
export function patternsOf (pkg, { platforms = [] } = {}) {
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
  if (has('mrepo/runtime/hooks') && readdirSync(join(pkg, 'mrepo', 'runtime', 'hooks')).some(f => /^\s*runtime\/start\b/m.test(readFileSync(join(pkg, 'mrepo', 'runtime', 'hooks', f), 'utf8')))) out.push('program')
  if (list && !protocol && !docs && platforms.includes(basename(dirname(pkg)))) out.push(componentPattern(basename(dirname(pkg))))
  if (typeof pj.platform === 'string') out.push('platform')
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
  const platforms = platformsOf(packages)
  const names = [...Object.keys(PATTERNS).filter(n => n !== '<org>-component'), ...platforms.map(componentPattern)]
  for (const pkg of packages) {
    const name = pkg.split('/').pop()
    for (const p of patternsOf(pkg, { platforms })) (implemented[p] ??= []).push(name)
    for (const h of howtosOf(pkg)) {
      if (!known(h.pattern, platforms)) out.push({ check: 'patterns', detail: `${name}/${h.howto}: Pattern: ${h.pattern}, no such pattern (${names.join(', ')})` })
      else (covered[h.pattern] ??= []).push(`${name}/${h.howto}`)
    }
  }
  for (const [p, by] of Object.entries(implemented)) if (!covered[p]) out.push({ check: 'patterns', detail: `${p}: implemented (${by.join(', ')}), no how-to (Pattern: ${p})` })
  return out
}
