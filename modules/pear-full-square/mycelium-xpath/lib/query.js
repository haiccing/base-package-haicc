// A query: standard XPath's forward part, phase 1 (README.md): steps by
// name, `*` and `.`; filters on a node's leaves; a position ([1],
// [last()]); name(), starts-with(), contains(). Generic, as select is: the
// tree is reached only through what is handed in.
//
//   query(tree, root, text) -> { found, stopped }
//     tree.children(node)   a node's children, [name, child] pairs, or null
//                           for a leaf (as select's)
//     tree.document(node, ref) optional: the node's document, a plain value
//                           (an object, usually), or null when it has none
//                           (ref: its reference, { path, node })
//     tree.stop(ref)        optional: truthy where the query must not go on
//                           from a node (a link to elsewhere: its children
//                           and its document are there): what it says is
//                           handed back
//     tree.match(name, step) optional: replaces exact matching of a name
//     tree.name(key)        optional: the name a document's key has in a
//                           query and in a path (a key written another way
//                           there: publicKey as public-key); the key itself
//                           by default
//     tree.step(event, data, fn) optional: each round run through it, to
//                           be measured by who calls (event: segment,
//                           filter; data a function of the round's result)
//     found     the nodes selected, references: { path, node }, the node
//               as children gave it (nothing of it read); inside a
//               document: { path, value }
//     stopped   where it had to stop with some of the query left:
//               { path, node, rest, why }: rest the query's text from
//               there on (a step, or a filter on the node itself), for who
//               goes on elsewhere: query(there, its root, rest)
//
// Parse, process and continue: enough of the text is read to have a
// segment (steps, up to a filter or the end), it is processed, then the
// next bit is read. A segment walks: it reads a document only where a step
// names no child of a node (it is then looked for in the node's document).
// A filter is where documents are read. Between two rounds there is a set
// of references and the rest of the text.
//
// A node's document continues the tree below it: a step that names no
// child is looked for in the document (its keys), and goes on inside it, an
// object's keys its children, a leaf its value. A list is a child that
// repeats, as XPath sees one: its key names every item, in order, and a
// position picks one (`tags` all of them, `tags[2]` the second; an item's
// path says its position). `*` selects children; of a node without any,
// the keys of its document. A leaf of the tree itself has a value in a
// filter when its document is no object (a text, a number).
//
// A position, [n] or [last()], alone in its filter: the n-th (from 1) of
// the nodes the step selected under the same parent, in the order they
// came (the tree's own order; a list's).
//
// What is not of this phase is refused, said as such: descendants (`//`),
// the union (`|`), position() and a position joined with something else,
// the axes (`::`), the other functions. What looks back (`..`) is not
// built.

const INSIDE = Symbol('inside a document')
const inside = value => ({ [INSIDE]: true, value })
const isInside = node => node !== null && typeof node === 'object' && node[INSIDE] === true
const isObject = v => v !== null && typeof v === 'object'
const exact = (name, step) => name === step
const fail = (text, at, what) => new Error(`not a query: ${what} (${text.slice(0, at)}>>>${text.slice(at)})`)

// --- reading the text ---

// The index after the bracket that closes the one at `open`, quotes minded.
function closing (text, open) {
  let depth = 0
  let quote = null
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (quote) { if (c === quote) quote = null; continue }
    if (c === '\'' || c === '"') quote = c
    else if (c === '[') depth++
    else if (c === ']' && --depth === 0) return i + 1
  }
  throw fail(text, open, quote ? 'a quote not closed' : 'a filter not closed')
}

