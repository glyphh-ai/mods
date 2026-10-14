import type { Elements } from 'claude-code'

/** The elements the pane draws with: every surface has them. */
export type Ui = Pick<Elements['mobile'], 'Box' | 'Text' | 'Button'>
