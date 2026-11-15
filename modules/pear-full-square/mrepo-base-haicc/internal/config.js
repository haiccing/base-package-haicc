// The haicc protocol's config: goto, its default action (haicc alone is
// haicc/goto), at any position. Not behind the service's door: the command
// that follows is checked where it is executed. `command`: the words
// after its URI are a command, passed on as written (a flag list among
// them is that command's, not goto's).
export const CONFIG = {
  description: 'A command executed at a node position, or sent on where the node is a shortcut.',
  default: 'goto',
  actions: {
    goto: { uris: ['**'], args: ['command'], command: true, description: 'Go to this node position and execute the command that follows; at a shortcut, the command is sent to the mrepo linked there.' }
  }
}
