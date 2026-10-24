// Remembers, per message, which suggestions were added and whether the banner was dismissed, so
// reopening a thread doesn't offer the same event again. Kept in localStorage and capped, since
// losing it only means a banner reappears.

const STORAGE_KEY = 'calendar-suggestions.state';
const MAX_ENTRIES = 500;

interface MessageState {
  dismissed?: boolean;
  added?: string[];
}

type StateMap = { [messageId: string]: MessageState };

function read(): StateMap {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function write(map: StateMap) {
  const ids = Object.keys(map);
  // Object keys keep insertion order, and update() re-inserts, so the oldest entries come first.
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_ENTRIES))) {
    delete map[id];
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // storage full or unavailable
  }
}

function update(messageId: string, change: (state: MessageState) => MessageState) {
  const map = read();
  const next = change(map[messageId] || {});
  delete map[messageId];
  map[messageId] = next;
  write(map);
}

export function getMessageState(messageId: string): MessageState {
  return read()[messageId] || {};
}

export function markDismissed(messageId: string) {
  update(messageId, (s) => ({ ...s, dismissed: true }));
}

export function markAdded(messageId: string, suggestionKey: string) {
  update(messageId, (s) => ({ ...s, added: [...new Set([...(s.added || []), suggestionKey])] }));
}
