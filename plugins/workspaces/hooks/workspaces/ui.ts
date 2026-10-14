import type { Elements } from 'claude-code'

/** The elements the pane draws with: the terminal's and the desktop's alike. */
export type Ui = Pick<Elements['desktop'], 'Box' | 'Text' | 'Button' | 'Input' | 'Select'>
