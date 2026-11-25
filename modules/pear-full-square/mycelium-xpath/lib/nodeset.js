// The node set: what a query answers. A data structure, logical: it holds
// the request, where it has read to and what its storage is, and travels as
// it is; it knows no storage. Its data is loaded when it is read, a batch
// at a time, each batch by a physical query: the query's text for the tree
// as it is stored, given by the storage's structure type
// (mycelium-xpath-physical) from the node set itself.
//   nodeset({ query, mode, layer }, physical, fixed)
//     -> { logical:  { query, mode, layer }   the request, in full
//          fixed:    the moment it was made    (a topic: its latest offset;
//                                              none: read once, whole)
//          reached:  where it has read to      null until it is read
//          physical: { type, ... }             the structure type and what
//                                              its generator needs
//          nodes:    []                        what is loaded
//          stopped:  []                        where it stopped at a
//                                              shortcut, the rest of the
//                                              query: a hop
//          done:     false }                   true when there is no more
//   reader(set, { next, took, run, observe })   its reading
//     next(set)                -> the physical query for the next part of
//                                 the next batch, null: no more (the
//                                 structure type's)
//     took(set, text, result)  -> { nodes, stopped, reached, done, full }:
//                                 what that query's result is to the node
//                                 set (the structure type's)
//     run(text)                -> { found, stopped }: the physical query
//                                 executed (the engine, on the stored tree)
//     observe(event, fn)       optional: each physical query run through
//                              it, to be logged: { logical, mode, type,
//                              from, physical }
//     -> { set, more(), all(), [Symbol.asyncIterator] }
//        more()   the next batch loaded: its nodes; null when there was no
//                 more. A batch may take several physical queries.
//        all()    every node, loading until there is no more
//        iterated node by node, loading as it goes
// (ascending: a topic read from its earliest on; when not said, from its latest back)
export function nodeset ({ query, mode = 'physical', layer = null, ascending = false }, physical = { type: 'tree' }, fixed = null) {
  return { logical: { query, mode, layer, ...(ascending ? { ascending: true } : {}) }, fixed, reached: null, physical, nodes: [], stopped: [], done: false }
}

export function reader (set, { next, took, run, observe = (event, fn) => fn() }) {
  const self = {
    set,
    async more () {
      if (set.done) return null
      const batch = []
      for (;;) {
        const text = next(set)
        if (text === null) { set.done = true; break }
        const result = await observe({ logical: set.logical.query, mode: set.logical.mode, type: set.physical.type, from: set.reached, physical: text }, () => run(text))
        const step = took(set, text, result)
        batch.push(...step.nodes)
        set.stopped.push(...step.stopped)
        set.reached = step.reached
        if (step.done) set.done = true
        if (step.done || step.full) break
      }
      set.nodes.push(...batch)
      return batch
    },
    async all () {
      while (!set.done) await self.more()
      return set.nodes
    },
    async * [Symbol.asyncIterator] () {
      let at = 0
      for (;;) {
        while (at < set.nodes.length) yield set.nodes[at++]
        if (set.done) return
        await self.more()
      }
    }
  }
  return self
}
