// base-package-haicc's protocol: haicc, a command executed at a node
// position, or sent on where the node is a shortcut. Linked into an mrepo,
// its config is loaded by the runtime and its action run.
// The work is mrepo-base-haicc's; here the mounting.
import { goto, script, mrepos } from './modules/pear-full-square/mrepo-base-haicc/index.js'

// The haicc protocol's config, the package's: goto, its default action (haicc alone is
// haicc/goto), at any position. Not behind the service's door: the command
// that follows is checked where it is executed. `command`: the words
// after its URI are a command, passed on as written (a flag list among
// them is that command's, not goto's).
export const protocols = {
  haicc: {
    package: 'haiccing/base-package-haicc',
    description: 'A command executed at the node positions a URI selects, or sent on where it reaches a shortcut.',
    default: 'goto',
    actions: {
      goto: { uris: ['**'], args: ['command'], command: true, description: 'Go to the node positions the URI selects and execute the command that follows at each; where the URI reaches a shortcut, the command is sent to the mrepo linked there, with what is left of the URI.' },
      script: { uris: ['**'], args: ['script'], description: 'A script\'s lines, each a simple command, executed where the URI points, each after the one before; the first that fails ends it. Its argument the lines, one string (a shell multi-line string, or a heredoc).' },
      mrepos: { uris: ['**'], description: 'The install\'s mrepos as its registry (the work folder\'s mrepos/) holds them, read only, selected by an xpath written where the URI is (none: every one), over their unique URIs and their records: each { uri, position (from here, through the links, forward only; null where not forward), package, running }.' }
    }
  }
}

export const actions = {
  haicc: { goto, script, mrepos }
}
