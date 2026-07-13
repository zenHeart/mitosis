import { vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// ─── Pinia instance (needed for store tests) ─────────────────
const pinia = createPinia()
setActivePinia(pinia)

// ─── Session / Local Storage mocks ─────────────────────────
const store = new Map<string, string>()

const createStorage = () => ({
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
  get length() { return store.size },
  key: (i: number) => [...store.keys()][i] ?? null,
})

Object.defineProperty(globalThis, 'sessionStorage', { value: createStorage(), writable: true })
Object.defineProperty(globalThis, 'localStorage', { value: createStorage(), writable: true })

// ─── Per-test cleanup ──────────────────────────────────────
beforeEach(() => {
  store.clear()
})
