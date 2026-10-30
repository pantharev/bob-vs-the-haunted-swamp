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
    version: '0.6',
    date: '2026-10-30',
    title: 'Co-op',
    notes: [
      'Co-op is live! Press Play with friends on the title screen, send the invite link, and take on the swamp with up to 3 friends.',
      'Everyone picks a weapon and readies up, then the host starts. Between waves everyone levels up and shops on their own; the next wave starts once everyone is ready, or after 45 seconds.',
      'Esc opens the menu in co-op, but the game keeps going. If your connection drops or you reload, you go straight back into your game.',
      'Co-op makes sure everyone runs the same version of the game. If you don’t, it asks you to reload instead of letting the game drift apart.',
    ],
  },
  {
    version: '0.5',
    date: '2026-10-29',
    title: 'Co-op groundwork',
    notes: [
      'Co-op for up to 4 friends is on the way. The rules are in: the horde grows with every extra player (more monsters, a little tougher, much tougher elites), tuned so a party wins about as often as a solo player.',
      'Downed, not dead: stand next to a fallen teammate for 3 seconds to revive them at half HP. Anyone still down at the end of a wave is back for the shop and starts the next wave at half HP.',
      'Try it early with bot teammates: add ?bots=3 to the address. Those runs don’t go on the hiscores.',
      'Behind the scenes: proved every browser (Chrome, Firefox, Safari’s engine, Android) runs the game exactly the same, which co-op relies on.',
      'The co-op lobby is built: create a game, send the invite link, everyone picks a weapon and readies up, and the whole party plays the same run. A reload drops you straight back in. It switches on here as soon as the co-op server is online.',
    ],
  },
  {
    version: '0.4',
    date: '2026-10-28',
    title: 'Hiscores',
    notes: [
      'A score for every run: points for each kill (elites are worth a lot), a bonus for each wave you survive that grows with the HP you keep, and a big bonus for winning.',
      'Hiscores for this week and all time. Post a run from the results screen with the name you choose.',
      'Every posted run is replayed on the server to check its score.',
      'Your score is on screen during a run.',
    ],
  },
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
