import type { Game } from '../game';
import { InfoButtons, InfoScreen, useInfoPage } from './info';
import { SoundToggles } from './sound-toggles';

export function PauseScreen({ game }: { game: Game }) {
  const [page, open] = useInfoPage(game);
  if (page) return <InfoScreen page={page} onBack={() => open(null)} />;

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
          <div class="row">
            <SoundToggles game={game} />
          </div>
          <div class="row">
            <InfoButtons onOpen={open} />
          </div>
          <button onClick={() => game.quitToTitle()}>Quit run</button>
        </div>
      </div>
    </div>
  );
}
