// The pane's favourites: the list (each with the workspaces that show it),
// and the Add / Edit page: name and address, Save, Cancel, Delete.
import type { Entry, Favorite, FavoriteDraft, Note } from '../../types'
import { usedBy } from './favs.ts'
import type { Ui } from './ui.ts'

export type FavoriteListActions = { add(): void; edit(id: string): void; back(): void }
export type FavoriteFormActions = { change(fn: (d: FavoriteDraft) => FavoriteDraft): void; save(): void; cancel(): void; remove(): void }

export function FavoriteList(ui: Ui, act: FavoriteListActions, data: { favorites: Favorite[]; entries: Entry[]; note: Note | null }) {
  const { Box, Text, Button } = ui
  return (
    <Box flexDirection="column" gap={1}>
      {data.note && <Text color={data.note.isError ? 'error' : 'success'}>{data.note.text}</Text>}
      <Box gap={2}>
        <Text bold>Favourites</Text>
        <Button key="fav-new" label="Add favourite" variant="primary" onPress={act.add} />
        <Button key="fav-back" label="Workspaces" onPress={act.back} />
      </Box>
      <Box flexDirection="column">
        {data.favorites.length === 0 && <Text dimColor>No favourites yet.</Text>}
        {data.favorites.map(f => {
          const users = usedBy(f.id, data.entries)
          return (
            <Box key={`fav-row-${f.id}`} gap={1}>
              <Text bold>{f.name}</Text>
              <Text dimColor wrap="truncate-end">{f.url}</Text>
              <Text dimColor>{users.length ? `in ${users.join(', ')}` : 'in no workspace'}</Text>
              <Button key={`fav-edit-${f.id}`} plain label="Edit" onPress={() => act.edit(f.id)} />
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

export function FavoriteForm(ui: Ui, d: FavoriteDraft, act: FavoriteFormActions) {
  const { Box, Text, Button, Input } = ui
  const field = (key: 'name' | 'url') => (v: string) => act.change(x => ({ ...x, [key]: v, error: null }))
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{d.id === null ? 'Add favourite' : `Edit ${d.name || 'favourite'}`}</Text>
      <Box flexDirection="column">
        <Input key="fav-name" label="Name " value={d.name} placeholder="Gmail" onInput={field('name')} onSubmit={field('name')} />
        <Input key="fav-url" label="Address " value={d.url} placeholder="https://mail.google.com" onInput={field('url')} onSubmit={field('url')} />
      </Box>
      {d.error && <Text color="error">{d.error}</Text>}
      {d.isConfirmingDelete ? (
        <Box gap={2}>
          <Text>{`Delete the favourite "${d.name}"?`}</Text>
          <Button key="fav-delete-confirm" label="Delete favourite" onPress={act.remove} />
          <Button key="fav-delete-keep" label="Keep" onPress={() => act.change(x => ({ ...x, isConfirmingDelete: false }))} />
        </Box>
      ) : (
        <Box gap={2}>
          {d.id !== null && <Button key="fav-delete" label="Delete" onPress={() => act.change(x => ({ ...x, isConfirmingDelete: true }))} />}
          <Button key="fav-cancel" label="Cancel" onPress={act.cancel} />
          <Button key="fav-save" label="Save" variant="primary" onPress={act.save} />
        </Box>
      )}
    </Box>
  )
}
