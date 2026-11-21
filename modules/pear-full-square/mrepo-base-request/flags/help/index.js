// help: the command it is on answered with help, not executed
// (README.md beside it).
export default {
  kind: 'rewrite',
  scope: 'last',
  values: null,
  // the protocol the command becomes a request of
  protocol: 'help',
  // the command's form -> help/annotate at the same URI, the command's
  // <protocol>/<action> and arguments its arguments
  rewrite: form => ({ protocol: 'help', action: 'annotate', uri: form.uri, args: [`${form.protocol}/${form.action}`, ...(form.args ?? [])] })
}
