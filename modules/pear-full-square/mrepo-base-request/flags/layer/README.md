# layer

The layer a command's own URI is read at: `main` without the flag.

`--flags layer=request` reads `crud/read done/*` at the request layers.
The URI of an action that passes its words on (`haicc`'s `goto`) stays
in `main`, a position; the flag goes on with the command that follows.

## Declaration

An `option`, `chain`; its value a layer's name, its parts joined by
`/` (`request`, `request/done`).
