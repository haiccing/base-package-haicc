// offset-files: a topic stored a record a file, named by its offset, in
// folders by its digits (README.md beside it).

// the node set's storage: { type, topic, levels, batch, extension }
//   topic      where the topic is in its layer ('' the layer itself; 'done')
//   levels     how many of the offset's digits name each folder ([5, 6])
//   batch      how many records a batch holds (50)
//   extension  a record's file ('json')
const DIGITS = 13
const meta = set => ({ topic: '', levels: [5, 6], batch: 50, extension: 'json', ...set.physical })
const nameOf = offset => String(offset).padStart(DIGITS, '0')
const quoted = text => `'${text}'`

// The filters right after `<topic>/*`, each its text, and what follows them.
function filters (rest) {
  const out = []
  let at = 0
  while (rest[at] === '[') {
    let depth = 0
    let end = at
    for (let quote = null; end < rest.length; end++) {
      const c = rest[end]
      if (quote) { if (c === quote) quote = null; continue }
      if (c === '\'' || c === '"') quote = c
      else if (c === '[') depth++
      else if (c === ']' && --depth === 0) break
    }
    out.push(rest.slice(at + 1, end).trim())
    at = end + 1
  }
  return { filters: out, after: rest.slice(at) }
}
const positional = filter => /^\d+$/.test(filter) || /\b(position|last)\s*\(/.test(filter.replace(/'[^']*'|"[^"]*"/g, ''))

// What a logical query asks of its topic, read once from its text:
//   handed down, the filters right on the records:
//     bounds on the offset      [@offset=N] one record; [@offset<N],
//                               [@offset<=N] from there back; [@offset>N],
//                               [@offset>=N] back to there: the offset's
//                               digits say the folder, the scan is in it
//   asked of each record read (filters on its data, a path into it): the rest
// A query says where, never how many: a position among a topic's records
// is refused, said: who reads the result takes as many as it wants.
export function plan (set) {
  const { topic } = meta(set)
  const all = topic ? `${topic}/*` : '*'
  const query = set.logical.query
  if (query !== all && !(query.startsWith(all) && '[/'.includes(query[all.length]))) throw new Error(`not a topic's records: ${query} (${all}, its filters, a path into a record)`)
  const { filters: list, after } = filters(query.slice(all.length))
  const p = { exact: null, upper: null, lower: null, asked: '' }
  let i = 0
  for (; i < list.length; i++) {
    const m = list[i].match(/^@?offset\s*(=|<=|>=|<|>)\s*(\d+)$/)
    if (!m) break
    const n = Number(m[2])
    if (m[1] === '=') p.exact = n
    // (several: the narrowest holds)
    else if (m[1][0] === '<') { const at = m[1] === '<' ? n - 1 : n; p.upper = p.upper === null ? at : Math.min(p.upper, at) } else { const at = m[1] === '>' ? n + 1 : n; p.lower = p.lower === null ? at : Math.max(p.lower, at) }
  }
  for (const f of list.slice(i)) if (positional(f)) throw new Error(`a position is no part of a topic's query: [${f}] (in ${query}: it says where, bounds on @offset and filters on the data; who reads the result takes as many as it wants)`)
  p.asked = list.slice(i).map(f => `[${f}]`).join('') + after
  return p
}
export const asked = set => plan(set).asked

// The direction of a reading: from the latest back (when none is said), or
// ascending, from the earliest on (set.logical.ascending): the same walk,
// mirrored: the edge it starts at, the side a folder is read from, the
// folder it goes on to.
const asc = set => set.logical.ascending === true
// the latest offset it wants: its fixed one, or its upper bound where that is earlier
const topOf = (set, p) => (p.upper === null ? set.fixed : Math.min(set.fixed, p.upper))
// Where a node set starts: the folder of the first offset it wants, that
// offset the first wanted, a whole batch to get. From the latest back:
// the latest it wants. Ascending: its lower bound; none: the topic's
// first folder, found from its top.
const start = (set, p) => {
  const { levels, batch } = meta(set)
  if (asc(set) && p.lower === null) return { phase: 'last', folder: [], level: 0, need: batch }
  const name = nameOf(asc(set) ? p.lower : topOf(set, p))
  return { phase: 'records', folder: levels.map(n => name.slice(0, n)), bound: name, inclusive: true, need: batch }
}
const stateOf = (set, p) => set.reached ?? start(set, p)
const pathOf = (set, ...names) => [meta(set).topic, ...names].filter(Boolean).join('/')
const folderOf = (set, offset) => meta(set).levels.map(n => nameOf(offset).slice(0, n))

export function next (set) {
  if (set.fixed === null || set.fixed === undefined || set.reached === 'end') return null
  const { extension } = meta(set)
  const p = plan(set)
  const file = name => quoted(`${name}.${extension}`)
  // one record, by its offset: its folder said by its digits, scanned for it
  if (p.exact !== null) {
    const out = p.exact > set.fixed || (p.upper !== null && p.exact > p.upper) || (p.lower !== null && p.exact < p.lower)
    return out ? null : `${pathOf(set, ...folderOf(set, p.exact))}/*[name()=${file(nameOf(p.exact))}]${p.asked}`
  }
  if (p.lower !== null && p.lower > topOf(set, p)) return null
  const s = stateOf(set, p)
  const up = asc(set)
  // to its far bound (back: a lower bound; ascending: the latest it
  // wants): in that one's folder, the scan stops at it
  const far = up ? topOf(set, p) : p.lower
  const edge = far !== null && s.folder.join('/') === folderOf(set, far).join('/') ? `[name()${up ? '<=' : '>='}${file(nameOf(far))}]` : ''
  // the records of one folder, from where it has read to, on in its direction: by name and position, none opened
  if (s.phase === 'records') return `${pathOf(set, ...s.folder)}/*${s.bound === null ? '' : `[name()${up ? '>' : '<'}${s.inclusive ? '=' : ''}${file(s.bound)}]`}${edge}${up ? `[position()<=${s.need}]` : `[position()>last()-${s.need}]`}`
  // those same records, what is asked of them: opened
  if (s.phase === 'asked') return `${pathOf(set, ...s.folder)}/*[name()>=${file(s.low)}][name()<=${file(s.high)}]${p.asked}`
  // the folder next to this one in its direction, in its parent
  if (s.phase === 'before') return `${pathOf(set, ...s.folder.slice(0, s.level))}/*[name()${up ? '>' : '<'}${quoted(s.folder[s.level])}]${up ? '[1]' : '[last()]'}`
  // the first folder in its direction of one found, a level down
  if (s.phase === 'last') return `${pathOf(set, ...s.folder.slice(0, s.level))}/*${up ? '[1]' : '[last()]'}`
  throw new Error(`not a state of an offset-files node set: ${s.phase}`)
}

// A record's logical address: <topic>/*[@offset=<offset>], and what of it
// was asked after: no folder of its storage, no file's name.
export function addressOf (set, path) {
  const { topic, levels, extension } = meta(set)
  const parts = path.replace(/^\//, '').split('/')
  const depth = (topic ? topic.split('/').length : 0) + levels.length
  const offset = Number(parts[depth].slice(0, -(extension.length + 1)))
  return '/' + [topic, `*[@offset=${offset}]`, ...parts.slice(depth + 1)].filter(Boolean).join('/')
}

const last = path => path.slice(path.lastIndexOf('/') + 1)
export function took (set, text, result) {
  const { batch, levels, extension } = meta(set)
  const p = plan(set)
  const none = { nodes: [], stopped: [], done: false, full: false }
  const end = { ...none, reached: 'end', done: true }
  if (p.exact !== null) return { nodes: result.found, stopped: result.stopped, reached: 'end', done: true, full: true }
  const s = stateOf(set, p)
  const up = asc(set)
  // its far bound's folder (back: a lower bound's; ascending: the latest it wants)
  const far = up ? topOf(set, p) : p.lower
  const farthest = far === null ? null : folderOf(set, far)
  // a folder past the far bound's: nothing wanted there or beyond it
  const below = folder => farthest !== null && folder.some((name, i) => (up ? name > farthest[i] : name < farthest[i]) && folder.slice(0, i).every((x, j) => x === farthest[j]))
  // a part of a batch read: on to where it ended; the folder run out: the
  // next in its direction; its far bound's folder done: the end
  const on = (from, at, count) => {
    const need = from.need - count
    if (count < from.need) return farthest !== null && from.folder.join('/') === farthest.join('/') ? 'end' : { phase: 'before', folder: from.folder, level: levels.length - 1, need: need > 0 ? need : batch }
    return { phase: 'records', folder: from.folder, bound: at, inclusive: false, need: need > 0 ? need : batch }
  }
  const part = (nodes, stopped, at, count) => {
    const reached = on(s, at, count)
    return { nodes, stopped, reached, done: reached === 'end', full: s.need - count <= 0 }
  }
  // (found in the order they arrived: handed over so ascending, the latest first otherwise)
  const ordered = found => (up ? [...found] : [...found].reverse())
  if (s.phase === 'records') {
    const names = result.found.map(f => last(f.path).slice(0, -(extension.length + 1)))
    if (!names.length) return part([], [], null, 0)
    if (p.asked) return { ...none, reached: { phase: 'asked', folder: s.folder, low: names[0], high: names.at(-1), count: names.length, need: s.need } }
    return part(ordered(result.found), result.stopped, up ? names.at(-1) : names[0], names.length)
  }
  if (s.phase === 'asked') return part(ordered(result.found), result.stopped, up ? s.high : s.low, s.count)
  const into = folder => (below(folder) ? end : folder.length === levels.length
    ? { ...none, reached: { phase: 'records', folder, bound: null, inclusive: false, need: s.need } }
    : { ...none, reached: { phase: 'last', folder, level: folder.length, need: s.need } })
  if (s.phase === 'before') {
    const found = result.found[0]
    // none before it at this level: a level up; at the top: the topic's start
    if (!found) return s.level === 0 ? end : { ...none, reached: { ...s, level: s.level - 1 } }
    return into([...s.folder.slice(0, s.level), last(found.path)])
  }
  if (s.phase === 'last') {
    const found = result.found[0]
    // a folder with nothing in it: the next one in its direction (the topic itself: its end)
    if (!found) return s.level === 0 ? end : { ...none, reached: { phase: 'before', folder: s.folder, level: s.level - 1, need: s.need } }
    return into([...s.folder, last(found.path)])
  }
  throw new Error(`not a state of an offset-files node set: ${s.phase}`)
}
