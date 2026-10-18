// Plan: the org's plan, the managed precedents its hosted runtimes hold of
// the plan's bucket, its hosting this month (/v1/me), the license this
// machine holds, and every plan (/v1/plans). Members and installs are
// unlimited on every plan, so neither is counted here.

import type { Json, LicenseInfo } from '../../../types'
import { count, hostingOf, limitText, money, obj, planLimits, planName, planOf, precedentsOf, priceText, str } from '../shape'
import type { Ctx } from '../ui'

const FEATURES: [string, string][] = [
  ['sync', 'sync'],
  ['ha', 'HA'],
  ['offline', 'offline licences'],
  ['sso', 'SSO'],
]

/** What the plan's managed bucket holds: none on Free, where only local and
 *  self-hosted runtimes run (and are unlimited). */
export function precedentsLine(me: Json | null): string {
  const p = precedentsOf(me)
  const limit = p.limit === undefined ? obj(planOf(me).limits).precedents : p.limit
  if (limit === 0) return 'Managed precedents: none on this plan (local and self-hosted runtimes are unlimited)'
  return `Managed precedents: ${count(p.used ?? 0)} of ${limit === null || limit === undefined ? 'unlimited' : count(limit)}`
}

/** The hosted machines' month so far, all in, and each machine's own. */
export function hostingLines(me: Json | null): string[] {
  const h = hostingOf(me)
  const machines = Array.isArray(h.machines) ? (h.machines as Json[]) : []
  const total = typeof h.month_to_date_cents === 'number' ? h.month_to_date_cents : 0
  const month = h.month ? ` (${str(h.month)})` : ''
  return [
    `Hosting this month${month}: ${money(total)}${machines.length ? '' : ', no hosted machines'}`,
    ...machines.map(m => `  ${str(m.name)} · ${str(m.size)} · ${money(typeof m.cents === 'number' ? m.cents : 0)}`),
  ]
}

/** The license as checked: valid or why not, until when, its plan, its
 *  hosted machines and the features it carries. */
export function licenseLine(lic: LicenseInfo | null): string {
  if (!lic) return 'License: none yet.'
  const state = lic.ok ? 'valid' : `not valid (${lic.error ?? 'unknown'})`
  const until = lic.expires_at ? `, until ${lic.expires_at}` : ''
  const machines = 'machines' in lic.limits ? ` · hosted machines ${limitText(lic.limits.machines)}` : ''
  const on = FEATURES.filter(([k]) => lic.features?.[k]).map(([, label]) => label)
  return `License: ${state}${until}${lic.plan ? ` · ${lic.plan}` : ''}${machines}${on.length ? ` · ${on.join(', ')}` : ''}`
}

export async function Plan(ctx: Ctx) {
  const { gh, me, lists } = ctx
  const { Box, Text } = ctx.ui
  const lic = await gh.state.license.get()
  const plans = lists.plans ?? []
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Plan: {planName(me)}</Text>
      <Box flexDirection="column">
        <Text>{precedentsLine(me)}</Text>
        {hostingLines(me).map((line, i) => (
          <Text key={`host-${i}`}>{line}</Text>
        ))}
      </Box>
      <Text dimColor>{licenseLine(lic)}</Text>
      <Box flexDirection="column">
        <Text bold>Plans</Text>
        {plans.length === 0 && <Text dimColor>Loading plans…</Text>}
        {plans.map(p => (
          <Text key={`plan-${str(p.name)}`}>
            {str(p.name)} · {priceText(p)} · {planLimits(p)}
          </Text>
        ))}
        <Text dimColor>Members, installs, models and self-hosted runtimes are unlimited on every plan.</Text>
      </Box>
    </Box>
  )
}
