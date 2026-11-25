// mycelium-xpath-physical: the physical side of a query. A node set
// (mycelium-xpath) is logical: it says what is asked, where it has read to
// and what its storage is. Here that is turned into the physical XPath
// that fetches its next batch from the tree as it is stored: one
// implementation a structure type, dispatched on the node set's
// (physical.type).
//   next(set)                 -> the physical query for the next part of the
//                                next batch; null: no more
//   took(set, text, result)   -> { nodes, stopped, reached, done, full }:
//                                what that query's result is to the node set
//   addressOf(set, path)      -> a stored path as its logical address
//   isType(name), TYPES       the structure types there are
// Pure functions of the node set's data: a run reproduces them.
import * as tree from './internal/tree/index.js'
import * as offsetFiles from './internal/offset-files/index.js'

export const TYPES = { tree, 'offset-files': offsetFiles }
export const isType = name => Object.hasOwn(TYPES, name)
const of = set => {
  const type = set?.physical?.type
  if (!isType(type)) throw new Error(`not a structure type: ${type} (${Object.keys(TYPES).join(', ')})`)
  return TYPES[type]
}
export const next = set => of(set).next(set)
export const took = (set, text, result) => of(set).took(set, text, result)
// a stored path as its logical address: what a reader of the result sees
export const addressOf = (set, path) => of(set).addressOf(set, path)
