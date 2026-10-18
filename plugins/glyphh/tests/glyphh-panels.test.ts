import { expect, test } from 'claude-code/testing'

import { signedIn } from '../hooks/glyphh/account'
import * as A from '../hooks/glyphh/actions'
import { hostingLines, licenseLine, precedentsLine } from '../hooks/glyphh/sections/plan'
import { count, money, planLimits, priceText } from '../hooks/glyphh/shape'
import { isLinkable } from '../hooks/glyphh/ui'
import { HOME, fakeHost } from './fake-host'
import { PLANS } from './fake-server'

async function signedInHost(surface: 'desktop' | 'terminal' = 'desktop') {
  const w = fakeHost({ surface })
  await signedIn(w.gh, 'i1', w.server.TOKEN)
  return w
}

test('signed out: opening a section loads nothing', async () => {
  const w = fakeHost()
  await A.openSection(w.gh, 'org')
  expect(await w.gh.state.section.get()).toBe('org')
  expect(w.s.calls).toHaveLength(0)
})

test('account: rename, list installs, revoke another, revoke this one signs out', async () => {
  const w = await signedInHost()
  await A.openSection(w.gh, 'account')
  expect((await w.gh.state.lists.get()).installs).toHaveLength(2)
  await A.rename(w.gh, '  Chris T ')
  expect(w.s.name).toBe('Chris T')
  expect(await w.note()).toBe('Name changed.')
  await A.revokeInstall(w.gh, 'i2')
  expect((await w.gh.state.lists.get()).installs?.map(i => i.id)).toEqual(['i1'])
  await A.revokeInstall(w.gh, 'i1')
  expect(await w.gh.state.auth.get()).toEqual({ status: 'out', error: 'This install was revoked.' })
  expect(w.files.has(`${HOME}/.glyphh/install.json`)).toBe(false)
})

test('a revoked token anywhere signs this machine out', async () => {
  const w = await signedInHost()
  w.files.set(`${HOME}/.glyphh/install.json`, JSON.stringify({ install_id: 'i1', token: 'stale' }))
  await A.openSection(w.gh, 'plan')
  expect(await w.gh.state.auth.get()).toEqual({ status: 'out', error: 'This install was signed out. Sign in again.' })
  expect(await w.gh.state.me.get()).toBeNull()
})

test('org: rename, remove a member, send an invite (its link kept to copy), revoke it', async () => {
  const w = await signedInHost()
  await A.openSection(w.gh, 'org')
  expect((await w.gh.state.lists.get()).members).toHaveLength(2)
  await A.renameOrg(w.gh, 'Glyphh AI')
  expect(w.s.orgName).toBe('Glyphh AI')
  await A.removeMember(w.gh, 'u2')
  expect((await w.gh.state.lists.get()).members?.map(m => m.user_id)).toEqual(['u1'])
  await A.sendInvite(w.gh, 'new@example.com')
  expect(await w.gh.state.inviteLink.get()).toBe('https://glyphh.test/join?t=abc')
  expect(await w.note()).toBe('Invite sent to new@example.com. Copy the link below to share it.')
  expect((await w.gh.state.lists.get()).invites).toHaveLength(1)
  await A.revokeInvite(w.gh, 'inv-1')
  expect((await w.gh.state.lists.get()).invites).toHaveLength(0)
})

test('org: a member is refused admin writes, and told so', async () => {
  const w = await signedInHost()
  w.s.role = 'member'
  await A.renameOrg(w.gh, 'Mine now')
  expect(await w.gh.state.note.get()).toEqual({ text: 'Admins only. (trace tr-1)', isError: true })
  expect(w.s.orgName).toBe('Glyphh')
})

test('plan: /v1/me and the plans list load', async () => {
  const w = await signedInHost()
  await A.openSection(w.gh, 'plan')
  expect((await w.gh.state.me.get())?.plan).toMatchObject({ name: 'Free' })
  expect((await w.gh.state.lists.get()).plans?.map(p => p.name)).toEqual(['Free', 'Pro', 'Team', 'Enterprise'])
  expect(w.s.calls.find(c => c.path === '/v1/plans')?.bearer).toBeUndefined()
})

test('plan: each plan by its price, managed precedents and hosted machines; Enterprise by contract, never a rate', () => {
  expect(PLANS.map(p => `${p.name} · ${priceText(p)} · ${planLimits(p)}`)).toEqual([
    'Free · $0 · no managed precedents · no hosted machines',
    'Pro · $99/month · 100,000 managed precedents · 3 hosted machines',
    'Team · $299/month · 1,000,000 managed precedents · 10 hosted machines',
    'Enterprise · By contract · unlimited managed precedents · unlimited hosted machines',
  ])
  expect(money(1234)).toBe('$12.34')
  expect(count(1000000)).toBe('1,000,000')
})

