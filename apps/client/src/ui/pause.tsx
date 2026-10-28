import type { Game } from '../game';
import { SoundToggles } from './sound-toggles';

export function PauseScreen({ game }: { game: Game }) {
  return (
    <div class="screen">
      <div class="panel narrow">
        <h1>Paused</h1>
        <p class="sub">
          Wave {game.world.wave} of {game.world.waves.length}
        </p>
        <div class="actions column">
          <button class="primary big" onClick={() => game.setPaused(false)}>
            Resume
          </button>
          <SoundToggles game={game} />
          <button onClick={() => game.quitToTitle()}>Quit run</button>
        </div>
      </div>
    </div>
  );
}
