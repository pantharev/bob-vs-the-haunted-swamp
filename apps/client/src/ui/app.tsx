import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Game } from '../game';
import { LevelUpScreen } from './level-up';
import { PauseScreen } from './pause';
import { ResultsScreen } from './results';
import { ShopScreen } from './shop';
import { TitleScreen } from './title';

/** DOM menus over the canvas (PLAN.md §5). They re-render when the game notifies. */
export function mountUi(game: Game): void {
  const root = document.createElement('div');
  root.id = 'ui';
  document.body.appendChild(root);
  render(<App game={game} />, root);
}

function App({ game }: { game: Game }) {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    const unsubscribe = game.subscribe(refresh);
    // Effects run after paint: catch up on anything that changed before we subscribed.
    refresh();
    return unsubscribe;
  }, [game]);

  if (game.screen === 'title') return <TitleScreen game={game} />;

  const { world } = game;
  const player = world.players[0];
  if (!player) return null;

  switch (world.phase) {
    case 'wave':
      return game.paused ? (
        <PauseScreen game={game} />
      ) : (
        <button class="pause-button" aria-label="Pause" onClick={() => game.setPaused(true)}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
          </svg>
        </button>
      );
    case 'intermission':
      return player.intermission === 'levelUp' ? (
        <LevelUpScreen game={game} player={player} />
      ) : (
        <ShopScreen game={game} player={player} />
      );
    case 'over':
      return <ResultsScreen game={game} player={player} />;
  }
}

/** Runs `handler` for key presses that aren't aimed at a focused control. */
export function useHotkeys(handler: (code: string) => boolean | void, deps: unknown[]): void {
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const focused = document.activeElement;
      if ((e.code === 'Enter' || e.code === 'Space') && focused && focused !== document.body) return;
      if (handler(e.code)) e.preventDefault();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, deps);
}
