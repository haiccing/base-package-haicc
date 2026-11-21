// feedback: feedback on the command it is on, recorded, the command not
// executed (README.md beside it).
export default {
  kind: 'rewrite',
  scope: 'last',
  // its text: some, written after it
  values: /\S/,
  // every word after it, to the end of the command, is its text
  tail: true,
  // the protocol the command becomes a request of
  protocol: 'haici',
  // the command's form and the text -> haici/feedback at the same URI, its
  // arguments the text, then the command's <protocol>/<action> and arguments
  rewrite: (form, text) => ({ protocol: 'haici', action: 'feedback', uri: form.uri, args: [text, `${form.protocol}/${form.action}`, ...(form.args ?? [])] })
}
