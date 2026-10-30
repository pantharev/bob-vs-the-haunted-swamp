import { MAX_PARTY, WEAPON_IDS, WEAPONS, type WeaponId } from '@game/content';
import { NAME_MAX, NAME_PATTERN, type Member } from '@game/coop';
import { useEffect, useState } from 'preact/hooks';
import { Coop } from '../coop/coop';
import { cssColor, SEAT_COLORS } from '../coop/party';
import type { Game } from '../game';
import { savedName, saveName } from '../hiscores/client';
import { useHotkeys } from './app';
import { WEAPON_ICONS } from './format';

/** Co-op from the title screen: create or join a game, then the room's lobby. */
export function CoopScreen({ game }: { game: Game }) {
  const coop = game.coop!;
  return coop.lobby ? (
    <LobbyScreen game={game} coop={coop} />
  ) : (
    <EntryScreen game={game} coop={coop} />
  );
}

/** Name and weapon, then Create (from the title) or Join (from an invite link). */
function EntryScreen({ game, coop }: { game: Game; coop: Coop }) {
  const entry = game.coopEntry ?? { mode: 'create' as const };
  const [name, setName] = useState(savedName);
  const [weapon, setWeapon] = useState<WeaponId>(game.lastWeapon);
  const [problem, setProblem] = useState<string | null>(null);
  const joining = entry.mode === 'join';

  const submit = (e?: Event) => {
    e?.preventDefault();
    const clean = name.trim().replace(/\s+/g, ' ');
    if ([...clean].length > NAME_MAX || !NAME_PATTERN.test(clean)) {
      setProblem(`Names are 1 to ${NAME_MAX} letters, numbers, spaces, - or _.`);
      game.audio.ui('error');
      return;
    }
    setProblem(null);
    saveName(clean);
    game.lastWeapon = weapon;
    game.audio.ui('click');
    void (joining ? coop.join(entry.code, clean, weapon) : coop.create(clean, weapon));
  };

  // A reload mid-game rejoins straight away with the tab's token.
  useEffect(() => {
    if (joining && Coop.hasToken(entry.code) && savedName()) submit();
  }, []);

  return (
    <div class="screen">
      <form class="panel narrow coop" onSubmit={submit}>
        <h1>{joining ? 'Join a game' : 'Play with friends'}</h1>
        <p class="sub">
          {joining
            ? `You've been invited to game ${entry.code}.`
            : `Up to ${MAX_PARTY} players. The monsters scale with the party.`}
        </p>
        <label class="field">
          <span>Your name</span>
          <input
            type="text"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            maxLength={NAME_MAX}
            placeholder="Your name"
            autoComplete="nickname"
            disabled={coop.busy}
          />
        </label>
        <h2>Starting weapon</h2>
        <WeaponPicks value={weapon} onPick={(w) => (setWeapon(w), game.audio.ui('select'))} />
        {(problem ?? coop.error) && <p class="error">{problem ?? coop.error}</p>}
        <div class="actions">
          <button class="primary big" type="submit" disabled={coop.busy || name.trim() === ''}>
            {coop.busy ? 'Connecting…' : joining ? 'Join game' : 'Create game'}
          </button>
        </div>
        <div class="actions">
          <button class="small" type="button" onClick={() => game.closeCoop()}>
            Back
          </button>
        </div>
      </form>
    </div>
  );
}

