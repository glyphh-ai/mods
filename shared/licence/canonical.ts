// The licence's signature is over its payload's canonical JSON, as the server
// writes it in Python: json.dumps(payload, sort_keys=True, separators=(",", ":"))
// with its default ensure_ascii. To rebuild those exact bytes the payload is
// read here keeping each number as it was written (JSON.parse would turn 1.0
// into 1, which Python writes as 1.0), then written again Python's way: keys
// sorted by code point, no spaces, every character outside printable ASCII
// escaped as \uXXXX (lowercase hex, a surrogate pair above U+FFFF).

/** A JSON value with each number kept as written. */
export type Lexical =
  | null
  | boolean
  | string
  | { num: string }
  | Lexical[]
  | { obj: [string, Lexical][] }

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y
const WS = /[ \t\n\r]*/y

/** Reads JSON text, numbers kept as written. Throws on anything that is not JSON. */
export function parseLexical(text: string): Lexical {
  let i = 0
  const fail = (what: string): never => {
    throw new Error(`not JSON: ${what} at ${i}`)
  }
  const space = () => {
    WS.lastIndex = i
    WS.exec(text)
    i = WS.lastIndex
  }
  const str = (): string => {
    // JSON.parse reads one string exactly as the standard says.
    let j = i + 1
    while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
    if (j >= text.length) fail('an unended string')
    const out = JSON.parse(text.slice(i, j + 1)) as string
    i = j + 1
    return out
  }
  const value = (): Lexical => {
    space()
    const c = text[i]
    if (c === '{') {
      i++
      const obj: [string, Lexical][] = []
      space()
      if (text[i] === '}') {
        i++
        return { obj }
      }
      for (;;) {
        space()
        if (text[i] !== '"') fail('a key')
        const key = str()
        space()
        if (text[i++] !== ':') fail('a colon')
        obj.push([key, value()])
        space()
        const next = text[i++]
        if (next === '}') return { obj }
        if (next !== ',') fail('a comma')
      }
    }
    if (c === '[') {
      i++
      const arr: Lexical[] = []
      space()
      if (text[i] === ']') {
        i++
        return arr
      }
      for (;;) {
        arr.push(value())
        space()
        const next = text[i++]
        if (next === ']') return arr
        if (next !== ',') fail('a comma')
      }
    }
    if (c === '"') return str()
    for (const [word, v] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(word, i)) {
        i += word.length
        return v
      }
    }
    NUMBER.lastIndex = i
    const m = NUMBER.exec(text)
    if (!m) return fail('a value')
    i = NUMBER.lastIndex
    return { num: m[0] }
  }
  const out = value()
  space()
  if (i !== text.length) fail('text after the value')
  return out
}

const isNum = (v: Lexical): v is { num: string } => typeof v === 'object' && v !== null && 'num' in v
const isObj = (v: Lexical): v is { obj: [string, Lexical][] } => typeof v === 'object' && v !== null && 'obj' in v

/** A member of an object, or undefined. */
export function member(v: Lexical, key: string): Lexical | undefined {
  return isObj(v) ? v.obj.find(([k]) => k === key)?.[1] : undefined
}

/** The value as JSON.parse would give it. */
export function plain(v: Lexical): unknown {
  if (Array.isArray(v)) return v.map(plain)
  if (isNum(v)) return Number(v.num)
  if (isObj(v)) return Object.fromEntries(v.obj.map(([k, x]) => [k, plain(x)]))
  return v
}

/** A string as Python's json.dumps writes it with ensure_ascii. */
export function pyString(s: string): string {
  let out = '"'
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k)
    if (c === 0x22) out += '\\"'
    else if (c === 0x5c) out += '\\\\'
    else if (c === 0x0a) out += '\\n'
    else if (c === 0x0d) out += '\\r'
    else if (c === 0x09) out += '\\t'
    else if (c === 0x08) out += '\\b'
    else if (c === 0x0c) out += '\\f'
    else if (c < 0x20 || c > 0x7e) out += `\\u${c.toString(16).padStart(4, '0')}`
    else out += s[k]
  }
  return `${out}"`
}

/** Python sorts str keys by code point; JS compares UTF-16 units, which
 *  differ above U+FFFF. */
function byCodePoint(a: string, b: string): number {
  const x = [...a]
  const y = [...b]
  for (let k = 0; k < Math.min(x.length, y.length); k++) {
    const d = x[k]!.codePointAt(0)! - y[k]!.codePointAt(0)!
    if (d) return d
  }
  return x.length - y.length
}

/** The canonical JSON of a value: json.dumps(v, sort_keys=True, separators=(",", ":")). */
export function canonical(v: Lexical): string {
  if (v === null) return 'null'
  if (v === true) return 'true'
  if (v === false) return 'false'
  if (typeof v === 'string') return pyString(v)
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (isNum(v)) return v.num
  // Python keeps the last of a repeated key, as a dict does.
  const last = new Map(v.obj)
  return `{${[...last.keys()].sort(byCodePoint).map(k => `${pyString(k)}:${canonical(last.get(k)!)}`).join(',')}}`
}
