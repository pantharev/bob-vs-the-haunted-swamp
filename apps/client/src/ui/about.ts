/** Who made the game, and what changed when. Newest release first. */

export const CREATOR = {
  handle: '@Nicolas68610783',
  url: 'https://x.com/Nicolas68610783',
} as const;

export interface Release {
  readonly version: string;
  readonly date: string;
  readonly title: string;
  readonly notes: readonly string[];
}

export const CHANGELOG: readonly Release[] = [
  {
    version: '0.3',
    date: '2026-10-28',
    title: 'Sound',
    notes: [
      'Music: the Wolfmoor Waltz, an original spooky waltz that builds as a wave gets busier, with a music-box version in the shop and stings for victory and defeat.',
      'Sound effects for every weapon, hit, enemy death, pickup and menu (44 in all). Coins chime up the scale as you collect a pile.',
      'Sound and Music switches on the title and pause screens.',
      'This changelog and a How to play guide, on the title and pause screens.',
    ],
  },
  {
    version: '0.2',
    date: '2026-10-28',
    title: 'First playable',
    notes: [
      'A full 10-wave run in the Wolfmoor.',
      'Zombies, crawling hands, splitting bog slimes, werewolves, and elite versions of each.',
      'Five starting weapons, 17 items and 11 skills to level up.',
      'A shop between waves with reroll, lock and sell, plus the coin bank.',
      'Title, pause and results screens that work on phones.',
    ],
  },
  {
    version: '0.1',
    date: '2026-10-27',
    title: 'Foundations',
    notes: [
      'Bob, the swamp arena, fog and lantern light.',
      'Touch joystick, keyboard and gamepad controls.',
    ],
  },
];

export const VERSION = CHANGELOG[0]!.version;
