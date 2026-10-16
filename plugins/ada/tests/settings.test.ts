import { describe, expect, test } from 'claude-code/testing'

import { settingsOf } from '../hooks/ada/settings.ts'
import { imageOf } from '../hooks/ada/image.ts'

describe('the /config rows', () => {
  test('whole: a value outside its options takes the default', () => {
    expect(settingsOf(undefined)).toEqual({ runtime: 'auto', image: '', part: '' })
    expect(settingsOf({ runtime: 'docker', image: ' rrotor:dev ' } as never)).toEqual({ runtime: 'docker', image: 'rrotor:dev', part: '' })
    expect(settingsOf({ runtime: 'podman', image: 7 } as never)).toEqual({ runtime: 'auto', image: '', part: '' })
  })

  test("the image: the developer's, unverified; else the pinned one, if this build pins one", () => {
    expect(imageOf(' rrotor:dev ')).toEqual({ image: 'rrotor:dev', pinned: false })
    expect(imageOf('')).toBeNull()
  })
})
