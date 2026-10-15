export type Mode = 'oneshot' | 'counted' | 'persistent'
export type Fields = { mode: Mode; count: number; effects: string[] }
export type Drip = { name: string; recipe: string }

export const COUNT_MIN: number
export const COUNT_MAX: number
export const COUNT_DEFAULT: number
export const EFFECT_EMOJI: Record<string, string>
export function buildRecipe(fields: Fields): string
export function parseRecipe(recipe: string): Fields
export function dripEmojis(recipe: string): string[]
export function filterDrips(drips: Drip[], query: string): Drip[]
export function countText(n: number): string
export function checkDrip(fields: { name: string; effects: string[] }): { error: string; field: 'name' | null } | { name: string }
export type PlanStatus = { gate: string | null; limits: Record<string, number | null>; refusals: Record<string, string | null> }
export function saveRefusal(status: PlanStatus | null, drips: Drip[], name: string, editing: string | null): string | null