test('plan: managed precedents used of the bucket, hosting this month, the license', async () => {
  const w = await signedInHost()
  await A.openSection(w.gh, 'plan')
  const free = await w.gh.state.me.get()
  expect(precedentsLine(free)).toBe('Managed precedents: none on this plan (local and self-hosted runtimes are unlimited)')
  expect(hostingLines(free)).toEqual(['Hosting this month (2026-10): $0, no hosted machines'])

  w.s.plan = 'Pro'
  await A.openSection(w.gh, 'plan')
  const pro = await w.gh.state.me.get()
  expect(precedentsLine(pro)).toBe('Managed precedents: 12,345 of 100,000')
  expect(hostingLines(pro)).toEqual(['Hosting this month (2026-10): $12.34', '  ada-prod · small · $12.34'])
  w.s.plan = 'Enterprise'
  await A.openSection(w.gh, 'plan')
  expect(precedentsLine(await w.gh.state.me.get())).toBe('Managed precedents: 12,345 of unlimited')

  expect(licenseLine(await w.gh.state.license.get())).toBe('License: valid, until 2999-01-01T00:00:00Z · Pro · hosted machines 3 · sync')
  expect(licenseLine(null)).toBe('License: none yet.')
  expect(licenseLine({ ok: false, error: 'expired', plan: 'Enterprise', limits: { machines: null }, features: { sync: true, ha: true, offline: true, sso: true } }))
    .toBe('License: not valid (expired) · Enterprise · hosted machines unlimited · sync, HA, offline licences, SSO')
})

test('billing: Stripe pages open in the browser pane on the desktop, as links in a terminal', async () => {
  const w = await signedInHost('desktop')
  await A.checkout(w.gh, 'Pro')
  expect(w.s.calls.at(-1)).toMatchObject({ path: '/v1/billing/checkout', body: { plan: 'Pro' } })
  expect(Object.keys(w.s.calls.at(-1)!.body)).toEqual(['plan']) // never seats
  expect(w.opened).toEqual(['https://checkout.stripe.test/c1'])
  expect(await w.gh.state.note.get()).toMatchObject({ text: 'Checkout opened in the browser pane.', link: 'https://checkout.stripe.test/c1' })

  const t = await signedInHost('terminal')
  await A.portal(t.gh)
  expect(t.opened).toEqual([])
  expect(await t.gh.state.note.get()).toMatchObject({ text: "Stripe's billing portal: open this link.", link: 'https://billing.stripe.test/p1' })
})

test("billing: change plan once subscribed; the server's refusals are said as it says them", async () => {
  const w = await signedInHost('terminal')
  await A.changePlan(w.gh, 'Team')
  expect(await w.gh.state.note.get()).toEqual({ text: "Your org isn't subscribed: start with checkout. (trace tr-1)", isError: true })
  w.s.billingStatus = 'active'
  w.s.plan = 'Pro'
  await A.checkout(w.gh, 'Team')
  expect(await w.gh.state.note.get()).toMatchObject({ text: 'Your org is already subscribed: change plan instead. (trace tr-1)', isError: true })
  await A.changePlan(w.gh, 'Team')
  expect(w.s.calls.some(c => c.path === '/v1/billing/plan' && c.body.plan === 'Team')).toBe(true)
  expect(w.s.plan).toBe('Team')
  expect((await w.gh.state.me.get())?.plan).toMatchObject({ name: 'Team' })
  w.s.plan = 'Enterprise'
  await A.changePlan(w.gh, 'Pro')
  expect(await w.gh.state.note.get()).toMatchObject({ text: 'Your Enterprise plan is by contract: talk to us at sales@glyphh.ai. (trace tr-1)', isError: true })
})

test('billing: Enterprise is Talk to us: the sales address, copied, never a checkout', async () => {
  const w = await signedInHost()
  const before = w.s.calls.length
  await A.talkToUs(w.gh)
  expect(w.s.calls).toHaveLength(before)
  expect(w.copied).toEqual(['sales@glyphh.ai'])
  expect(await w.note()).toBe('Enterprise is by contract: write to sales@glyphh.ai (copied).')
})

test('links: https and localhost draw as links, anything else as text (a bad Link refuses the panel)', () => {
  expect(isLinkable('https://checkout.stripe.com/c/1')).toBe(true)
  expect(isLinkable('http://localhost:8080/v1/device?code=X')).toBe(true)
  expect(isLinkable('http://glyphh.lan/v1/device')).toBe(false)
  expect(isLinkable('javascript:alert(1)')).toBe(false)
})
