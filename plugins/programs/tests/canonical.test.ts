import { describe, expect, test } from 'claude-code/testing'

import { canonical, member, parseLexical, plain, pyString } from '../hooks/licence/canonical.ts'
import { PRO, PYTHON, PYTHON_CANONICAL } from './licences.ts'

describe("the licence's canonical JSON, as Python writes it", () => {
  test("a realistic payload rebuilds Python's json.dumps byte for byte: nested limits, nulls, non-ASCII, 1.0, 1e-05, a big int", () => {
    const payload = member(parseLexical(PYTHON), 'payload')!
    expect(canonical(payload)).toBe(PYTHON_CANONICAL)
  })

  test('keys sorted, no spaces; numbers kept as written, which JSON.parse would not', () => {
    expect(canonical(parseLexical('{ "b": 1.0, "a": [ 1e-05, -0, 2E+3, true, false, null ], "A": {} }'))).toBe('{"A":{},"a":[1e-05,-0,2E+3,true,false,null],"b":1.0}')
    expect(JSON.stringify(JSON.parse('{"b":1.0}'))).toBe('{"b":1}')
  })

  test('strings escaped as ensure_ascii does: quotes, backslashes, controls, DEL, non-ASCII, astral as a surrogate pair', () => {
    expect(pyString('a"b\\c\n\r\t\b\f\u0001\u007f é ✓ 🚀')).toBe('"a\\"b\\\\c\\n\\r\\t\\b\\f\\u0001\\u007f \\u00e9 \\u2713 \\ud83d\\ude80"')
    expect(pyString('/')).toBe('"/"')
  })

  test('keys sort by code point, as Python sorts str (astral after U+FFFF, unlike UTF-16 order)', () => {
    expect(canonical(parseLexical('{"￿":1,"🚀":2,"Z":3,"a":4}'))).toBe('{"Z":3,"a":4,"\\uffff":1,"\\ud83d\\ude80":2}')
    expect(canonical(parseLexical('{"ab":1,"a":2}'))).toBe('{"a":2,"ab":1}')
  })

  test('a repeated key keeps its last value, as a Python dict does', () => {
    expect(canonical(parseLexical('{"a":1,"a":2}'))).toBe('{"a":2}')
  })

  test('plain gives what JSON.parse gives; member reads one key', () => {
    expect(plain(parseLexical(PRO))).toEqual(JSON.parse(PRO))
    expect(member(parseLexical('{"a":1}'), 'b')).toBeUndefined()
    expect(member(parseLexical('[1]'), 'a')).toBeUndefined()
  })

  test('anything that is not JSON is refused', () => {
    for (const bad of ['', '{', '{"a"}', '{"a":1,}', '[1,]', '[1 2]', '{"a":1} x', 'nul', '01', '"open', '{a:1}', '1.', '{"a":1;}']) {
      expect(() => parseLexical(bad)).toThrow()
    }
    expect(parseLexical(' [ ] ')).toEqual([])
    expect(parseLexical('{}')).toEqual({ obj: [] })
  })
})
