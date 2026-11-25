// read: crud/read <URI>, the nodes a URI selects (README.md beside it).
import { modeOf } from 'mrepo-base-request'
import { place, select } from '../../internal/node/index.js'

// log: in select (../../internal/node/index.js): each node; the query's steps in mrepo-base-xpath
// (how the URI is read: logical, a topic as its records; its physical
// flag: as its layer is stored)
export async function read (exec, { uri, flags = {} }) {
  return (await select(exec, place(uri), { mode: modeOf(flags) })).map(s => s.node)
}
