// Hooks: what an mrepo runs on a status transition, a file a transition its
// defining package dropped into its runtime layer:
//   /runtime/hooks/<transition>.haicc     lines, each a simple command,
//                                         run where the mrepo is (`.`)
//   boot                                 run by the runtime as it starts
//   commission                           run by the runtime as it starts,
//                                        after boot: once, its deploy
//                                        waiting for it (the runtime starts
//                                        at a deploy only)
//   initialise, start, stop, shutdown    run by the service, each as it
//                                        makes that transition
//   decommission                         run at a teardown's start, before
//                                        the runtime is stopped
// Run through the mrepo's own inbox (lines.js), each line its own request.
//   hookOf(reader, transition) -> its text, null when there is none
//       reader: what reads the mrepo ({ find }: an execution; or { read })
export const TRANSITIONS = ['boot', 'commission', 'initialise', 'start', 'stop', 'shutdown', 'decommission']
export const HOOKS = '/runtime/hooks'
export const hookAt = transition => `${HOOKS}/${transition}.haicc`

export async function hookOf (reader, transition) {
  if (!TRANSITIONS.includes(transition)) throw new Error(`not a transition: ${transition} (${TRANSITIONS.join(', ')})`)
  // catch: a file that is not there is no hook
  const bytes = reader.find ? await reader.find(hookAt(transition)) : await reader.read(hookAt(transition)).catch(() => null)
  return bytes === null ? null : bytes.toString()
}
