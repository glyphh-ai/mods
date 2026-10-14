// workspaces.js — the layout page's workspace editor: the Glyphh app's
// Workspaces page and grid builder (layouts.html and layouts.ts at v1.6.2),
// with favourites in place of its apps and the desktop app's panes in place
// of its tools. The list of workspaces as cards; + Add or a card opens the
// editor: name, the grid (Cols × Rows, → Merge, ↓ Merge, Split, the live
// preview, a click on a cell to pick what it shows), the working folder, and
// each web cell's favourite; Save, Cancel, Delete. Then the favourites: a
// list, and a name and an address each. Saves go to the server, which checks
// and writes them (library.mjs); the grid logic is grid.mjs.

const { token: T, openLayout } = window.WORKSPACES
const G = await import(`/ws/grid.mjs?t=${T}`)

const api = async (path, body) => {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-Token": T, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { ok: r.ok, body: await r.json().catch(() => ({})) }
}

const PANES = [["files", "Files"], ["changes", "Changes"], ["terminal", "Terminal"]]
const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
const BACK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>'
const CLEAR_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>'

const root = document.getElementById("ws")
let lib = { workspaces: [], favorites: [] }
let page = "list" // list | edit | favorites | favorite
let query = ""
let draft = null // the workspace being edited
let favDraft = null // the favourite being edited

/** An element: tag with classes ("div.a.b"), attributes, children (text is text). */
function el(spec, attrs = {}, ...children) {
  const [tag, ...classes] = spec.split(".")
  const node = document.createElement(tag)
  if (classes.length) node.className = classes.join(" ")
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v)
    else if (k === "html") node.innerHTML = v
    else if (v !== false && v !== undefined && v !== null) node.setAttribute(k, v === true ? "" : String(v))
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c)
  return node
}

const favName = id => lib.favorites.find(f => f.id === id)?.name
const contentLabel = content => {
  if (!content) return "—"
  if (content.startsWith("fav:")) return favName(content.slice(4)) ?? "Missing favourite"
  return PANES.find(([v]) => v === content)?.[1] ?? content
}

// ── The confirm dialog (the app's confirmAction) ─────────────────────────────

function confirmAction({ title, body, confirmLabel }) {
  return new Promise(resolve => {
    const done = answer => {
      overlay.remove()
      resolve(answer)
    }
    const overlay = el(
      "div.confirm-overlay",
      { onmousedown: e => e.target === overlay && done(false) },
      el(
        "div.confirm-box",
        { role: "dialog", "aria-modal": "true" },
        el("div.confirm-head", {}, el("h3", {}, title)),
        el("div.confirm-body", {}, el("p", {}, body)),
        el(
          "div.confirm-foot",
          {},
          el("button.action-btn", { type: "button", onclick: () => done(false) }, "Cancel"),
          el("button.action-btn.danger", { type: "button", onclick: () => done(true) }, confirmLabel),
        ),
      ),
    )
    document.body.append(overlay)
  })
}

// ── Lists ────────────────────────────────────────────────────────────────────

function head(title, placeholder, onAdd) {
  const input = el("input", { type: "text", placeholder, spellcheck: "false", autocomplete: "off", value: query })
  input.addEventListener("input", () => {
    query = input.value
    render()
    root.querySelector(".skills-search input")?.focus()
  })
  return el(
    "div.skills-head",
    {},
    el("h2", {}, title),
    el("div.skills-search", { html: SEARCH_ICON }, input),
    el("button.action-btn.primary", { type: "button", onclick: onAdd }, "+ Add"),
  )
}

function tabs(count) {
  const tab = (label, to) => el(`button.skills-tab${page === to ? ".active" : ""}`, { type: "button", onclick: () => go(to) }, label)
  return el("div.skills-tabs", {}, tab("Your workspaces", "list"), tab("Favourites", "favorites"), el("div", { style: "flex:1;" }), el("span.skills-count", {}, count))
}

