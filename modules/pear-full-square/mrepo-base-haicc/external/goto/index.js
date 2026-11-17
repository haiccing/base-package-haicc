// goto: haicc <URI> <command>, the command that follows executed at each
// node position the URI selects, or sent on where it reaches a shortcut
// (README.md beside it).
import { segmented, joined, selects, positionOf, ROOT } from 'mycelium-uri'
import { query, MAIN, REGISTRY } from 'mrepo-base-xpath'

export async function goto (exec, { uri, args = [] }) {
  if (!args.length) throw new Error('missing argument: command')
  const whole = joined(segmented(uri))
  const command = args.join(' ')
  // the mrepo itself, above its layers: its own commands, executed here
  if (whole === ROOT) {
    exec.log('verbose', 'executed here', { at: ROOT, command })
    return exec.run(args, { at: positionOf(uri) })
  }
  if (whole !== MAIN && !whole.startsWith(`${MAIN}/`)) throw new Error(`not a position in main: ${whole} (main, main/<position>)`)
  // An mrepo by its registry reference, registry/<swarm>/<name>: where the
  // registry records it is linked, then on as at that position; what
  // follows the reference, below it there.
  const ref = whole.match(/^main\/registry\/([a-z][a-z0-9-]*)\/([a-z][a-z0-9-]*)(\/.*)?$/)
  if (ref && !selects(whole)) {
    const bytes = await exec.find(`${MAIN}/${REGISTRY}/${ref[1]}/${ref[2]}/.node.json`)
    let at = null
    // catch: a node there that is no record says nothing about where it is linked
    try { at = bytes === null ? null : JSON.parse(bytes.toString()).at ?? null } catch {}
    if (at) {
      exec.log('verbose', 'registry', { mrepo: `${ref[1]}/${ref[2]}`, at })
      return goto(exec, { uri: [MAIN, `${at}${ref[3] ?? ''}`], args })
    }
  }
  const { found, stopped } = await query(exec, uri)
  // where the command goes: the positions selected, and where the query
  // stopped at a shortcut with some of it left
  const none = found.find(f => f.kind === 'value' || f.kind === 'file')
  if (none && !selects(whole)) throw new Error(`haicc ${none.at}: not a position (a node; a ${none.kind === 'file' ? 'file' : 'value inside a document'} is none)`)
  const here = found.filter(f => f.kind === 'node' || f.kind === 'folder')
  const links = [...here.filter(f => f.shortcut).map(f => ({ ...f, rest: null })), ...stopped]
  if (links.length) {
    // the usage restriction: on from one shortcut at a time (a known issue,
    // resolved with the union)
    if (here.length + stopped.length > 1) throw new Error(`haicc ${whole.slice(MAIN.length + 1)}: not yet: it reaches a shortcut (${links.map(l => l.at).join(', ')}) among ${here.length + stopped.length} positions; a command goes on from one shortcut at a time (haicc ${links[0].at} ...)`)
    // the data originates elsewhere: the command goes there, with what is
    // left of the URI in front of it, a goto there
    const [to] = links
    const sent = to.rest ? ['haicc', to.rest, ...args] : args
    exec.log('verbose', 'sent on', { at: to.at, mrepo: to.shortcut.mrepo, command: sent.join(' ') })
    return exec.forward(to.shortcut, sent)
  }
  // ordinary nodes: executed here, in the context of each position: the
  // command that follows stands there, its URI read behind the position
  const run = at => { exec.log('verbose', 'executed here', { at, command }); return exec.run(args, { at: positionOf([MAIN, at]) }) }
  // a URI that names one position: there, or an error; what the command gave
  if (!selects(whole)) {
    if (!here.length) throw new Error(`haicc ${whole.slice(MAIN.length + 1) || ROOT}: no node there`)
    return run(here[0].at)
  }
  // one that selects: the command at each, in order; what each gave, a list
  const out = []
  for (const f of here) out.push({ at: f.at, value: await run(f.at) })
  return out
}
