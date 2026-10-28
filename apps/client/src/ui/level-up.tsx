import { RARITY_NAMES, SKILLS } from '@game/content';
import type { Player } from '@game/sim';
import type { Game } from '../game';
import { useHotkeys } from './app';
import { SKILL_ICONS, skillEffects } from './format';

export function LevelUpScreen({ game, player }: { game: Game; player: Player }) {
  const choose = (index: number) => game.act({ type: 'chooseUpgrade', index });
  useHotkeys((code) => {
    const n = Number(code.replace(/^(Digit|Numpad)/, ''));
    if (n >= 1 && n <= player.upgrades.length) {
      choose(n - 1);
      return true;
    }
  }, [player.upgrades]);

  return (
    <div class="screen enter">
      <div class="panel">
        <h1>Level up!</h1>
        <p class="sub">
          Level {player.level} · {player.pendingLevels} pick{player.pendingLevels === 1 ? '' : 's'} left
        </p>
        <div class="cards">
          {player.upgrades.map((u, i) => (
            <button key={`${u.skill}-${i}`} class={`card rarity-${u.rarity}`} onClick={() => choose(i)}>
              <span class="key">{i + 1}</span>
              <span class="icon">{SKILL_ICONS[u.skill]}</span>
              <span class="name">
                {SKILLS[u.skill].name} +{u.points}
              </span>
              <span class="rarity">{RARITY_NAMES[u.rarity]}</span>
              <ul class="lines">
                {skillEffects(u.skill, u.points).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <span class="now">
                Level {player.skillTotals[u.skill]} → {player.skillTotals[u.skill] + u.points}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