/** The app's mini-grid: the split structure only. */
function mini(file) {
  return el(
    "div.cc-mini",
    {},
    file.cells.map(c =>
      el("div.cc-mini-cell", {
        style: `left:${(c.col / file.cols) * 100}%;top:${(c.row / file.rows) * 100}%;width:${((c.col_span ?? 1) / file.cols) * 100}%;height:${((c.row_span ?? 1) / file.rows) * 100}%`,
      }),
    ),
  )
}

function renderList() {
  const n = lib.workspaces.length
  const q = query.trim().toLowerCase()
  const shown = q ? lib.workspaces.filter(w => w.file.name.toLowerCase().includes(q)) : lib.workspaces
  let body
  if (n === 0) body = el("div.crud-empty", {}, 'No workspaces yet — click "+ Add" to create one.')
  else if (shown.length === 0) body = el("div.crud-empty", {}, `No workspaces matching "${query.trim()}"`)
  else {
    body = el(
      "div.cc-layouts.layouts-page-grid",
      {},
      shown.map(w => el("div.cc-layout-card", { onclick: () => edit(w) }, mini(w.file), el("span.cc-card-name", {}, w.file.name))),
    )
  }
  return [head("Workspaces", "Search workspaces", () => edit(null)), tabs(`${n} workspace${n === 1 ? "" : "s"}`), el("div.app-list-wrap", {}, body)]
}

function renderFavorites() {
  const n = lib.favorites.length
  const q = query.trim().toLowerCase()
  const shown = q ? lib.favorites.filter(f => f.name.toLowerCase().includes(q) || f.url.toLowerCase().includes(q)) : lib.favorites
  const usedBy = id => lib.workspaces.filter(w => w.file.cells.some(c => c.favorite === id)).map(w => w.file.name)
  let body
  if (n === 0) body = el("div.crud-empty", {}, 'No favourites yet — click "+ Add" to keep a page.')
  else if (shown.length === 0) body = el("div.crud-empty", {}, `No favourites matching "${query.trim()}"`)
  else {
    body = el(
      "div.crud-cards",
      {},
      shown.map(f => {
        const users = usedBy(f.id)
        return el(
          "div.ws-fav-row",
          { onclick: () => editFavorite(f) },
          el("span.ws-fav-name", {}, f.name),
          el("span.ws-fav-url", {}, f.url),
          el("span.ws-fav-used", {}, users.length ? `in ${users.join(", ")}` : "in no workspace"),
        )
      }),
    )
  }
  return [head("Favourites", "Search favourites", () => editFavorite(null)), tabs(`${n} favourite${n === 1 ? "" : "s"}`), body]
}

// ── The workspace editor ────────────────────────────────────────────────────

function edit(w) {
  draft = w
    ? { original: w.file.name, name: w.file.name, folder: w.file.folder ?? "", builder: G.fromFile(w.file), sizes: { cols: w.file.cols, rows: w.file.rows, col_widths: w.file.col_widths, row_heights: w.file.row_heights }, error: null }
    : { original: null, name: "", folder: "", builder: G.initCells(2, 1), sizes: null, error: null }
  go("edit")
}

const setBuilder = b => {
  draft.builder = b
  render()
}

function counts(selected, onchange) {
  const select = el("select", { onchange: () => onchange(Number(select.value)) })
  for (let n = 1; n <= G.MAX_GRID; n++) select.append(el("option", { value: n, selected: n === selected }, String(n)))
  return select
}

