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

describe('Programs in Claude', () => {
  test('the command and the five tools are registered at the start', async ($, on) => {
    const { commands, tools } = await started($, on)
    expect(commands).toContain('programs')
    expect(tools).toEqual(['programs_list', 'program_deploy', 'program_call', 'program_continue', 'run_status'])
  })

  test('without Programs in the plan, rrotor is not started and every tool says why', async ($, on) => {
    const { mac, clock, logs } = await started($, on, 'pro')
    await clock.advance(0)
    expect(mac.w.ran.filter(a => a[1] === 'run')).toEqual([])
    expect(logs.join('\n')).toContain('Programs is not in your Pro plan')
    for (const tool of ['programs_list', 'program_deploy', 'program_call', 'program_continue', 'run_status'])
      expect(await callTool($, `mcp__programs__${tool}`, {})).toEqual({ error: 'Programs is not in your Pro plan. Upgrade in /programs.' })
  })

  test('signed out: the tools ask to sign in', async ($, on) => {
    await started($, on, 'signed-out')
    expect(await callTool($, 'mcp__programs__program_call', { program: 'daily_sales' })).toEqual({ error: 'Sign in to Glyphh to use Programs: /programs signin.' })
  })

  test('the status line follows rrotor every 5 seconds', async ($, on) => {
    const { clock, statuses, rrotor } = await started($, on)
    await clock.advance(5000)
    expect(statuses.at(-1)).toBe('rrotor ● online')
    rrotor.r.up = false
    await clock.advance(5000)
    expect(statuses.at(-1)).toBe('rrotor ○ stopped')
  })

  test('/programs shows rrotor; start and stop say what came of them; anything else shows the usage', async ($, on) => {
    const { rrotor } = await started($, on)
    expect(await runCommand($, 'programs')).toContain('rrotor 0.1.0 · link online')
    expect(await runCommand($, 'programs', 'start')).toBe('Programs is not in your Pro plan. Upgrade in /programs.')
    expect(await runCommand($, 'programs', 'stop')).toBe('rrotor did not stop: unknown /usr/local/bin/docker stop glyphh-rrotor')
    expect(await runCommand($, 'programs', 'restart')).toBe('Usage: /programs [start | stop | signin | signout]')
    rrotor.r.up = false
    expect(await runCommand($, 'programs')).toBe('rrotor is not running. /programs start starts it.')
  })
})
