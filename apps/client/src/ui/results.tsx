import { WEAPONS } from '@game/content';
import type { Player } from '@game/sim';
import { useState } from 'preact/hooks';
import type { Game } from '../game';
import { cssColor } from '../coop/party';
import { HiscoreError, savedName, saveName } from '../hiscores/client';
import { isTeamSize, NAME_MAX, NAME_PATTERN, PARTY_BOARD_NAMES } from '../hiscores/protocol';
import { useHotkeys } from './app';
import { formatScore, formatTime, WEAPON_ICONS } from './format';
import { InfoScreen, useInfoPage } from './info';

export function ResultsScreen({ game, player }: { game: Game; player: Player }) {
  const { world } = game;
  const { stats } = world;
  const won = world.outcome === 'victory';
  const [page, open] = useInfoPage(game);
  const coop = game.isCoop;
  // Co-op goes back to the room's lobby, where the host starts the next run.
  const again = () => (coop ? game.backToLobby() : game.startRun({ weapon: game.lastWeapon }));
  useHotkeys(
    (code) => {
      if (!page && code === 'Enter') {
        again();
        return true;
      }
    },
    [page],
  );

  if (page) return <InfoScreen game={game} page={page} onBack={() => open(null)} />;

  return (
    <div class="screen enter slow">
      <div class="panel narrow">
        <h1 class={won ? 'win' : 'lose'}>
          {coop
            ? won
              ? 'The party survived!'
              : 'The party has fallen'
            : won
              ? 'Bob survived!'
              : 'Bob has fallen'}
        </h1>
        <p class="sub">
          {won
            ? `All ${world.waves.length} waves cleared.`
            : `Fell on wave ${world.wave} of ${world.waves.length}.`}
          {coop && ` · ${formatTime(stats.timeTicks)}`}
        </p>
        <p class="score">
          {formatScore(stats.score)}
          <small>score</small>
        </p>
        <p class="breakdown">
          Kills {formatScore(stats.killPoints)} · Wave bonus {formatScore(stats.waveBonus)}
          {won && ` · Victory ${formatScore(stats.victoryBonus)}`}
        </p>
        {coop ? (
          <>
            <TeamPosted game={game} />
            <PartyResults game={game} />
          </>
        ) : (
          <PostScore game={game} />
        )}
        {/* Co-op shows everyone in the table above instead. */}
        <dl class="summary" hidden={coop}>
          <dt>Kills</dt>
          <dd>{stats.kills}</dd>
          <dt>Coins</dt>
          <dd>{stats.coinsCollected} gp</dd>
          <dt>Level</dt>
          <dd>{player.level}</dd>
          <dt>Damage</dt>
          <dd>{stats.damageDealt}</dd>
          <dt>Time</dt>
          <dd>{formatTime(stats.timeTicks)}</dd>
          <dt>Weapons</dt>
          <dd>
            {player.weapons.map((w, i) => (
              <span key={i} title={WEAPONS[w.id].name}>
                {WEAPON_ICONS[w.id]}
              </span>
            ))}
          </dd>
        </dl>
        <div class="actions">
          <button class="primary big" onClick={again}>
            {coop ? 'Back to lobby' : 'Play again'}
          </button>
          <button onClick={() => game.quitToTitle()}>{coop ? 'Leave' : 'Change weapon'}</button>
          <button onClick={() => open('hiscores')}>Hiscores</button>
        </div>
      </div>
    </div>
  );
}

/** Co-op: everyone's share of the run. */
function PartyResults({ game }: { game: Game }) {
  const party = game.party;
  if (!party) return null;
  return (
    <table class="party-results">
      <thead>
        <tr>
          <th>Player</th>
          <th class="num">Kills</th>
          <th class="num">Damage</th>
          <th class="num">Level</th>
          <th class="num">Downs</th>
        </tr>
      </thead>
      <tbody>
        {game.world.players.map((p, i) => (
          <tr key={i} class={i === party.me ? 'you' : undefined}>
            <td>
              <span class="dot" style={{ background: cssColor(party.colors[i] ?? 0xffffff) }} />{' '}
              {party.names[i]}
              {p.weapons.map((w, k) => (
                <span key={k} class="weapon" title={WEAPONS[w.id].name}>
                  {WEAPON_ICONS[w.id]}
                </span>
              ))}
            </td>
            <td class="num">{formatScore(p.kills)}</td>
            <td class="num">{formatScore(Math.round(p.damage))}</td>
            <td class="num">{p.level}</td>
            <td class="num">{p.downs}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Co-op: where the party's run placed. The co-op server posts it by itself. */
function TeamPosted({ game }: { game: Game }) {
  const size = game.world.players.length;
  if (!isTeamSize(size)) {
    return <p class="hint">Play with at least one friend to go on the co-op hiscores.</p>;
  }
  const board = PARTY_BOARD_NAMES[size];
  const ranked = game.teamPlacing;
  if (!ranked) return <p class="hint">Posting to the {board} hiscores…</p>;
  if (!ranked.ok) return <p class="hint">{ranked.error}</p>;
  return (
    <p class="posted">
      {board} hiscores: #{ranked.week.rank} this week · #{ranked.all.rank} all time
      {!ranked.all.improved && (
        <small>Your team&apos;s best of {formatScore(ranked.all.best)} still stands.</small>
      )}
    </p>
  );
}

type PostState = { status: 'idle' } | { status: 'sending' } | { status: 'error'; message: string };

/** Name field and Post button; after posting, where the run placed. */
function PostScore({ game }: { game: Game }) {
  const [name, setName] = useState(savedName);
  const [state, setState] = useState<PostState>({ status: 'idle' });
  const posted = game.posted;

  if (!game.rankable) {
    return (
      <p class="hint">
        This run can't go on the hiscores: they couldn't be reached when it started.
      </p>
    );
  }
  if (posted) {
    const { week, all } = posted.boards;
    return (
      <p class="posted">
        Posted! #{week.rank} this week · #{all.rank} all time
        {!all.improved && <small>Your best of {formatScore(all.best)} still stands.</small>}
      </p>
    );
  }

  const submit = async (e: Event) => {
    e.preventDefault();
    const clean = name.trim().replace(/\s+/g, ' ');
    if ([...clean].length > NAME_MAX || !NAME_PATTERN.test(clean)) {
      setState({
        status: 'error',
        message: `Names are 1 to ${NAME_MAX} letters, numbers, spaces, - or _.`,
      });
      game.audio.ui('error');
      return;
    }
    setState({ status: 'sending' });
    saveName(clean);
    try {
      await game.postScore(clean);
      game.audio.ui('buy');
    } catch (error) {
      const message = error instanceof HiscoreError ? error.message : 'Posting failed. Try again.';
      setState({ status: 'error', message });
      game.audio.ui('error');
    }
  };

  const sending = state.status === 'sending';
  return (
    <form class="post" onSubmit={submit}>
      <div class="row">
        <input
          type="text"
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
          maxLength={NAME_MAX}
          placeholder="Your name"
          aria-label="Name for the hiscores"
          autoComplete="nickname"
          enterKeyHint="send"
          disabled={sending}
        />
        <button class="primary" type="submit" disabled={sending || name.trim() === ''}>
          {sending ? 'Posting…' : 'Post score'}
        </button>
      </div>
      {state.status === 'error' && <p class="error">{state.message}</p>}
    </form>
  );
}