/** The cell picker: Empty, the app's panes, every favourite. */
function showPicker(index, anchor) {
  document.querySelectorAll(".cell-panel-picker").forEach(p => p.remove())
  const rect = anchor.getBoundingClientRect()
  const option = (id, label, cls = "") => el(`div.cell-panel-option${cls}`, { "data-id": id }, label)
  const search = el("input.cell-panel-search", { placeholder: "Search…", autocomplete: "off", spellcheck: "false" })
  const picker = el(
    "div.cell-panel-picker",
    { style: `left:${rect.left}px` },
    search,
    el(
      "div.cell-panel-options",
      {},
      option("", "Empty", ".empty"),
      el("div.cell-panel-group-label", {}, "Panes"),
      PANES.map(([id, label]) => option(id, label, ".tool")),
      lib.favorites.length ? el("div.cell-panel-group-label", {}, "Favourites") : null,
      lib.favorites.map(f => option(`fav:${f.id}`, f.name)),
    ),
  )
  document.body.append(picker)
  const below = window.innerHeight - rect.bottom - 4
  if (below < picker.offsetHeight && rect.top > picker.offsetHeight) picker.style.bottom = `${window.innerHeight - rect.top + 4}px`
  else picker.style.top = `${rect.bottom + 4}px`
  const close = e => {
    if (e && e.target.closest?.(".cell-panel-picker")) return
    picker.remove()
    document.removeEventListener("click", close)
  }
  search.focus()
  search.addEventListener("input", () => {
    const q = search.value.toLowerCase()
    picker.querySelectorAll(".cell-panel-option:not(.empty)").forEach(o => (o.style.display = o.textContent.toLowerCase().includes(q) ? "" : "none"))
  })
  search.addEventListener("keydown", e => {
    e.stopPropagation()
    if (e.key === "Escape") close()
  })
  picker.querySelectorAll(".cell-panel-option").forEach(o =>
    o.addEventListener("click", e => {
      e.stopPropagation()
      close()
      setBuilder(G.assign(draft.builder, index, o.dataset.id))
    }),
  )
  setTimeout(() => document.addEventListener("click", close), 0)
}

function gridPreview() {
  const b = draft.builder
  const preview = el("div", { id: "grid-preview", style: `grid-template-columns:repeat(${b.cols}, 1fr);grid-template-rows:repeat(${b.rows}, 1fr)` })
  b.cells.forEach((c, i) => {
    const cls = ["grid-cell", c.content && "assigned", i === b.selected && "selected"].filter(Boolean).join(".")
    preview.append(
      el(
        `div.${cls}`,
        {
          "data-index": i,
          style: `grid-column:${c.col + 1} / span ${c.colSpan};grid-row:${c.row + 1} / span ${c.rowSpan}`,
          onclick: e => {
            e.stopPropagation()
            draft.builder = G.select(draft.builder, i)
            render()
            showPicker(i, root.querySelector(`.grid-cell[data-index="${i}"]`))
          },
        },
        contentLabel(c.content),
      ),
    )
  })
  return preview
}

/** The right pane: each web cell's favourite (the app's "App setup"). */
function cellSetup() {
  const rows = draft.builder.cells
    .map((c, i) => [c, i])
    .filter(([c]) => c.content.startsWith("fav:"))
    .map(([c, i]) => {
      const select = el("select.settings-input", { onchange: () => setBuilder(G.assign(draft.builder, i, `fav:${select.value}`)) })
      for (const f of lib.favorites) select.append(el("option", { value: f.id, selected: `fav:${f.id}` === c.content }, f.name))
      return el("div.layout-cell-config-row", {}, el("span.layout-cell-config-label", {}, `Favourite · cell ${c.col + 1},${c.row + 1}`), select)
    })
  return el(
    "div.layout-setup-pane",
    { id: "layout-cell-configs" },
    el("label.settings-label", { style: "margin-top:0;" }, "Cell setup"),
    el("div.settings-hint", { style: "margin:2px 0 10px;" }, "The page each web cell shows. A favourite can be in a workspace once; its page is the same in every workspace."),
    rows,
    rows.length ? null : el("div.settings-hint", {}, "Put a favourite in the grid and its setup appears here."),
  )
}

