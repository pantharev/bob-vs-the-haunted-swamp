import { WEAPONS, type WeaponId } from '@game/content';
import { useEffect, useState } from 'preact/hooks';
import type { Game } from '../game';
import { HiscoreError } from '../hiscores/client';
import {
  isTeamSize,
  PARTY_BOARD_NAMES,
  PARTY_SIZES,
  type BoardId,
  type BoardResponse,
  type HiscoreEntry,
  type PartySize,
  type TeamBoardResponse,
  type TeamEntry,
} from '../hiscores/protocol';
import { formatScore, WEAPON_ICONS } from './format';
import { InfoPage } from './info-page';

const PERIODS: readonly { id: BoardId; label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: 'all', label: 'All time' },
];

type Data = BoardResponse | TeamBoardResponse;
type Loaded = { key: string; data: Data } | { key: string; error: string };

export function HiscoresScreen({ game, onBack }: { game: Game; onBack: () => void }) {
  // From a co-op run's results, open on that party's board.
  const [size, setSize] = useState<PartySize>(() => {
    const players = game.world.players.length;
    return game.isCoop && isTeamSize(players) ? players : 1;
  });
  const [board, setBoard] = useState<BoardId>('week');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${size}:${board}`;

  useEffect(() => {
    let live = true;
    const load: Promise<Data> = isTeamSize(size)
      ? game.hiscores.teamBoard(board, size)
      : game.hiscores.board(board);
    load
      .then((data) => live && setLoaded({ key, data }))
      .catch((error: unknown) => {
        const message =
          error instanceof HiscoreError ? error.message : 'The hiscores failed to load.';
        if (live) setLoaded({ key, error: message });
      });
    return () => {
      live = false;
    };
  }, [key]);

  const pick = <T,>(set: (value: T) => void, value: T, current: T) => {
    if (value === current) return;
    game.audio.ui('click');
    set(value);
  };
  const current = loaded?.key === key ? loaded : null;
  return (
    <InfoPage title="Hiscores" onBack={onBack}>
      <Tabs
        label="Party size"
        options={PARTY_SIZES.map((id) => ({ id, label: PARTY_BOARD_NAMES[id] }))}
        value={size}
        onPick={(id) => pick(setSize, id, size)}
      />
      <Tabs
        label="Period"
        options={PERIODS}
        value={board}
        onPick={(id) => pick(setBoard, id, board)}
      />
      {!current ? (
        <p class="hint">Loading…</p>
      ) : 'error' in current ? (
        <p class="error">{current.error}</p>
      ) : 'size' in current.data ? (
        <TeamBoard data={current.data} />
      ) : (
        <Board data={current.data} />
      )}
      <p class="hint">
        {size === 1
          ? 'Every posted run is replayed on the server to check its score.'
          : 'The co-op server plays every party run, so each one goes on the board by itself. A team (the same players) keeps its best run.'}{' '}
        The weekly board resets on Mondays (UTC).
      </p>
    </InfoPage>
  );
}

function Tabs<T extends string | number>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onPick: (id: T) => void;
}) {
  return (
    <div class="tabs" role="tablist" aria-label={label}>
      {options.map(({ id, label }) => (
        <button
          key={id}
          role="tab"
          class="small"
          aria-selected={id === value}
          onClick={() => onPick(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Board({ data }: { data: BoardResponse }) {
  const { entries, you } = data;
  if (entries.length === 0) {
    return (
      <p class="hint">No runs{data.board === 'week' ? ' this week' : ''} yet. Be the first!</p>
    );
  }
  const youListed = you !== null && entries.some((e) => e.rank === you.rank);
  return (
    <table class="hiscores">
      <Head who="Name" />
      <tbody>
        {entries.map((e) => (
          <Row key={e.rank} entry={e} you={e.rank === you?.rank} />
        ))}
        {you && !youListed && (
          <>
            <tr class="gap">
              <td colSpan={5}>⋯</td>
            </tr>
            <Row entry={you} you />
          </>
        )}
      </tbody>
    </table>
  );
}

function TeamBoard({ data }: { data: TeamBoardResponse }) {
  if (data.entries.length === 0) {
    return (
      <p class="hint">
        No {PARTY_BOARD_NAMES[data.size]} runs{data.board === 'week' ? ' this week' : ''} yet. Play
        with friends to be the first!
      </p>
    );
  }
  return (
    <table class="hiscores">
      <Head who="Team" />
      <tbody>
        {data.entries.map((e) => (
          <TeamRow key={e.rank} entry={e} />
        ))}
      </tbody>
    </table>
  );
}

function Head({ who }: { who: string }) {
  return (
    <thead>
      <tr>
        <th>#</th>
        <th>{who}</th>
        <th class="num">Score</th>
        <th class="num">Wave</th>
        <th class="num wide">Kills</th>
      </tr>
    </thead>
  );
}

function Row({ entry, you }: { entry: HiscoreEntry; you: boolean }) {
  return (
    <tr class={you ? 'you' : undefined}>
      <td>{entry.rank}</td>
      <td class="name">
        <Weapon id={entry.weapon} /> {entry.name}
      </td>
      <Numbers entry={entry} />
    </tr>
  );
}

/** Your own teams are highlighted. */
function TeamRow({ entry }: { entry: TeamEntry }) {
  return (
    <tr class={entry.you ? 'you' : undefined}>
      <td>{entry.rank}</td>
      <td class="name">
        {entry.team.map((m, i) => (
          <span key={i} class="member">
            <Weapon id={m.weapon} /> {m.name}
          </span>
        ))}
      </td>
      <Numbers entry={entry} />
    </tr>
  );
}

function Weapon({ id }: { id: WeaponId }) {
  return <span title={WEAPONS[id]?.name}>{WEAPON_ICONS[id] ?? ''}</span>;
}

function Numbers({
  entry,
}: {
  entry: { score: number; won: boolean; wave: number; kills: number };
}) {
  return (
    <>
      <td class="num">{formatScore(entry.score)}</td>
      <td class="num">{entry.won ? <span class="won">Won</span> : entry.wave}</td>
      <td class="num wide">{formatScore(entry.kills)}</td>
    </>
  );
}
