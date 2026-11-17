# mycelium-value-json

An encoding as a handler: one value to bytes and back, as one line of JSON.

## Links

- [test](test/)

## Usage

```js
import * as json from 'mycelium-value-json'
json.extension            // 'json'
json.encode({ a: 1 })     // <Buffer '{"a":1}\n'>
json.decode(bytes)        // { a: 1 }
```

## Tests

- `brittle-bare test/*.test.js` (Bare installed): a value to bytes and back; each test by its name in [test/](test/).
