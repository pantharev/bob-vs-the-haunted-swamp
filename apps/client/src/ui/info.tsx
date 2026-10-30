import { ELITE, ENEMIES, MAX_PARTY, MAX_WEAPONS, REVIVE, SCORE, ZONES } from '@game/content';
import { useState } from 'preact/hooks';
import type { Game } from '../game';
import { CHANGELOG, CREATOR } from './about';
import { formatScore } from './format';
import { HiscoresScreen } from './hiscores';
import { InfoPage } from './info-page';

const touch = window.matchMedia('(pointer: coarse)').matches;

export type InfoPageId = 'help' | 'changelog' | 'hiscores';

/** Which info page is open over the title, pause or results screen, if any. */
export function useInfoPage(game: Game) {
  const [page, setPage] = useState<InfoPageId | null>(null);
  const open = (next: InfoPageId | null) => {
    game.audio.ui('click');
    setPage(next);
  };
  return [page, open] as const;
}

export function InfoButtons({
  onOpen,
  small,
}: {
  onOpen: (page: InfoPageId) => void;
  small?: boolean;
}) {
  return (
    <>
      <button class={small ? 'small' : ''} onClick={() => onOpen('help')}>
        How to play
      </button>
      <button class={small ? 'small' : ''} onClick={() => onOpen('changelog')}>
        Changelog
      </button>
    </>
  );
}

export function InfoScreen({
  game,
  page,
  onBack,
}: {
  game: Game;
  page: InfoPageId;
  onBack: () => void;
}) {
  switch (page) {
    case 'help':
      return <HelpScreen onBack={onBack} />;
    case 'changelog':
      return <ChangelogScreen onBack={onBack} />;
    case 'hiscores':
      return <HiscoresScreen game={game} onBack={onBack} />;
  }
}

export function HelpScreen({ onBack }: { onBack: () => void }) {
  const waves = ZONES.wolfmoor.waves.length;
  return (
    <InfoPage title="How to play" onBack={onBack}>
      <p class="sub">
        Survive {waves} waves of the haunted {ZONES.wolfmoor.name}. Each wave runs on a timer:
        outlast it.
      </p>

      <h2>Controls</h2>
      <dl class="keys">
        <dt>Move</dt>
        <dd>{touch ? 'Drag anywhere on the screen' : 'WASD, arrow keys, or a gamepad stick'}</dd>
        <dt>Attack</dt>
        <dd>Automatic. Every weapon fires at the nearest enemy in range.</dd>
        {!touch && (
          <>
            <dt>Pause</dt>
            <dd>Esc or P</dd>
            <dt>Mute</dt>
            <dd>M</dd>
            <dt>Menus</dt>
            <dd>1–4 picks a level-up card · R rerolls the shop · Enter starts the next wave</dd>
          </>
        )}
      </dl>

      <h2>Coins and levels</h2>
      <ul class="lines">
        <li>
          Enemies drop coins. Each one is gold for the shop and experience for Bob. Walk close and
          they fly to you.
        </li>
        <li>
          Coins left on the ground when a wave ends go into your bank. Next wave, pickups count
          double until the bank runs dry.
        </li>
        <li>
          Every level up earns a skill card, picked between waves. Rarer cards give more points.
        </li>
        <li>Enemies sometimes drop food. Eat it to heal.</li>
      </ul>

      <h2>The shop</h2>
      <ul class="lines">
        <li>Between waves, spend gold on weapons (up to {MAX_WEAPONS}) and items.</li>
        <li>
          Lock an offer to keep it for the next shop, reroll for new offers, or sell a weapon you've
          outgrown.
        </li>
      </ul>

      <h2>Know your foes</h2>
      <ul class="lines">
        <li>A red cross on the ground means something is about to crawl out there.</li>
        <li>
          Zombies shamble straight at you. Crawling hands are quick and come at you from the side.
        </li>
        <li>Bog slimes split in two when they die and leave goo that slows you down.</li>
        <li>
          Wounded werewolves turn into wolves. When one flashes red and snarls, step aside: it is
          about to lunge.
        </li>
        <li>Elites are huge, tough, and drop a pile of coins.</li>
      </ul>

      <h2>Co-op</h2>
      <ul class="lines">
        <li>
          Press Play with friends on the title screen and send the invite link. Up to {MAX_PARTY}{' '}
          players share one run, each with their own weapons and shop.
        </li>
        <li>
          The horde grows with the party: more monsters, a little tougher, and much tougher elites.
        </li>
        <li>
          At 0 HP you&apos;re down, not out: a teammate standing next to you for {REVIVE.seconds}{' '}
          seconds gets you back up. Anyone still down when a wave ends returns for the next one.
        </li>
        <li>
          Parties of 2, 3 and 4 have their own hiscores: Duo, Trio and Squad. Every party run goes
          on them by itself, and each team keeps its best.
        </li>
      </ul>

      <h2>Score and hiscores</h2>
      <ul class="lines">
        <li>
          Kills: {ENEMIES.zombie.points} for a zombie, {ENEMIES.hand.points} for a crawling hand,{' '}
          {ENEMIES.slime.points} for a bog slime (less for the bits it splits into),{' '}
          {ENEMIES.werewolf.points} for a werewolf. Elites are worth {ELITE.points}×.
        </li>
        <li>
          Surviving wave N earns N × {SCORE.waveBonus}, scaled by the HP you have left when it ends.
          Dodging pays.
        </li>
        <li>
          Clearing all {ZONES.wolfmoor.waves.length} waves adds {formatScore(SCORE.victoryBonus)}.
        </li>
        <li>
          Post your score from the results screen. The server replays your run to check it, so the
          hiscores stay honest. The weekly board resets every Monday (UTC).
        </li>
      </ul>
    </InfoPage>
  );
}

export function ChangelogScreen({ onBack }: { onBack: () => void }) {
  return (
    <InfoPage title="Changelog" onBack={onBack}>
      {CHANGELOG.map((release) => (
        <section key={release.version} class="release">
          <h2>
            v{release.version} · {release.title} <small>{release.date}</small>
          </h2>
          <ul class="lines">
            {release.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ))}
      <p class="hint">
        Follow{' '}
        <a href={CREATOR.url} target="_blank" rel="noopener noreferrer">
          {CREATOR.handle}
        </a>{' '}
        on X for updates.
      </p>
    </InfoPage>
  );
}
