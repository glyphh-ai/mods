// What the licence draws in the mod's pane: the locked page once the trial is
// over, the trial's line above the mod while it runs, and the licensed line.
import type { Elements } from 'claude-code'

import type { LicenceState } from '../../types'
import { ABOUT, MOD, PRICE, PRODUCT, TRIAL_DAYS } from './config.ts'

/** The elements the licence draws with: every surface has them. */
export type LicenceUi = Pick<Elements['mobile'], 'Box' | 'Text' | 'Button'>

export type LicenceActions = { buy(): void; cancel(): void; copy(): void }

function unlock(ui: LicenceUi, state: LicenceState, act: LicenceActions) {
  const { Box, Text, Button } = ui
  return (
    <Box flexDirection="column">
      <Box gap={2}>
        {state.isWaiting ? (
          <Button key="licence-cancel" label="Cancel" onPress={act.cancel} />
        ) : (
          <Button key="licence-buy" label={`Unlock — ${PRICE}`} variant="primary" onPress={act.buy} />
        )}
      </Box>
      {state.note && <Text dimColor>{state.note}</Text>}
    </Box>
  )
}

export function Locked(ui: LicenceUi, state: LicenceState, act: LicenceActions) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{PRODUCT}</Text>
      {ABOUT.map((line, i) => (
        <Text key={`about-${i}`}>{line}</Text>
      ))}
      <Text>{`The ${TRIAL_DAYS}-day trial has ended. Unlock ${PRODUCT} for ${PRICE}, once.`}</Text>
      {unlock(ui, state, act)}
      <Text dimColor>{`Bought it on another machine? /${MOD} key <licence>`}</Text>
    </Box>
  )
}

export function TrialBar(ui: LicenceUi, text: string, state: LicenceState, act: LicenceActions) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column">
      <Text bold>{text}</Text>
      {unlock(ui, state, act)}
    </Box>
  )
}

export function LicensedBar(ui: LicenceUi, act: LicenceActions) {
  const { Box, Text, Button } = ui
  return (
    <Box gap={2}>
      <Text dimColor>{`${PRODUCT} is unlocked.`}</Text>
      <Button key="licence-copy" plain label="Copy licence key" onPress={act.copy} />
    </Box>
  )
}
