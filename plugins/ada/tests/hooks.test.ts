import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { T0, callTool, runCommand, startSession, world } from './engine.ts'
import type { Account } from './glyphh.ts'

async function started($: Engine, on: On, account: Account = 'pro', options: Record<string, unknown> = {}) {
  mock.store(on, {})
  const clock = mock.clock(on, { now: T0 })
  const w = world(on, account)
  void options
  await startSession($)
  await clock.advance(1000) // what the start set going in the background (rrotor, the account) has finished
  return { ...w, clock }
}

describe('Ada in Claude', () => {
  test('the command and the five tools are registered at the start', async ($, on) => {
    const { commands, tools } = await started($, on)
    expect(commands).toContain('ada')
    expect(tools).toEqual(['ada_models', 'ada_deploy', 'ada_call', 'ada_continue', 'ada_run'])
  })

  test('without Ada in the plan, rrotor is not started and every tool says why', async ($, on) => {
    const { mac, clock, logs } = await started($, on, 'pro')
    await clock.advance(0)
    expect(mac.w.ran.filter(a => a[1] === 'run')).toEqual([])
    expect(logs.join('\n')).toContain('Ada is not in your Pro plan')
    for (const tool of ['ada_models', 'ada_deploy', 'ada_call', 'ada_continue', 'ada_run'])
      expect(await callTool($, `mcp__ada__${tool}`, {})).toEqual({ error: 'Ada is not in your Pro plan. Upgrade in /ada.' })
  })

  test('signed out: the tools ask to sign in', async ($, on) => {
    await started($, on, 'signed-out')
    expect(await callTool($, 'mcp__ada__ada_call', { model: 'daily_sales' })).toEqual({ error: 'Sign in to Glyphh to use Ada: /ada signin.' })
  })

  test('the status line follows rrotor every 5 seconds', async ($, on) => {
    const { clock, statuses, rrotor } = await started($, on)
    await clock.advance(5000)
    expect(statuses.at(-1)).toBe('rrotor ● online')
    rrotor.r.up = false
    await clock.advance(5000)
    expect(statuses.at(-1)).toBe('rrotor ○ stopped')
  })

  test('/ada shows rrotor; start and stop say what came of them; anything else shows the usage', async ($, on) => {
    const { rrotor } = await started($, on)
    expect(await runCommand($, 'ada')).toContain('rrotor 0.1.0 · link online')
    expect(await runCommand($, 'ada', 'start')).toBe('Ada is not in your Pro plan. Upgrade in /ada.')
    expect(await runCommand($, 'ada', 'stop')).toBe('rrotor did not stop: unknown /usr/local/bin/docker stop glyphh-rrotor')
    expect(await runCommand($, 'ada', 'restart')).toBe('Usage: /ada [start | stop | part | signin | signout]')
    rrotor.r.up = false
    expect(await runCommand($, 'ada')).toBe('rrotor is not running. /ada start starts it.')
  })
})
