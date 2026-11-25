# logical

A command's URI read logically: a topic as its records, how it is stored hidden.

`crud/read 'done/*' --flags layer=request logical` reads the topic
`request/done` as its records, in the order they arrived, the latest
first: no folders of its storage, no file names in the URI or in the
answer; a record's own fields as attributes (`@offset`), its data by
path (`value/...`). A record's address there is
`done/*[@offset=<offset>]`. A layer that is a plain tree reads the same
either way. The XPath documentation (`haiccing/base-docs-xpath`) says
what a logical query is.

## Declaration

An `option`, `chain`; it takes no value. Written with `physical`:
`logical` holds. With neither written, the mrepo's setting says
(`/runtime/xpath.json`, `reading`).