function renderEditor() {
  const b = draft.builder
  const sel = b.selected
  const name = el("input.settings-input", { type: "text", placeholder: "workspace name", spellcheck: "false", autocomplete: "off", value: draft.name, oninput: e => (draft.name = e.target.value) })
  const folder = el("input.settings-input", { placeholder: "No folder — keeps the current one", spellcheck: "false", value: draft.folder, oninput: e => (draft.folder = e.target.value) })
  const button = (label, enabled, fn) => el("button.action-btn", { type: "button", disabled: !enabled, onclick: fn }, label)
  return el(
    "div.crud-inline-form",
    { id: "layout-editor" },
    el(
      "div.crud-inline-header",
      {},
      el("button.skills-back", { type: "button", html: BACK_ICON, onclick: () => go("list") }, "Workspaces"),
      el("div.crud-spacer"),
      draft.original !== null ? el("button.action-btn.primary", { type: "button", title: "Open this workspace", onclick: () => openLayout(draft.original) }, "Open workspace") : null,
    ),
    el("div.crud-form-error", { class: draft.error ? "crud-form-error" : "crud-form-error hidden" }, draft.error ?? ""),
    el("div.edit-head", { style: "margin-top:12px;" }, el("div.edit-head-name", {}, draft.original ?? "New workspace")),
    el("div.app-detail-tabs", {}, el("button.app-detail-tab.active", { type: "button" }, "General")),
    el(
      "div.app-builder-split",
      {},
      el(
        "div.app-builder-controls",
        {},
        el("label.settings-label", { style: "margin-top:16px;" }, "Name"),
        name,
        el("label.settings-label", { style: "margin-top:8px;" }, "Grid"),
        el(
          "div.grid-builder",
          { id: "layout-grid-builder" },
          el(
            "div.grid-dims",
            {},
            el("label", {}, "Cols ", counts(b.cols, n => setBuilder(G.resize(draft.builder, n, draft.builder.rows)))),
            el("span.dim-sep", { html: "&times;" }),
            el("label", {}, "Rows ", counts(b.rows, n => setBuilder(G.resize(draft.builder, draft.builder.cols, n)))),
            button("→ Merge", G.canMergeRight(b, sel), () => setBuilder(G.mergeRight(draft.builder, sel))),
            button("↓ Merge", G.canMergeDown(b, sel), () => setBuilder(G.mergeDown(draft.builder, sel))),
            button("Split", G.canSplit(b, sel), () => setBuilder(G.split(draft.builder, sel))),
          ),
          gridPreview(),
        ),
        el("label.settings-label", { style: "margin-top:16px;" }, "Working folder (overall)"),
        el("div.settings-hint", { style: "margin:-2px 0 8px;" }, "The folder the session moves to when this workspace opens. Leave empty to keep the current folder."),
        el(
          "div.layout-folder-row",
          {},
          folder,
          el("button.layout-folder-icon.clear", { type: "button", title: "Clear", html: CLEAR_ICON, onclick: () => ((draft.folder = ""), render()) }),
        ),
        el(
          "div.settings-actions",
          { style: "margin-top:28px;" },
          draft.original !== null ? el("button.action-btn.danger", { type: "button", onclick: removeWorkspace }, "Delete") : null,
          el("div", { style: "flex:1;" }),
          el("button.action-btn", { type: "button", onclick: () => go("list") }, "Cancel"),
          el("button.action-btn.primary", { type: "button", onclick: saveWorkspace }, "Save"),
        ),
      ),
      el("div.app-builder-preview", {}, cellSetup()),
    ),
  )
}

async function saveWorkspace() {
  const b = draft.builder
  const same = draft.sizes && draft.sizes.cols === b.cols && draft.sizes.rows === b.rows
  const r = await api("/api/workspace", {
    original: draft.original,
    name: draft.name,
    folder: draft.folder,
    cols: b.cols,
    rows: b.rows,
    ...(same ? { col_widths: draft.sizes.col_widths, row_heights: draft.sizes.row_heights } : {}),
    cells: G.fileCells(b),
  })
  if (!r.ok) {
    draft.error = r.body.error ?? "The workspace could not be saved."
    return render()
  }
  await refresh()
  go("list")
}

