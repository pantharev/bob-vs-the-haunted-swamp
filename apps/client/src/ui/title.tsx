import { WEAPON_IDS, WEAPONS, ZONES, type WeaponId } from '@game/content';
import { useState } from 'preact/hooks';
import type { Game } from '../game';
import { useHotkeys } from './app';
import { WEAPON_ICONS, weaponStats } from './format';

const touch = window.matchMedia('(pointer: coarse)').matches;

export function TitleScreen({ game }: { game: Game }) {
  const [weapon, setWeapon] = useState<WeaponId>(game.lastWeapon);
  const start = () => game.startRun({ weapon });
  useHotkeys((code) => {
    if (code === 'Enter' || code === 'Space') {
      start();
      return true;
    }
  }, [weapon]);

  return (
    <div class="screen">
      <div class="panel">
        <h1 class="title">
          Bob <small>vs. the</small> Haunted Swamp
        </h1>
        <p class="sub">Survive {ZONES.wolfmoor.waves.length} waves in the {ZONES.wolfmoor.name}.</p>

        <h2>Starting weapon</h2>
        <div class="cards">
          {WEAPON_IDS.map((id) => (
            <button
              key={id}
              class={`card pick ${id === weapon ? 'selected' : ''}`}
              aria-pressed={id === weapon}
              onClick={() => setWeapon(id)}
            >
              <span class="icon">{WEAPON_ICONS[id]}</span>
              <span class="name">{WEAPONS[id].name}</span>
              <span class="blurb">{WEAPONS[id].blurb}</span>
              <ul class="lines">
                {weaponStats(id).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        <div class="actions">
          <button class="primary big" onClick={start}>
            Start
          </button>
        </div>
        <p class="hint">
          {touch
            ? 'Drag anywhere to move. Weapons fire on their own.'
            : 'Move with WASD, arrows or a gamepad. Weapons fire on their own. Esc pauses, M mutes.'}
        </p>
      </div>
    </div>
  );
}
