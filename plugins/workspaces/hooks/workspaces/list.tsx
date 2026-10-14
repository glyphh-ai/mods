// The Workspaces pane: a launcher. Each workspace with its shape and Open
// (the same switch as /dip), and the way to the layout page's editor, where
// workspaces and favourites are made and changed.
import type { Entry, Favorite, Note } from '../../types'
import { summaryOf } from './model.ts'
import type { Ui } from './ui.ts'

export type ListActions = { open(name: string): void; edit(): void }

export type ListData = { entries: Entry[]; favorites: Favorite[]; active: string | null; note: Note | null; missing: string | null }

export function WorkspaceList(ui: Ui, act: ListActions, data: ListData) {
  const { Box, Text, Button } = ui
  return (
    <Box flexDirection="column" gap={1}>
      {data.missing && <Text color="warning">{data.missing}</Text>}
      {data.note && <Text color={data.note.isError ? 'error' : 'success'}>{data.note.text}</Text>}
      <Box gap={2}>
        <Text bold>Workspaces</Text>
        <Button key="ws-edit" label="Edit in layout page" variant="primary" onPress={act.edit} />
      </Box>
      <Box flexDirection="column">
        {data.entries.length === 0 && <Text dimColor>No workspaces yet: make one in the layout page.</Text>}
        {data.entries.map(({ slug, file }) => (
          <Box key={`ws-row-${slug}`} gap={1}>
            <Button key={`ws-open-${slug}`} label="Open" variant={file.name === data.active ? 'primary' : 'secondary'} onPress={() => act.open(file.name)} />
            <Text bold>{file.name}</Text>
            <Text dimColor wrap="truncate-end">{summaryOf(file, data.favorites)}</Text>
          </Box>
        ))}
      </Box>
      <Text dimColor>/dip and a number or name opens a workspace; /dip back returns to the one before.</Text>
    </Box>
  )
}