function LobbyScreen({ game, coop }: { game: Game; coop: Coop }) {
  const lobby = coop.lobby!;
  const me = coop.me;
  const [copied, setCopied] = useState(false);
  const members = lobby.members;
  const waiting = members.filter((m) => !m.ready);
  const allReady = members.length > 0 && waiting.length === 0 && members.every((m) => m.connected);
  const host = members.find((m) => m.seat === lobby.host);
  const share = typeof navigator.share === 'function';

  const toggleReady = () => {
    game.audio.ui(me?.ready ? 'unlock' : 'lock');
    coop.update({ ready: !me?.ready });
  };
  const start = () => {
    game.audio.ui('start');
    coop.start();
  };
  useHotkeys(
    (code) => {
      if (code !== 'Enter') return;
      if (coop.isHost && allReady) start();
      else toggleReady();
      return true;
    },
    [me?.ready, allReady],
  );

  const copy = () => {
    void navigator.clipboard?.writeText(coop.inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    game.audio.ui('click');
  };

  let status: string;
  if (members.length === 1) status = 'Send the link to friends, or start on your own.';
  else if (!allReady) status = `Waiting for ${names(waiting)} to be ready.`;
  else if (coop.isHost) status = "Everyone's ready. Start when you like.";
  else status = `Everyone's ready. Waiting for ${host?.name ?? 'the host'} to start.`;

  return (
    <div class="screen">
      <div class="panel narrow coop">
        <h1>Co-op lobby</h1>
        <p class="sub">
          Game {lobby.code} · send this link to up to {MAX_PARTY - 1} friends
        </p>
        <div class="invite">
          <input
            type="text"
            readOnly
            value={coop.inviteLink}
            aria-label="Invite link"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button class="small" onClick={copy}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          {share && (
            <button
              class="small"
              onClick={() =>
                void navigator
                  .share({
                    title: 'Bob vs. the Haunted Swamp',
                    text: 'Join my co-op game!',
                    url: coop.inviteLink,
                  })
                  .catch(() => {})
              }
            >
              Share
            </button>
          )}
        </div>

        <ul class="party">
          {Array.from({ length: MAX_PARTY }, (_, seat) => {
            const m = members.find((x) => x.seat === seat);
            return (
              <PartyRow
                key={seat}
                seat={seat}
                member={m}
                host={lobby.host === seat}
                you={seat === coop.seat}
              />
            );
          })}
        </ul>

        <h2>Your weapon</h2>
        <WeaponPicks
          value={me?.weapon ?? game.lastWeapon}
          disabled={me?.ready}
          onPick={(w) => {
            game.lastWeapon = w;
            game.audio.ui('select');
            coop.update({ weapon: w });
          }}
        />

        {coop.reconnecting && <p class="error">Connection lost. Reconnecting…</p>}
        {coop.error && <p class="error">{coop.error}</p>}
        <p class="hint">{status}</p>
        <div class="actions">
          <button class={me?.ready ? 'big' : 'primary big'} onClick={toggleReady}>
            {me?.ready ? 'Not ready' : 'Ready'}
          </button>
          {coop.isHost && (
            <button class="primary big" disabled={!allReady} onClick={start}>
              Start
            </button>
          )}
        </div>
        <div class="actions">
          <button class="small" onClick={() => game.quitToTitle()}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

function PartyRow({
  seat,
  member,
  host,
  you,
}: {
  seat: number;
  member?: Member;
  host: boolean;
  you: boolean;
}) {
  if (!member) {
    return (
      <li class="empty">
        <span class="dot" style={{ background: cssColor(SEAT_COLORS[seat]!) }} />
        <span class="who">Waiting for a friend…</span>
      </li>
    );
  }
  return (
    <li class={you ? 'you' : undefined}>
      <span class="dot" style={{ background: cssColor(SEAT_COLORS[seat]!) }} />
      <span class="who">
        {member.name}
        {you && <small> (you)</small>}
        {host && <small class="host"> host</small>}
      </span>
      <span class="weapon" title={WEAPONS[member.weapon].name}>
        {WEAPON_ICONS[member.weapon]}
      </span>
      <span class={`state ${member.ready ? 'ready' : ''}`}>
        {!member.connected ? 'offline' : member.ready ? 'Ready' : '…'}
      </span>
    </li>
  );
}

function WeaponPicks({
  value,
  onPick,
  disabled,
}: {
  value: WeaponId;
  onPick: (w: WeaponId) => void;
  disabled?: boolean;
}) {
  return (
    <div class="weapon-picks">
      {WEAPON_IDS.map((id) => (
        <button
          key={id}
          type="button"
          class={`small ${id === value ? 'selected' : ''}`}
          aria-pressed={id === value}
          disabled={disabled}
          onClick={() => onPick(id)}
        >
          <span class="icon">{WEAPON_ICONS[id]}</span> {WEAPONS[id].name}
        </button>
      ))}
    </div>
  );
}

/** Co-op shop and level-up screens: where everyone is, and the shop timer. */
export function PartyStrip({ game }: { game: Game }) {
  useTicker();
  const party = game.party;
  if (!game.isCoop || !party) return null;
  const left = game.shopSecondsLeft;
  return (
    <div class="party-strip">
      {game.world.players.map((p, i) => (
        <span key={i} class={`member ${p.intermission === 'ready' ? 'ready' : ''}`}>
          <span class="dot" style={{ background: cssColor(party.colors[i] ?? 0xffffff) }} />
          {i === party.me ? 'You' : (party.names[i] ?? `Player ${i + 1}`)}
          <small>
            {p.intermission === 'ready'
              ? 'ready'
              : p.intermission === 'levelUp'
                ? 'levelling up'
                : 'shopping'}
          </small>
        </span>
      ))}
      {left !== null && <span class="timer">next wave in {left} s at most</span>}
    </div>
  );
}

/** Re-renders twice a second: countdowns tick even when nothing else changes. */
function useTicker(): void {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, []);
}

/** Between waves in co-op, once you're ready: who the party is waiting for. */
export function WaitingScreen({ game }: { game: Game }) {
  useTicker();
  const waitingFor = game.world.players
    .map((p, i) => ({ p, name: game.party?.names[i] ?? `Player ${i + 1}` }))
    .filter(({ p }) => p.alive && p.intermission !== 'ready')
    .map(({ name }) => name);
  const left = game.shopSecondsLeft;
  return (
    <div class="screen enter">
      <div class="panel narrow">
        <h1>Ready!</h1>
        <p class="sub">
          {waitingFor.length ? `Waiting for ${list(waitingFor)}…` : 'The next wave is starting.'}
        </p>
        {left !== null && waitingFor.length > 0 && (
          <p class="hint">The next wave starts in {left} s at the latest.</p>
        )}
      </div>
    </div>
  );
}

function names(members: readonly Member[]): string {
  return list(members.map((m) => m.name));
}

function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
