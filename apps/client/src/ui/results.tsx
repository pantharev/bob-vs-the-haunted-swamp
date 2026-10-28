import { WEAPONS } from '@game/content';
import type { Player } from '@game/sim';
import type { Game } from '../game';
import { useHotkeys } from './app';
import { formatTime, WEAPON_ICONS } from './format';

export function ResultsScreen({ game, player }: { game: Game; player: Player }) {
  const { world } = game;
  const won = world.outcome === 'victory';
  const again = () => game.startRun({ weapon: game.lastWeapon });
  useHotkeys((code) => {
    if (code === 'Enter') {
      again();
      return true;
    }
  }, []);

  return (
    <div class="screen enter slow">
      <div class="panel narrow">
        <h1 class={won ? 'win' : 'lose'}>{won ? 'Bob survived!' : 'Bob has fallen'}</h1>
        <p class="sub">
          {won
            ? `All ${world.waves.length} waves cleared.`
            : `Fell on wave ${world.wave} of ${world.waves.length}.`}
        </p>
        <dl class="summary">
          <dt>Kills</dt>
          <dd>{world.stats.kills}</dd>
          <dt>Coins</dt>
          <dd>{world.stats.coinsCollected} gp</dd>
          <dt>Level</dt>
          <dd>{player.level}</dd>
          <dt>Damage</dt>
          <dd>{world.stats.damageDealt}</dd>
          <dt>Time</dt>
          <dd>{formatTime(world.stats.timeTicks)}</dd>
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
        </div>
      </div>
    </div>
  );
}
