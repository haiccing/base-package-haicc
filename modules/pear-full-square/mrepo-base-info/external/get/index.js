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

// The keywords asked: where the URI is, as typed (info/get boot/deploy, no
// dot), then the arguments, as one path or several words; none, or the
// position itself: the top. The prefix of a request from outside, main,
// is not one.
export async function get (exec, { uri = ['.'], args = [] }) {
  const s = segmented(uri)
  const at = joined(s[0] === 'main' && s.length > 1 ? s.slice(1) : s)
  const k = [at === '.' ? '' : at, ...args].join('/').split('/').map(keyword).filter(Boolean).join('/') || TOP
  const bytes = await exec.find(`/${LAYER}/index.json`)
  if (bytes === null) throw new Error('no info extracted in this mrepo yet (info/extract)')
  const index = JSON.parse(bytes.toString())
  const choices = index[k]
  exec.log('debug', 'index', { keywords: Object.keys(index).length, asked: k, choices: choices?.length ?? 0 })
  if (!choices) {
    const parts = k.split('/')
    let near = TOP
    for (let i = parts.length - 1; i > 0; i--) if (index[parts.slice(0, i).join('/')]) { near = parts.slice(0, i).join('/'); break }
    const there = [...new Set((index[near] ?? []).flatMap(c => c.below))].map(b => b.split('/').pop())
    throw new Error(`no ${k} here: nearest ${near}, below it ${there.join(', ') || 'nothing'}`)
  }
  const out = []
  for (const c of choices) {
    const text = (await exec.read(`/${LAYER}/${c.page}`)).toString()
    const r = parse(text)
    const page = c.section ? r.sections.find(s => s.title === c.section)?.text ?? '' : said(text)
    const below = c.below.map(b => ({ keyword: b, oneliner: index[b]?.[0]?.oneliner ?? '', choices: index[b]?.length ?? 0 }))
    out.push({ title: c.section ?? r.title, oneliner: c.oneliner, page, below, ...(c.see ? { see: c.see } : {}), ...(c.generated ? { generated: true } : {}) })
  }
  exec.log('verbose', 'found', { keyword: k, choices: out.length, below: out.reduce((n, c) => n + c.below.length, 0) })
  return { keyword: k, choices: out }
}
