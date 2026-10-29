import type {
  ApiError,
  BoardId,
  BoardResponse,
  RunSubmission,
  SubmitResponse,
  TicketResponse,
} from './protocol';

const PLAYER_KEY = 'bob.player';
const NAME_KEY = 'bob.name';
/** The server keeps tickets for 24 hours; stop using one well before that. */
const TICKET_MAX_AGE_MS = 20 * 60 * 60 * 1000;

/** A failure with a message meant for players. */
export class HiscoreError extends Error {
  override readonly name = 'HiscoreError';
}

/**
 * Talks to the hiscores API (server/api.ts). A ranked run needs a ticket, a
 * seed chosen by the server, so one is fetched ahead of time: a run starts
 * instantly, and is simply unranked if the ticket hasn't arrived (or the
 * player is offline).
 */
export class Hiscores {
  private ticket: (TicketResponse & { readonly fetched: number }) | null = null;
  private fetching = false;

  /** Fetches a ticket for the next run, unless a fresh one is waiting. */
  prefetch(): void {
    if (this.fetching || this.fresh()) return;
    this.fetching = true;
    request<TicketResponse>('/api/ticket', { method: 'POST', body: { player: playerId() } })
      .then((t) => (this.ticket = { ...t, fetched: Date.now() }))
      .catch(() => {})
      .finally(() => (this.fetching = false));
  }

  /** Hands over the waiting ticket for a run starting now (null: play unranked), and fetches the next. */
  take(): TicketResponse | null {
    const ticket = this.fresh() ? this.ticket : null;
    this.ticket = null;
    this.prefetch();
    return ticket;
  }

  submit(run: Omit<RunSubmission, 'player'>): Promise<SubmitResponse> {
    return request<SubmitResponse>('/api/runs', {
      method: 'POST',
      body: { ...run, player: playerId() },
    });
  }

  board(board: BoardId): Promise<BoardResponse> {
    return request<BoardResponse>(`/api/hiscores?board=${board}&player=${playerId()}`);
  }

  private fresh(): boolean {
    return this.ticket !== null && Date.now() - this.ticket.fetched < TICKET_MAX_AGE_MS;
  }
}

async function request<T>(
  url: string,
  { method = 'GET', body }: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new HiscoreError("Couldn't reach the hiscores. Check your connection.");
  }
  const data = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok || data === null) {
    const message = data && typeof data === 'object' && 'error' in data ? data.error : null;
    throw new HiscoreError(message ?? `The hiscores aren't available right now (${res.status}).`);
  }
  return data as T;
}

/** An anonymous id for this browser: it keeps one best score per board. Not shown to anyone. */
export function playerId(): string {
  const stored = read(PLAYER_KEY);
  if (stored && /^[0-9a-f]{32}$/.test(stored)) return stored;
  // getRandomValues (unlike randomUUID) also works on plain-http LAN dev servers.
  const id = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  write(PLAYER_KEY, id);
  return id;
}

export function savedName(): string {
  return read(NAME_KEY) ?? '';
}

export function saveName(name: string): void {
  write(NAME_KEY, name);
}

// Storage can be missing or throw (private windows, blocked cookies); hiscores still work for the session.
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string): void {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Kept in memory only.
  }
}
