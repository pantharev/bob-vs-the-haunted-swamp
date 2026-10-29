import { WEAPONS } from '@game/content';
import type { Player } from '@game/sim';
import { useState } from 'preact/hooks';
import type { Game } from '../game';
import { HiscoreError, savedName, saveName } from '../hiscores/client';
import { NAME_MAX, NAME_PATTERN } from '../hiscores/protocol';
import { useHotkeys } from './app';
import { formatScore, formatTime, WEAPON_ICONS } from './format';
import { InfoScreen, useInfoPage } from './info';

export function ResultsScreen({ game, player }: { game: Game; player: Player }) {
  const { world } = game;
  const { stats } = world;
  const won = world.outcome === 'victory';
  const [page, open] = useInfoPage(game);
  const again = () => game.startRun({ weapon: game.lastWeapon });
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
        <h1 class={won ? 'win' : 'lose'}>{won ? 'Bob survived!' : 'Bob has fallen'}</h1>
        <p class="sub">
          {won
            ? `All ${world.waves.length} waves cleared.`
            : `Fell on wave ${world.wave} of ${world.waves.length}.`}
        </p>
        <p class="score">
          {formatScore(stats.score)}
          <small>score</small>
        </p>
        <p class="breakdown">
          Kills {formatScore(stats.killPoints)} · Wave bonus {formatScore(stats.waveBonus)}
          {won && ` · Victory ${formatScore(stats.victoryBonus)}`}
        </p>
        <PostScore game={game} />
        <dl class="summary">
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
            Play again
          </button>
          <button onClick={() => game.quitToTitle()}>Change weapon</button>
          <button onClick={() => open('hiscores')}>Hiscores</button>
        </div>
      </div>
    </div>
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
