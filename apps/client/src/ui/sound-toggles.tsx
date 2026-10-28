import type { Game } from '../game';

/** Sound (everything) and music switches, shared by the title and pause screens. */
export function SoundToggles({ game, small }: { game: Game; small?: boolean }) {
  const { muted, musicOn } = game.audio;
  return (
    <>
      <button class={small ? 'small' : ''} aria-pressed={!muted} onClick={() => game.toggleMute()}>
        {muted ? 'Sound: off' : 'Sound: on'}
      </button>
      <button
        class={small ? 'small' : ''}
        aria-pressed={musicOn}
        disabled={muted}
        onClick={() => game.toggleMusic()}
      >
        {musicOn && !muted ? 'Music: on' : 'Music: off'}
      </button>
    </>
  );
}
