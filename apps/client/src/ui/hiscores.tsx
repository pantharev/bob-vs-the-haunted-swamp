import { WEAPONS } from '@game/content';
import { useEffect, useState } from 'preact/hooks';
import type { Game } from '../game';
import { HiscoreError } from '../hiscores/client';
import type { BoardId, BoardResponse, HiscoreEntry } from '../hiscores/protocol';
import { formatScore, WEAPON_ICONS } from './format';
import { InfoPage } from './info-page';

const BOARDS: readonly { id: BoardId; label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: 'all', label: 'All time' },
];

type Loaded = { board: BoardId; data: BoardResponse } | { board: BoardId; error: string };

export function HiscoresScreen({ game, onBack }: { game: Game; onBack: () => void }) {
  const [board, setBoard] = useState<BoardId>('week');
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let live = true;
    game.hiscores
      .board(board)
      .then((data) => live && setLoaded({ board, data }))
      .catch((error: unknown) => {
        const message =
          error instanceof HiscoreError ? error.message : 'The hiscores failed to load.';
        if (live) setLoaded({ board, error: message });
      });
    return () => {
      live = false;
    };
  }, [board]);

  const current = loaded?.board === board ? loaded : null;
  return (
    <InfoPage title="Hiscores" onBack={onBack}>
      <div class="tabs" role="tablist">
        {BOARDS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            class="small"
            aria-selected={id === board}
            onClick={() => {
              if (id === board) return;
              game.audio.ui('click');
              setBoard(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {!current ? (
        <p class="hint">Loading…</p>
      ) : 'error' in current ? (
        <p class="error">{current.error}</p>
      ) : (
        <Board data={current.data} />
      )}
      <p class="hint">
        Every posted run is replayed on the server to check its score. The weekly board resets on
        Mondays (UTC).
      </p>
    </InfoPage>
  );
}

function Board({ data }: { data: BoardResponse }) {
  const { entries, you } = data;
  if (entries.length === 0) {
    return (
      <p class="hint">No runs {data.board === 'week' ? 'this week' : ''} yet. Be the first!</p>
    );
  }
  const youListed = you !== null && entries.some((e) => e.rank === you.rank);
  return (
    <table class="hiscores">
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th class="num">Score</th>
          <th class="num">Wave</th>
          <th class="num wide">Kills</th>
        </tr>
      </thead>
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

function Row({ entry, you }: { entry: HiscoreEntry; you: boolean }) {
  return (
    <tr class={you ? 'you' : undefined}>
      <td>{entry.rank}</td>
      <td class="name">
        <span title={WEAPONS[entry.weapon]?.name}>{WEAPON_ICONS[entry.weapon] ?? ''}</span>{' '}
        {entry.name}
      </td>
      <td class="num">{formatScore(entry.score)}</td>
      <td class="num">{entry.won ? <span class="won">Won</span> : entry.wave}</td>
      <td class="num wide">{formatScore(entry.kills)}</td>
    </tr>
  );
}