// The steps of a segment: text up to a filter or the end -> { steps, at }:
// at the index it ended (a '[', or the end).
function segment (text, from) {
  let at = from
  while (at < text.length && text[at] !== '[') at++
  const part = text.slice(from, at)
  if (from > 0 && part && part[0] !== '/') throw fail(text, from, 'a step after a filter starts with /')
  if (part.includes('//')) throw fail(text, from + part.indexOf('//'), 'descendants (//): not in this phase')
  if (part.includes('|')) throw fail(text, from + part.indexOf('|'), 'the union (|): not in this phase')
  if (part.includes('::')) throw fail(text, from + part.indexOf('::'), 'an axis written out (::): not in this phase')
  const steps = part.split('/').filter(Boolean)
  for (const s of steps) {
    if (s === '..') throw fail(text, from, 'the parent (..): a query looks forward only')
    if (/[\]()=<>!,'"\s]/.test(s) || s.startsWith('@')) throw fail(text, from, `not a step: ${s}`)
  }
  return { steps, at }
}

// A filter's expression, between its brackets -> a tree of
//   { or: [..] } | { and: [..] } | { not: e } | { compare: op, left, right }
//   | { exists: operand }
// an operand: { literal } | { path: [steps] } | { fn, args }
const OPS = ['!=', '<=', '>=', '=', '<', '>']
const FUNCTIONS = { name: 0, 'starts-with': 2, contains: 2 }
function expression (text, from, to) {
  let at = from
  const space = () => { while (at < to && /\s/.test(text[at])) at++ }
  const word = w => { space(); const m = text.slice(at, to).match(new RegExp(`^${w}(?![\\w-])`)); if (!m) return false; at += w.length; return true }
  const sign = s => { space(); if (text.startsWith(s, at) && at + s.length <= to) { at += s.length; return true } return false }
  const expect = s => { if (!sign(s)) throw fail(text, at, `expected ${s}`) }

  function operand () {
    space()
    if (at >= to) throw fail(text, at, 'something expected')
    const c = text[at]
    if (c === '\'' || c === '"') {
      const end = text.indexOf(c, at + 1)
      if (end < 0 || end >= to) throw fail(text, at, 'a quote not closed')
      const literal = text.slice(at + 1, end)
      at = end + 1
      return { literal }
    }
    const number = text.slice(at, to).match(/^-?\d+(\.\d+)?(?![\w-])/)
    if (number) { at += number[0].length; return { literal: Number(number[0]) } }
    const call = text.slice(at, to).match(/^([a-z][a-z-]*)\s*\(/)
    if (call) {
      const fn = call[1]
      if (!(fn in FUNCTIONS)) throw fail(text, at, `not a function of this phase: ${fn} (${Object.keys(FUNCTIONS).join(', ')}; not)`)
      at += call[0].length
      const args = []
      space()
      if (text[at] !== ')') { args.push(operand()); while (sign(',')) args.push(operand()) }
      expect(')')
      if (args.length !== FUNCTIONS[fn]) throw fail(text, at, `${fn}() takes ${FUNCTIONS[fn]} argument${FUNCTIONS[fn] === 1 ? '' : 's'}`)
      return { fn, args }
    }
    // a path: steps, relative to the node filtered
    const m = text.slice(at, to).match(/^[^\s=<>!,()'"|[\]]+/)
    if (!m) throw fail(text, at, 'a leaf, a value or a function expected')
    at += m[0].length
    if (text[at] === '[') throw fail(text, at, 'a filter inside a filter: not in this phase')
    const steps = m[0].split('/').filter(Boolean).map(s => (s.startsWith('@') ? s.slice(1) : s))
    if (!steps.length) throw fail(text, at, 'a leaf expected')
    return { path: steps }
  }

  function comparison () {
    const left = operand()
    space()
    const op = OPS.find(o => text.startsWith(o, at) && at + o.length <= to)
    if (!op) {
      if (typeof left.literal === 'number') throw fail(text, at, 'a position stands alone in its filter ([1], [last()]): joined with something else, not in this phase')
      return { exists: left }
    }
    at += op.length
    return { compare: op, left, right: operand() }
  }

  function unary () {
    space()
    const call = text.slice(at, to).match(/^not\s*\(/)
    if (call) { at += call[0].length; const e = or(); expect(')'); return { not: e } }
    if (text[at] === '(') { at++; const e = or(); expect(')'); return e }
    return comparison()
  }
  function and () { const all = [unary()]; while (word('and')) all.push(unary()); return all.length === 1 ? all[0] : { and: all } }
  function or () { const all = [and()]; while (word('or')) all.push(and()); return all.length === 1 ? all[0] : { or: all } }

  // a position stands alone in its filter
  const alone = text.slice(from, to).trim()
  if (/^[1-9][0-9]*$/.test(alone)) return { position: Number(alone) }
  if (/^last\s*\(\s*\)$/.test(alone)) return { position: 'last' }
  const e = or()
  space()
  if (at < to) throw fail(text, at, 'not understood')
  return e
}

// --- processing ---

export async function query (tree, root, text) {
  if (typeof text !== 'string') throw new Error('not a query: its text')
  const match = tree.match ?? exact
  // a document's entries by the names they have in a query
  const named = tree.name ?? (key => key)
  // -> [the entry's part of a path, its value, its name]: a list is a child
  // that repeats: an entry each item, its position in its path, from 1
  const keysOf = v => (isObject(v) && !Array.isArray(v)
    ? Object.entries(v).flatMap(([k, x]) => { const n = named(k); return Array.isArray(x) ? x.flat(Infinity).map((item, i) => [`${n}[${i + 1}]`, item, n]) : [[n, x, n]] })
    : [])
  const round = tree.step ?? ((event, data, fn) => fn())
  const documents = new Map()
  // a node's document, read once a query
  const documentOf = async ref => {
    if (!tree.document || isInside(ref.node)) return null
    if (!documents.has(ref.node)) documents.set(ref.node, (await tree.document(ref.node, ref)) ?? null)
    return documents.get(ref.node)
  }
  // why the query does not go on from a node, asked once a node
  const stops = new Map()
  const stopOf = async ref => {
    if (!tree.stop || isInside(ref.node)) return null
    if (!stops.has(ref.path)) stops.set(ref.path, (await tree.stop(ref)) || null)
    return stops.get(ref.path)
  }
  const nameOf = ref => ref.path.slice(ref.path.lastIndexOf('/') + 1).replace(/\[[0-9]+\]$/, '')
  const parentOf = ref => ref.path.slice(0, ref.path.lastIndexOf('/'))
  const at = (ref, name) => (ref.path === '/' ? '' : ref.path) + '/' + name

  // One step from one reference -> the references it leads to.
  async function take (ref, step) {
    if (step === '.') return [ref]
    if (isInside(ref.node)) {
      return keysOf(ref.node.value).filter(([, , n]) => step === '*' || n === step).map(([p, v]) => ({ path: at(ref, p), node: inside(v) }))
    }
    const children = (await tree.children(ref.node)) || []
    const found = children.filter(([n]) => step === '*' || match(n, step)).map(([n, child]) => ({ path: at(ref, n), node: child }))
    if (found.length) return found
    // nothing of that name in the tree: the node's document goes on below it
    const doc = await documentOf(ref)
    return keysOf(doc).filter(([, , n]) => step === '*' || n === step).map(([p, v]) => ({ path: at(ref, p), node: inside(v) }))
  }

  // A filter's operand at a node -> its values (those of the nodes a path
  // leads to: leaves; a node that is no leaf has no value).
  async function values (ref, operand) {
    if ('literal' in operand) return [operand.literal]
    if (operand.fn === 'name') return [nameOf(ref)]
    if (operand.fn) {
      // as XPath: the first of each, nothing there the empty text
      const [x, y] = (await Promise.all(operand.args.map(a => values(ref, a)))).map(v => String(v[0] ?? ''))
      return [operand.fn === 'starts-with' ? x.startsWith(y) : x.includes(y)]
    }
    const all = []
    for (const r of await along(ref, operand.path)) {
      const v = isInside(r.node) ? r.node.value : await documentOf(r)
      if (v !== null && v !== undefined && !isObject(v)) all.push(v)
    }
    return all
  }
  // the nodes a filter's path leads to, from the node filtered
  async function along (ref, path) {
    let refs = [ref]
    for (const step of path) refs = (await Promise.all(refs.map(r => take(r, step)))).flat()
    return refs
  }
  // [operand] alone: a path, is anything there; a function, what it says
  async function reaches (ref, operand) {
    if (!operand.path) return (await values(ref, operand)).some(Boolean)
    return (await along(ref, operand.path)).length > 0
  }
  const COMPARE = {
    '=': (a, b) => a === b,
    '!=': (a, b) => a !== b,
    '<': (a, b) => a < b,
    '<=': (a, b) => a <= b,
    '>': (a, b) => a > b,
    '>=': (a, b) => a >= b
  }
  async function holds (ref, e) {
    if (e.or) { for (const x of e.or) if (await holds(ref, x)) return true; return false }
    if (e.and) { for (const x of e.and) if (!await holds(ref, x)) return false; return true }
    if (e.not) return !await holds(ref, e.not)
    if (e.exists) return reaches(ref, e.exists)
    const [left, right] = [await values(ref, e.left), await values(ref, e.right)]
    // as XPath compares: numbers when a side is one, or the order is asked;
    // else as text; true when any pair holds
    const numeric = ['<', '<=', '>', '>='].includes(e.compare) || [...left, ...right].some(v => typeof v === 'number')
    const as = v => (numeric ? Number(v) : String(v))
    return left.some(a => right.some(b => COMPARE[e.compare](as(a), as(b))))
  }

  let refs = [{ path: '/', node: root }]
  const stopped = []
  let at0 = 0
  while (at0 < text.length) {
    if (text[at0] === '[') {
      // a filter: the documents read, the set made smaller; a node the
      // query stops at has its document elsewhere: the filter goes with it
      const end = closing(text, at0)
      const e = expression(text, at0 + 1, end - 1)
      const [before, rest] = [refs.length, text.slice(at0)]
      refs = await round('filter', kept => ({ filter: text.slice(at0, end), in: before, out: kept.length }), async () => {
        if ('position' in e) {
          // of the nodes selected under the same parent, in the order they
          // came: nothing read, and a link's place among them is known here
          const groups = new Map()
          for (const ref of refs) { const p = parentOf(ref); (groups.get(p) ?? groups.set(p, []).get(p)).push(ref) }
          return [...groups.values()].map(g => (e.position === 'last' ? g.at(-1) : g[e.position - 1])).filter(Boolean)
        }
        const kept = []
        for (const ref of refs) {
          const why = await stopOf(ref)
          if (why) stopped.push({ path: ref.path, node: ref.node, rest, why })
          else if (await holds(ref, e)) kept.push(ref)
        }
        return kept
      })
      at0 = end
      continue
    }
    // a segment: steps walked, a reference each node
    const { steps, at: end } = segment(text, at0)
    const from = at0
    const before = refs.length
    refs = await round('segment', next => ({ steps: steps.join('/'), in: before, out: next.length }), async () => {
      let now = refs
      let done = from
      for (const step of steps) {
        // where the text of this step starts: what is left from here on
        done = text.indexOf(step, done)
        const next = []
        for (const ref of now) {
          const why = step === '.' ? null : await stopOf(ref)
          if (why) { stopped.push({ path: ref.path, node: ref.node, rest: text.slice(done), why }); continue }
          next.push(...await take(ref, step))
        }
        now = next
        done += step.length
      }
      return now
    })
    at0 = end
  }
  return {
    found: refs.map(r => (isInside(r.node) ? { path: r.path, value: r.node.value } : { path: r.path, node: r.node })),
    stopped
  }
}
