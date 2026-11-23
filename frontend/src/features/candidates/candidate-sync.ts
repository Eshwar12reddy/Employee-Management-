const CHANNEL_NAME = 'clyptus-candidates-sync'
const EVENT_STORAGE_KEY = 'clyptus-candidates-sync-event'
const TAB_ID = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)

type CandidateChangeEvent = { id: string; source: string; reason: 'saved' | 'deleted' | 'imported' | 'local-cache'; at: number }

function parseEvent(value: unknown): CandidateChangeEvent | null {
  if (!value || typeof value !== 'object') return null
  const event = value as Partial<CandidateChangeEvent>
  if (typeof event.id !== 'string' || typeof event.source !== 'string' || typeof event.at !== 'number') return null
  return event as CandidateChangeEvent
}

export function announceCandidatesChanged(reason: CandidateChangeEvent['reason']): void {
  const event: CandidateChangeEvent = { id: `${TAB_ID}-${Date.now()}-${Math.random()}`, source: TAB_ID, reason, at: Date.now() }
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channel.postMessage(event)
    channel.close()
  } catch {
    // Older browsers use the storage-event fallback below.
  }
  try { localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(event)) } catch { /* offline/private browsing */ }
}

export function subscribeToCandidateChanges(onChange: (reason: CandidateChangeEvent['reason']) => void): () => void {
  let lastEventId = ''
  const handle = (value: unknown) => {
    const event = parseEvent(value)
    if (!event || event.source === TAB_ID || event.id === lastEventId) return
    lastEventId = event.id
    onChange(event.reason)
  }
  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.addEventListener('message', event => handle(event.data))
  } catch {
    channel = null
  }
  const onStorage = (event: StorageEvent) => { if (event.key === EVENT_STORAGE_KEY && event.newValue) { try { handle(JSON.parse(event.newValue)) } catch { /* ignore malformed event */ } } }
  window.addEventListener('storage', onStorage)
  return () => { channel?.close(); window.removeEventListener('storage', onStorage) }
}
