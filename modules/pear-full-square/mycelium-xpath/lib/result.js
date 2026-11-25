// XPathResult and XPathIterator: what a query hands back, and how it is read.
//
// XPathResult: the result of a logical query. It says what was asked and
// how that is translated to its storage (its metadata), and it holds,
// privately, the way to get more of it: a reference it calls itself. It
// is where logical and physical meet; nothing of the physical side is a
// reader's to do.
//
// XPathIterator: the reading of a result (the standard's iterator form):
// the next node asked for, each at its logical address. When the reading
// crosses the end of what the result holds, the result gets its next
// slice behind the scenes; the reader sees a sequence, never a slice. How
// many nodes a reader takes is the reader's own.
//
//   new XPathResult(logical, { physical, fixed, next, took, run, address, observe })
//     logical   { query, mode, layer }: the request
//     physical  { type, ... }: its storage's structure type and what its
//               generator needs ({ type: 'tree' } when none is given)
//     fixed     the moment it is made (a topic: its latest offset)
//     next, took         the structure type's (mycelium-xpath-physical)
//     run(text)          a physical query executed: { found, stopped }
//     address(set, path) a stored path as its logical address (the
//                        structure type's; the path itself when none)
//     observe(event, fn) optional: each physical query run through it
//   result.metadata     { logical, physical, fixed, reached, done, last }:
//                       the logical query; its physical translation: the
//                       storage's structure, the moment it is fixed at,
//                       how far it is read, the last physical query run
//                       for it (each one is in the log of who observes)
//   result.stopped      where it stopped at a shortcut, so far
//   result.iterator()   -> an XPathIterator, from its start
//   for await (const node of result)
//
//   await iterator.iterateNext()  the next node: { path, stored, node } or
//                       { path, stored, value }: path its logical address,
//                       stored where it is stored; null at the end
//   await iterator.take(n)   the next n, fewer at the end
//   await iterator.all()     every node left
//   for await (const node of iterator)
import { nodeset, reader } from './nodeset.js'

export class XPathResult {
  #set
  #more
  #address
  #last = null
  constructor (logical, { physical = { type: 'tree' }, fixed = null, next, took, run, address = (set, path) => path, observe } = {}) {
    this.#set = nodeset(logical, physical, fixed)
    // the physical query it is at: its translation, as it goes
    const ran = text => { this.#last = text; return run(text) }
    const reading = reader(this.#set, { next, took, run: ran, ...(observe ? { observe } : {}) })
    // the reference to get more: called by the result itself, when a
    // reading crosses the end of what it holds
    this.#more = () => reading.more()
    this.#address = address
  }

  get metadata () {
    const { logical, physical, fixed, reached, done } = this.#set
    return { logical, physical, fixed, reached, done, last: this.#last }
  }

  get stopped () { return this.#set.stopped }

  // (the node at a position of it, fetched when it is not held yet: the
  // iterator's one way in; undefined past its end)
  async #at (i) {
    while (i >= this.#set.nodes.length && !this.#set.done) await this.#more()
    if (i >= this.#set.nodes.length) return undefined
    const { path, ...rest } = this.#set.nodes[i]
    return { path: this.#address(this.#set, path), stored: path, ...rest }
  }

  iterator () { return new XPathIterator(i => this.#at(i)) }
  [Symbol.asyncIterator] () { return this.iterator()[Symbol.asyncIterator]() }
}

export class XPathIterator {
  #at
  #i = 0
  constructor (at) { this.#at = at }

  async iterateNext () {
    const node = await this.#at(this.#i)
    if (node === undefined) return null
    this.#i++
    return node
  }

  async take (n) {
    const out = []
    for (let node; out.length < n && (node = await this.iterateNext()) !== null;) out.push(node)
    return out
  }

  all () { return this.take(Infinity) }

  async * [Symbol.asyncIterator] () {
    for (let node; (node = await this.iterateNext()) !== null;) yield node
  }
}
