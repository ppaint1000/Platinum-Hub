const KEY = "platinum-last-costing";

// The costing you were last in, so the Rates / Paint / Production / Access
// tabs can offer a way straight back to it. Per browser tab (sessionStorage);
// storage can be blocked, so every call swallows errors.
export function rememberCosting(id: string) {
  try {
    sessionStorage.setItem(KEY, id);
  } catch {}
}

export function lastCostingId(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function forgetCosting(id: string) {
  try {
    if (sessionStorage.getItem(KEY) === id) sessionStorage.removeItem(KEY);
  } catch {}
}
