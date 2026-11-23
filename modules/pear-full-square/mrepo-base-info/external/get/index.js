// get: info/get <keywords>, a page of the mrepo's info by its keywords,
// from the top down (README.md beside it).
import { segmented, joined } from 'mycelium-uri'
import { LAYER, TOP, keyword, parse, MENU, INCLUDED } from '../../internal/info/index.js'

// A page's text without its menus: what it says, its keywords listed apart.
const said = text => {
  const lines = String(text).replace(/\r/g, '').split('\n')
  const out = []
  let skip = false
  let code = false
  for (const l of lines) {
    if (l.startsWith('```')) code = !code
    if (!code && l.startsWith('## ')) skip = l.slice(3).trim() === MENU || l.slice(3).trim() === INCLUDED
    if (!skip) out.push(l)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// The package a page is from, by its path in the info layer
// (packages/<org>/<package>/...): [<org>/<package>], or none.
const packageOf = page => { const m = /^packages\/([^/]+\/[^/]+)\//.exec(String(page)); return m ? [m[1]] : [] }

// A layer document, null when it is not there.
// log: none (one read; the action says what it found)
const doc = async (exec, path) => { const b = await exec.find(`/${LAYER}/${path}`); return b === null ? null : JSON.parse(b.toString()) }

// The context in the keywords: a path that starts with a package's name,
// fully qualified (haiccing/base-package-boot/deploy) or, where it is the
// only one of that name here, its name alone (base-package-boot/deploy).
// -> { context, rest } (rest: the short keywords, '' its README); context
// null: none written.
function contextOf (k, packages) {
  const parts = k.split('/')
  if (parts.length >= 2 && packages[`${parts[0]}/${parts[1]}`]) return { context: `${parts[0]}/${parts[1]}`, rest: parts.slice(2).join('/') }
  const named = Object.keys(packages).filter(p => p.split('/')[1] === parts[0])
  if (named.length === 1) return { context: named[0], rest: parts.slice(1).join('/') }
  return { context: null, rest: k }
}
// A keyword written in full, in its package's context: what to ask to
// read it, as it is.
const full = (context, k) => (k === TOP || k === '' ? context : `${context}/${k}`)

// The choices at a keyword in one index, drawn: each its page (a section:
// its text), the keywords below it written as they are asked; context:
// the package they are in (null: the mrepo's own keywords).
// log: none (reads only; the action says what it found)
async function drawn (exec, index, k, context, packages = {}) {
  const out = []
  const name = b => (context ? full(context, b) : b)
  for (const c of index[k]) {
    const text = (await exec.read(`/${LAYER}/${c.page}`)).toString()
    const r = parse(text)
    const page = c.section ? r.sections.find(s => s.title === c.section)?.text ?? '' : said(text)
    const below = c.below.map(b => ({ keyword: name(b), oneliner: index[b]?.[0]?.oneliner ?? packages[b]?.oneliner ?? '', choices: index[b]?.length ?? (packages[b] ? 1 : 0) }))
    out.push({ title: c.section ?? r.title, oneliner: c.oneliner, page, below, ...(context ? { context } : {}), packages: context ? [context] : packageOf(c.page), ...(c.see ? { see: c.see } : {}), ...(c.generated ? { generated: true } : {}) })
  }
  return out
}

// The keywords asked: where the URI is, as typed (info/get boot/deploy, no
// dot), then the arguments, as one path or several words; none, or the
// position itself: the top. The prefix of a request from outside, main,
// is not one. In a package's context when the path starts with its name;
// a short keyword without one: the mrepo's own package's first, else each
// package that has it, a choice each, kept apart.
export async function get (exec, { uri = ['.'], args = [] }) {
  const s = segmented(uri)
  const at = joined(s[0] === 'main' && s.length > 1 ? s.slice(1) : s)
  const k = [at === '.' ? '' : at, ...args].join('/').split('/').map(keyword).filter(Boolean).join('/') || TOP
  const index = await doc(exec, 'index.json')
  if (index === null) throw new Error('no info extracted in this mrepo yet (info/extract)')
  const packages = (await doc(exec, 'packages.json')) ?? {}
  const of = async pkg => (await doc(exec, `packages/${pkg}/index.json`)) ?? {}
  const answer = (keyword, choices, context = null) => {
    exec.log('verbose', 'found', { keyword, context, choices: choices.length, below: choices.reduce((n, c) => n + c.below.length, 0) })
    return { keyword, ...(context ? { context } : {}), choices }
  }
  const { context, rest } = index[k] ? { context: null, rest: k } : contextOf(k, packages)
  exec.log('debug', 'asked', { keyword: k, context, rest })
  // the mrepo's own keywords: the top, the organisations, what is made here
  if (index[k]) return answer(k, await drawn(exec, index, k, null, packages))
  // in a package's context: its own index only
  if (context) {
    const idx = await of(context)
    const key = rest || TOP
    if (idx[key]) return answer(full(context, key), await drawn(exec, idx, key, context), context)
    const parts = key.split('/')
    let near = TOP
    for (let i = parts.length - 1; i > 0; i--) if (idx[parts.slice(0, i).join('/')]) { near = parts.slice(0, i).join('/'); break }
    const there = [...new Set((idx[near] ?? []).flatMap(c => c.below))].map(b => b.split('/').pop())
    throw new Error(`no ${k} here: nearest ${full(context, near)}, below it ${there.join(', ') || 'nothing'}`)
  }
  // a short keyword: the mrepo's own package's, else each package's that has it
  const own = Object.keys(packages).find(p => packages[p].own)
  if (own && (await of(own))[k]) return answer(full(own, k), await drawn(exec, await of(own), k, own), own)
  const having = ((await doc(exec, 'keywords.json')) ?? {})[k] ?? []
  if (having.length === 1) return answer(full(having[0], k), await drawn(exec, await of(having[0]), k, having[0]), having[0])
  if (having.length) {
    const choices = []
    for (const pkg of having) choices.push(...(await drawn(exec, await of(pkg), k, pkg)).map(c => ({ keyword: full(pkg, k), ...c })))
    return answer(k, choices)
  }
  throw new Error(`no ${k} here: nearest ., below it ${(index[TOP]?.[0]?.below ?? []).join(', ') || 'nothing'}`)
}
