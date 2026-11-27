// The value handlers: a value to bytes and back, as JSON and as AVRO's
// binary by a type.
import test from 'brittle'
import { typeOf, primitiveOf } from 'mycelium-avro'
import { json, avro } from '../index.js'

test('json: a value to bytes and back, one line', (t) => {
  const v = { to: '/level/main', body: { n: 1, s: 'é', list: [true, null] } }
  const bytes = json.encode(v)
  t.is(bytes.toString(), JSON.stringify(v) + '\n', 'one line')
  t.alike(json.decode(bytes), v)
  t.is(json.extension, 'json')
})

test('avro: a value\'s binary by the type given, and back; one that does not fit said with its place; bytes that are none said', (t) => {
  const text = avro(primitiveOf('avro/string'))
  t.is(text.extension, 'avro')
  t.alike([...text.encode('abc')], [6, 0x61, 0x62, 0x63], 'a text: its length, then its bytes: nothing else, no fingerprint, no marker')
  t.is(text.decode(text.encode('a schema, as its text: é')), 'a schema, as its text: é', 'and back')
  const note = avro(typeOf({ type: 'record', name: 'haiccing.x.note', fields: [{ name: 'title', type: 'string' }, { name: 'at', type: { type: 'long', logicalType: 'timestamp-millis' } }, { name: 'parts', type: { type: 'array', items: 'long' }, default: [] }] }))
  const v = { title: 'a', at: '2026-11-28T10:00:00.000Z', parts: [1, 2] }
  t.alike(note.decode(note.encode(v)), v, 'a record, its logical types with it: the same value back')
  t.exception(() => note.encode({ title: 'a', at: 'yesterday', parts: [] }), /not a value of its type: at, expected /, 'a value that does not fit: said with its place')
  t.exception(() => note.encode({ ...v, more: 1 }), /not a value of its type: \., expected haiccing\.x\.note/, 'strictly: a field its type does not name')
  t.exception(() => text.decode(Buffer.from([200])), /not the bytes of a value of its type/, 'bytes that are no value of it: said')
  t.exception(() => text.decode(Buffer.concat([text.encode('abc'), Buffer.from([1])])), /not the bytes of a value of its type/, 'bytes left over: said')
})

test('avro: a long text, longer than the encoder\'s buffer, whole both ways', (t) => {
  const text = avro(primitiveOf('avro/string'))
  for (const n of [4095, 4096, 4097, 20000]) {
    const s = 'x'.repeat(n)
    const b = text.encode(s)
    t.alike([b.length > n, text.decode(b) === s], [true, true], `${n} characters: every one written, read back the same`)
  }
  const mixed = `${'é'.repeat(3000)}${'€'.repeat(2000)}😀`
  t.is(text.decode(text.encode(mixed)), mixed, 'characters of two, three and four bytes, past the buffer: the same')
})
