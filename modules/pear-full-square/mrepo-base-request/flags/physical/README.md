# physical

A command's URI read as its layer is stored: its folders and files, where a topic is otherwise read as its records.

`crud/read 'done/*/*/*' --flags layer=request physical` reads
`request/done` as it is stored: its folders by an offset's digits, a
record a file. Without it the
reading is logical, a topic as its records: this flag is the one way to switch, for a command,
to look at the storage itself (testing, repair).

## Declaration

An `option`, `chain`; it takes no value.
