/**
 * Offline write queue.
 *
 * The app is a PWA that caches GET responses for offline reads, but writes (add/edit/
 * delete/toggle) made while offline used to just fail and be lost. This queue persists
 * failed-because-offline mutations to localStorage and replays them when connectivity
 * returns, so "installed app" actions survive a dropped connection.
 *
 * Only serializable requests are queued: multipart forms with NO File (small field
 * updates like quantity/checked/done/category) and plain-JSON bodies. Photo uploads are
 * deliberately not queued (a File can't be cheaply/safely persisted to localStorage), so
 * those still surface a normal error while offline.
 */
export type QueuedRequest = {
  id: string;
  method: string;
  url: string; // absolute path incl. baseURL, e.g. "/api/items/3/quantity"
  fields?: Record<string, string>; // for multipart form bodies
  json?: unknown; // for application/json bodies
  createdAt: number;
};

const KEY = "offlineWriteQueue";
export const QUEUE_CHANGED_EVENT = "offline-queue-changed";

function emitChange() {
  window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT));
}

export function readQueue(): QueuedRequest[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedRequest[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedRequest[]) {
  localStorage.setItem(KEY, JSON.stringify(queue));
  emitChange();
}

export function enqueue(req: Omit<QueuedRequest, "id" | "createdAt">) {
  const queue = readQueue();
  queue.push({ ...req, id: crypto.randomUUID(), createdAt: Date.now() });
  writeQueue(queue);
}

export function queueSize(): number {
  return readQueue().length;
}

let flushing = false;

/**
 * Replay queued requests in order. Stops at the first one that fails with a network
 * error (still offline) and leaves it + the rest in the queue for the next attempt.
 * Calls onSync() if at least one request succeeded, so the caller can refresh data.
 */
export async function flushOfflineQueue(onSync?: () => void): Promise<void> {
  if (flushing) return;
  if (!navigator.onLine) return;
  flushing = true;
  let synced = 0;
  try {
    let queue = readQueue();
    while (queue.length > 0) {
      const req = queue[0];
      try {
        const init: RequestInit = { method: req.method };
        if (req.fields) {
          const fd = new FormData();
          for (const [k, v] of Object.entries(req.fields)) fd.append(k, v);
          init.body = fd;
        } else if (req.json !== undefined) {
          init.headers = { "Content-Type": "application/json" };
          init.body = JSON.stringify(req.json);
        }
        const resp = await fetch(req.url, init);
        // A real server response (even an error status) means we're online and this
        // request was delivered - drop it either way rather than retrying forever.
        if (!resp.ok && resp.status >= 500) {
          // transient server error - keep it for a later retry
          break;
        }
      } catch {
        // network error - still offline; stop and keep the rest queued
        break;
      }
      queue = readQueue().slice(1);
      writeQueue(queue);
      synced++;
    }
  } finally {
    flushing = false;
    if (synced > 0 && onSync) onSync();
  }
}
