// layer: the layer a command's own URI is read at (README.md beside it).
export default {
  kind: 'option',
  scope: 'chain',
  // a layer's name, its parts joined by /: request, request/done
  values: /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/
}
