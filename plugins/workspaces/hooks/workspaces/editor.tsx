// The workspaces pane: the list, a new workspace, and for the one picked its
// name, folder, model, permission mode, effort, panes, sidebar, tabs, delete.
import type { Elements } from 'claude-code'

import type { Entry, Note, WorkspaceFile } from '../../types'
import * as A from './actions.ts'
import { EFFORTS, PANES, PANE_LABELS, PERMISSION_MODES } from './model.ts'

/** The elements the pane draws with: the terminal's and the desktop's alike. */
export type Ui = Pick<Elements['desktop'], 'Box' | 'Text' | 'Button' | 'Input' | 'Select'>

export type View = { entries: Entry[]; selected: string | null; active: string | null; note: Note | null }

const options = (values: readonly string[]) => [{ value: '', label: '(session default)' }, ...values.map(value => ({ value }))]

function Tabs(ui: Ui, ctx: A.Ctx, file: WorkspaceFile) {
  const { Box, Text, Button, Input } = ui
  const name = file.name
  return (
    <Box flexDirection="column">
      <Text bold>Tabs</Text>
      {file.tabs.length === 0 && <Text dimColor>No tabs.</Text>}
      {file.tabs.map((tab, i) => (
        <Box key={`ws-tab-${i}`} gap={1}>
          <Text>{tab.name}</Text>
          <Text dimColor wrap="truncate-end">{tab.url}</Text>
          <Button key={`ws-tab-remove-${i}`} plain label="remove" onPress={() => A.removeTab(ctx, name, i)} />
        </Box>
      ))}
      <Input key="ws-tab-add" label="Add tab " placeholder="https://…" submitLabel="add" onSubmit={v => A.addTab(ctx, name, v)} />
    </Box>
  )
}

function Details(ui: Ui, ctx: A.Ctx, file: WorkspaceFile) {
  const { Box, Text, Button, Input, Select } = ui
  const name = file.name
  return (
    <Box flexDirection="column" gap={1} borderStyle="single" paddingX={1}>
      <Box flexDirection="column">
        <Input key="ws-rename" label="Name " value={name} submitLabel="rename" onSubmit={v => A.rename(ctx, name, v)} />
        <Input key="ws-folder" label="Folder " value={file.folder ?? ''} placeholder="the session's own" onSubmit={v => A.setField(ctx, name, 'folder', v)} />
        <Input key="ws-model" label="Model " value={file.model ?? ''} placeholder="session default" onSubmit={v => A.setField(ctx, name, 'model', v)} />
        <Select
          key="ws-permission"
          label="Permission mode "
          options={options(PERMISSION_MODES)}
          value={file.permission_mode ?? ''}
          onSelect={v => A.setField(ctx, name, 'permission_mode', v)}
        />
        <Select key="ws-effort" label="Effort " options={options(EFFORTS)} value={file.effort ?? ''} onSelect={v => A.setField(ctx, name, 'effort', v)} />
      </Box>
      <Box gap={1}>
        <Text bold>Panes</Text>
        {PANES.map(pane => (
          <Button
            key={`ws-pane-${pane}`}
            label={PANE_LABELS[pane]}
            variant={file.desktop_panes.includes(pane) ? 'primary' : 'secondary'}
            onPress={() => A.togglePane(ctx, name, pane)}
          />
        ))}
        <Button
          key="ws-sidebar"
          plain
          label={file.collapse_sidebar ? 'Sidebar: collapsed' : 'Sidebar: shown'}
          onPress={() => A.toggleSidebar(ctx, name)}
        />
      </Box>
      {Tabs(ui, ctx, file)}
      <Box>
        <Button key="ws-delete" label="Delete workspace" onPress={() => A.remove(ctx, name)} />
      </Box>
    </Box>
  )
}

export function Editor(ui: Ui, ctx: A.Ctx, view: View) {
  const { Box, Text, Button, Input } = ui
  const current = view.entries.find(e => e.file.name === view.selected)
  return (
    <Box flexDirection="column" gap={1}>
      {view.note && <Text color={view.note.isError ? 'error' : 'success'}>{view.note.text}</Text>}
      <Box flexDirection="column">
        {view.entries.length === 0 && <Text dimColor>No workspaces yet: name one below.</Text>}
        {view.entries.map(({ slug, file }, i) => (
          <Button
            key={`ws-pick-${slug}`}
            plain
            label={`${file.name === view.selected ? '›' : ' '} ${i + 1} ${file.name}${file.name === view.active ? ' (open)' : ''}`}
            onPress={() => ctx.selected.set(() => file.name)}
          />
        ))}
      </Box>
      {current && Details(ui, ctx, current.file)}
      <Input key="ws-new" label="New workspace " placeholder="name" submitLabel="create" onSubmit={v => A.create(ctx, v)} />
      <Text dimColor>/dip and a number or name opens a workspace; /dip back returns to the one before.</Text>
    </Box>
  )
}
