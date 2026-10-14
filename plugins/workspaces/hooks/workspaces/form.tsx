// The pane's Add / Edit page: name, folder, the grid (a starter layout, or
// columns, rows and sizes), what each cell shows, then Save, Cancel, Delete.
import type { Draft, Favorite } from '../../types'
import { STARTERS, choiceOf, choices, slots, withChoice, withGrid, withSpan, withStarter, type Starter } from './draft.ts'
import { MAX_GRID } from './model.ts'
import type { Ui } from './ui.ts'

export type FormActions = { change(fn: (d: Draft) => Draft): void; save(): void; cancel(): void; remove(): void }

const counts = (n: number) => Array.from({ length: n }, (_, i) => ({ value: String(i + 1) }))

function Footer(ui: Ui, d: Draft, act: FormActions) {
  const { Box, Text, Button } = ui
  if (d.isConfirmingDelete) {
    return (
      <Box gap={2}>
        <Text>{`Delete "${d.original}"? Its file is removed.`}</Text>
        <Button key="ws-delete-confirm" label="Delete workspace" onPress={act.remove} />
        <Button key="ws-delete-keep" label="Keep" onPress={() => act.change(x => ({ ...x, isConfirmingDelete: false }))} />
      </Box>
    )
  }
  return (
    <Box gap={2}>
      {d.original !== null && <Button key="ws-delete" label="Delete" onPress={() => act.change(x => ({ ...x, isConfirmingDelete: true }))} />}
      <Button key="ws-cancel" label="Cancel" onPress={act.cancel} />
      <Button key="ws-save" label="Save" variant="primary" onPress={act.save} />
    </Box>
  )
}

export function WorkspaceForm(ui: Ui, d: Draft, favorites: Favorite[], act: FormActions) {
  const { Box, Text, Input, Select } = ui
  const field = (key: keyof Pick<Draft, 'name' | 'folder' | 'widths' | 'heights'>) => (v: string) => act.change(x => ({ ...x, [key]: v, error: null }))
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{d.original === null ? 'New workspace' : `Edit ${d.original}`}</Text>
      <Box flexDirection="column">
        <Input key="ws-name" label="Name " value={d.name} placeholder="My workspace" onInput={field('name')} onSubmit={field('name')} />
        <Input key="ws-folder" label="Folder " value={d.folder} placeholder="No folder" onInput={field('folder')} onSubmit={field('folder')} />
      </Box>
      <Box flexDirection="column">
        <Select
          key="ws-starter"
          label="Starter layout "
          options={[{ value: '', label: '(this grid)' }, ...Object.entries(STARTERS).map(([value, label]) => ({ value, label }))]}
          value=""
          onSelect={v => v && act.change(x => withStarter(x, v as Starter, favorites))}
        />
        <Select key="ws-cols" label="Columns " options={counts(MAX_GRID)} value={String(d.cols)} onSelect={v => act.change(x => withGrid(x, Number(v), x.rows))} />
        <Select key="ws-rows" label="Rows " options={counts(MAX_GRID)} value={String(d.rows)} onSelect={v => act.change(x => withGrid(x, x.cols, Number(v)))} />
        <Input key="ws-widths" label="Column widths (%) " value={d.widths} placeholder="even" onInput={field('widths')} onSubmit={field('widths')} />
        <Input key="ws-heights" label="Row heights (%) " value={d.heights} placeholder="even" onInput={field('heights')} onSubmit={field('heights')} />
      </Box>
      <Box flexDirection="column">
        <Text bold>Cells</Text>
        {slots(d).map(({ col, row, cell, maxSpan }) => (
          <Box key={`ws-slot-${col}-${row}`} gap={1}>
            <Text>{`Column ${col + 1}, row ${row + 1}`}</Text>
            <Select key={`ws-cell-${col}-${row}`} options={choices(favorites)} value={choiceOf(cell)} onSelect={v => act.change(x => withChoice(x, col, row, v))} />
            {cell && maxSpan > 1 && (
              <Select
                key={`ws-span-${col}-${row}`}
                label="Rows "
                options={counts(maxSpan)}
                value={String(cell.row_span ?? 1)}
                onSelect={v => act.change(x => withSpan(x, col, row, Number(v)))}
              />
            )}
          </Box>
        ))}
      </Box>
      {d.error && <Text color="error">{d.error}</Text>}
      {Footer(ui, d, act)}
    </Box>
  )
}
