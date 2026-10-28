import { WEAPON_IDS, WEAPONS, ZONES, type WeaponId } from '@game/content';
import { useState } from 'preact/hooks';
import type { Game } from '../game';
import { CREATOR, VERSION } from './about';
import { useHotkeys } from './app';
import { WEAPON_ICONS, weaponStats } from './format';
import { ChangelogScreen, HelpScreen } from './info';
import { SoundToggles } from './sound-toggles';

const touch = window.matchMedia('(pointer: coarse)').matches;

export function TitleScreen({ game }: { game: Game }) {
  const [weapon, setWeapon] = useState<WeaponId>(game.lastWeapon);
  const [page, setPage] = useState<'main' | 'help' | 'changelog'>('main');
  const start = () => game.startRun({ weapon });
  const open = (next: typeof page) => {
    game.audio.ui('click');
    setPage(next);
  };
  useHotkeys(
    (code) => {
      if (page === 'main' && (code === 'Enter' || code === 'Space')) {
        start();
        return true;
      }
    },
    [weapon, page],
  );

  if (page === 'help') return <HelpScreen onBack={() => open('main')} />;
  if (page === 'changelog') return <ChangelogScreen onBack={() => open('main')} />;

  return (
    <div class="screen">
      <div class="panel">
        <h1 class="title">
          Bob <small>vs. the</small> Haunted Swamp
        </h1>
        <p class="sub">
          Survive {ZONES.wolfmoor.waves.length} waves in the {ZONES.wolfmoor.name}.
        </p>

        <h2>Starting weapon</h2>
        <div class="cards">
          {WEAPON_IDS.map((id) => (
            <button
              key={id}
              class={`card pick ${id === weapon ? 'selected' : ''}`}
              aria-pressed={id === weapon}
              onClick={() => {
                setWeapon(id);
                game.audio.ui('select');
              }}
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
        <div class="actions">
          <button class="small" onClick={() => open('help')}>
            How to play
          </button>
          <button class="small" onClick={() => open('changelog')}>
            Changelog
          </button>
          <SoundToggles game={game} small />
        </div>
        <p class="hint">
          {touch
            ? 'Drag anywhere to move. Weapons fire on their own.'
            : 'Move with WASD, arrows or a gamepad. Weapons fire on their own. Esc pauses, M mutes.'}
        </p>
        <p class="credit">
          v{VERSION} · made by{' '}
          <a href={CREATOR.url} target="_blank" rel="noopener noreferrer">
            {CREATOR.handle}
          </a>
        </p>
      </div>
    </div>
  );
}