async function removeWorkspace() {
  const name = draft.original
  const yes = await confirmAction({
    title: `Delete “${name}”?`,
    body: "The workspace disappears from your library — the favourites it showed are untouched.",
    confirmLabel: "Delete workspace",
  })
  if (!yes) return
  const r = await api("/api/workspace/delete", { name })
  if (!r.ok) {
    draft.error = r.body.error ?? "The workspace could not be deleted."
    return render()
  }
  await refresh()
  go("list")
}

// ── The favourite editor ────────────────────────────────────────────────────

function editFavorite(f) {
  favDraft = f ? { id: f.id, name: f.name, url: f.url, error: null } : { id: null, name: "", url: "", error: null }
  go("favorite")
}

function renderFavorite() {
  const d = favDraft
  return el(
    "div.crud-inline-form",
    {},
    el("div.crud-inline-header", {}, el("button.skills-back", { type: "button", html: BACK_ICON, onclick: () => go("favorites") }, "Favourites"), el("div.crud-spacer")),
    el("div", { class: d.error ? "crud-form-error" : "crud-form-error hidden" }, d.error ?? ""),
    el("div.edit-head", { style: "margin-top:12px;" }, el("div.edit-head-name", {}, d.id ? lib.favorites.find(f => f.id === d.id)?.name ?? d.name : "New favourite")),
    el("label.settings-label", { style: "margin-top:16px;" }, "Name"),
    el("input.settings-input", { type: "text", placeholder: "Gmail", spellcheck: "false", autocomplete: "off", value: d.name, oninput: e => (d.name = e.target.value) }),
    el("label.settings-label", { style: "margin-top:16px;" }, "Address"),
    el("input.settings-input", { type: "text", placeholder: "https://mail.google.com", spellcheck: "false", autocomplete: "off", value: d.url, oninput: e => (d.url = e.target.value) }),
    el(
      "div.settings-actions",
      { style: "margin-top:28px;" },
      d.id ? el("button.action-btn.danger", { type: "button", onclick: removeFavorite }, "Delete") : null,
      el("div", { style: "flex:1;" }),
      el("button.action-btn", { type: "button", onclick: () => go("favorites") }, "Cancel"),
      el("button.action-btn.primary", { type: "button", onclick: saveFavorite }, "Save"),
    ),
  )
}

async function saveFavorite() {
  const r = await api("/api/favorite", { id: favDraft.id, name: favDraft.name, url: favDraft.url })
  if (!r.ok) {
    favDraft.error = r.body.error ?? "The favourite could not be saved."
    return render()
  }
  await refresh()
  go("favorites")
}

async function removeFavorite() {
  const yes = await confirmAction({ title: `Delete “${favDraft.name}”?`, body: "The page is no longer kept as a favourite.", confirmLabel: "Delete favourite" })
  if (!yes) return
  const r = await api("/api/favorite/delete", { id: favDraft.id })
  if (!r.ok) {
    favDraft.error = r.body.error ?? "The favourite could not be deleted."
    return render()
  }
  await refresh()
  go("favorites")
}

// ── Pages ────────────────────────────────────────────────────────────────────

function render() {
  const body = { list: renderList, edit: renderEditor, favorites: renderFavorites, favorite: renderFavorite }[page]()
  root.replaceChildren(el("div.ws-page", {}, body))
}

function go(to) {
  if (to !== page && (to === "list" || to === "favorites")) query = ""
  page = to
  render()
}

async function refresh() {
  const r = await api("/api/library")
  if (r.ok) lib = r.body
}

window.WORKSPACES_EDITOR = {
  /** Shows the editor on one of its lists. */
  async show(view) {
    await refresh()
    root.classList.remove("hidden")
    go(view === "favorites" ? "favorites" : "list")
  },
  hide() {
    root.classList.add("hidden")
  },
  isOpen: () => !root.classList.contains("hidden"),
  /** The library changed on disk: the lists follow (a form being filled stays). */
  async refresh() {
    await refresh()
    if (page === "list" || page === "favorites") render()
  },
}
