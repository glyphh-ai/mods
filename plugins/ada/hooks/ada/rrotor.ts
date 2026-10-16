// rrotor's local API on 127.0.0.1, with the local token only this mod holds
// (rrotor's docs/architecture.md, section 7). Pure: the fetch comes in.
export type Response = { status: number; ok: boolean; text: string }
export type Fetch = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<Response>

export class RrotorError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status = 0) {
    super(message)
    this.code = code
    this.status = status
  }
}

export type Health = {
  version: string
  mode: string
  runtime_id: string | null
  link: { state: string; since: number; last_close: { code: number | null; reason: string | null } | null; owed: number }
  sandbox: { ready: boolean; layers: Record<string, { ok: boolean; detail: string }> }
  approvals: number
  models: number
  parts: { name: string; version: string; mod: string; arch: string }[]
  licence: { plan: string | null; mods: string[]; expires_at: string | null; expired: boolean } | null
}

export type RunAnswer = {
  run_id: string
  model: string
  version: number
  function: string
  status: string
  data: unknown
  step: string | null
  prompt: string | null
  seconds: number
}

export type ModelInfo = { name: string; description: string; active: number | null; functions: Record<string, unknown>; versions: unknown[] }

export function client(fetch: Fetch, port: number, token: string) {
  const base = `http://127.0.0.1:${port}`
  async function ask<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch (err) {
      throw new RrotorError('E_RROTOR_DOWN', `rrotor is not answering: ${String(err instanceof Error ? err.message : err)}`)
    }
    let data: unknown = null
    try {
      data = JSON.parse(res.text)
    } catch {
      data = null
    }
    if (!res.ok) {
      const e = (data as { error?: { code?: string; message?: string } } | null)?.error
      throw new RrotorError(e?.code ?? 'E_RROTOR', e?.message ?? `rrotor answered ${res.status}`, res.status)
    }
    return data as T
  }
  return {
    up: async () => {
      try {
        return (await fetch(`${base}/healthz`, {})).ok
      } catch {
        return false
      }
    },
    health: () => ask<Health>('/v1/health'),
    putToken: (runtime_id: string, token_: string) => ask<unknown>('/v1/runtime/token', 'PUT', { runtime_id, token: token_ }),
    models: async () => (await ask<{ models: ModelInfo[] }>('/v1/models')).models,
    deploy: (body: { bundle: string; commit: string } | { repo: string; commit: string; token?: string | null }) =>
      ask<{ model: string; version: number; commit_sha: string }>('/v1/models/deploy', 'POST', body),
    call: (body: { model: string; function: string; inputs: Record<string, unknown>; version?: number }) => ask<RunAnswer>('/v1/runs', 'POST', body),
    resume: (runId: string, answer: unknown) => ask<RunAnswer>(`/v1/runs/${encodeURIComponent(runId)}/continue`, 'POST', { answer }),
    cancel: (runId: string) => ask<RunAnswer>(`/v1/runs/${encodeURIComponent(runId)}/cancel`, 'POST', {}),
    status: (runId: string) => ask<Record<string, unknown>>(`/v1/runs/${encodeURIComponent(runId)}`),
    log: (runId: string) => ask<{ lines: unknown[] }>(`/v1/runs/${encodeURIComponent(runId)}/log`),
    approvals: async () => (await ask<{ approvals: unknown[] }>('/v1/approvals')).approvals,
    putLicence: (licence: unknown) => ask<unknown>('/v1/licence', 'PUT', licence),
    parts: async () => (await ask<{ parts: Health['parts'] }>('/v1/parts')).parts,
    installPart: (body: { name: string; version: string; sha256: string; signature: string; archive?: string; url?: string }) =>
      ask<Health['parts'][number]>('/v1/parts', 'POST', body),
  }
}

export type Client = ReturnType<typeof client>
