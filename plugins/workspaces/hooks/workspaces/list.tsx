// The pane's first page: every workspace with its shape, Open (the same
// switch as /dip) and Edit, and the ways to a new workspace and to favourites.
import type { Entry, Favorite, Note } from '../../types'
import { summaryOf } from './draft.ts'
import type { Ui } from './ui.ts'

export type ListActions = { open(name: string): void; edit(name: string): void; add(): void; favorites(): void }

export type ListData = { entries: Entry[]; favorites: Favorite[]; active: string | null; note: Note | null; missing: string | null }

export function WorkspaceList(ui: Ui, act: ListActions, data: ListData) {
  const { Box, Text, Button } = ui
  return (
    <Box flexDirection="column" gap={1}>
      {data.missing && <Text color="warning">{data.missing}</Text>}
      {data.note && <Text color={data.note.isError ? 'error' : 'success'}>{data.note.text}</Text>}
      <Box gap={2}>
        <Text bold>Workspaces</Text>
        <Button key="ws-new" label="New workspace" variant="primary" onPress={act.add} />
        <Button key="ws-favorites" label="Favourites" onPress={act.favorites} />
      </Box>
      <Box flexDirection="column">
        {data.entries.length === 0 && <Text dimColor>No workspaces yet.</Text>}
        {data.entries.map(({ slug, file }) => (
          <Box key={`ws-row-${slug}`} gap={1}>
            <Button key={`ws-open-${slug}`} label="Open" variant={file.name === data.active ? 'primary' : 'secondary'} onPress={() => act.open(file.name)} />
            <Text bold>{file.name}</Text>
            <Text dimColor wrap="truncate-end">{summaryOf(file, data.favorites)}</Text>
            <Button key={`ws-edit-${slug}`} plain label="Edit" onPress={() => act.edit(file.name)} />
          </Box>
        ))}
      </Box>
      <Text dimColor>/dip and a number or name opens a workspace; /dip back returns to the one before.</Text>
    </Box>
  )
}
