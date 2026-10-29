# Survivors-like: Bob vs. the Haunted Swamp — Game Plan

> **Status:** Phase 0 done (2026-10-27). Phase 1 done and play-tested (2026-10-28). Phase 2 started with the Tone.js music and the full SFX bank (2026-10-28); the Strudel comparison is next. Hiscores (Phase 3's first half) are built on Vercel + Upstash (§8, 2026-10-28). Co-op (§9, Phase 5) is agreed (2026-10-29); 5a passed in Chromium, Firefox and WebKit; real-device checks (iPhone, Android) are next. Working title is TBD.
> **Decided 2026-10-27:** inspired-by naming (no RuneScape names in the game) · PixiJS + own sim · art via GPT Image.
> Library versions below were checked on npm today. Art is generated with GPT Image through the user's ChatGPT subscription (§6).

---

## 1. Pitch

**Bob**, a mildly confused default adventurer, teleports into a cursed, fog-choked swamp-land with the feel of RuneScape's Kharyrll/Morytania: a werewolf village, dead woods, a bog, a slayer tower and crypts. He has to survive **20 escalating waves** of undead and demons. The player **only moves**. Weapons auto-aim and auto-fire. Between waves you spend coins in a shop, level your skills and merge weapons into higher metal tiers. A run lasts 12–18 minutes, and each wave ends at a natural pause point, which suits phones.

**Pillars**
1. **One thumb.** Movement is the only input a player needs. Anything else is a bonus.
2. **RuneScape flavour through mechanics, not just art.** Coins, bones that feed prayer, metal tiers, skill levels, red hitsplats, green/red HP bars, slayer weaknesses (silver vs. werewolves).
3. **Readable on a 6-inch screen.** Big silhouettes, thick outlines, and a dark foggy world with a lit circle around Bob.
4. **Multiplayer-ready from day one.** The simulation is pure TypeScript and can run unchanged on a Node server.

---

## 2. Core loop & systems

```
[Wave: 20–60s timer, survive] → [Level-up picks] → [Shop] → next wave
   every 5th wave = elite wave · wave 10 = mini-boss · wave 20 = boss
[Death or clear] → results → hiscore submit → unlocks (skins / achievements)
```

**What we take from each reference game**

| From Brotato | From Vampire Survivors |
|---|---|
| Timed waves with a shop between them (good mobile pause points) | Hordes of hundreds and a power fantasy curve |
| One pickup that is both XP and currency | Weapon synergies and "evolutions" (here: tier merges + item combos) |
| 6 weapon slots, merging duplicates to tier up | Despawn/respawn of off-screen enemies to keep pressure on |
| Static sprites with squash/wobble animation (art savings!) | Meta-unlocks between runs |

### Economy
- **Coins (gp).** Enemies drop them. Each coin gives **both XP and shop currency** (Brotato's single-material trick: one thing to pick up, two uses). Coins left on the ground at wave end go into a "bank" that pays out during the next wave.
- **Bones (Phase 4).** Picking one up auto-buries it and fills the **Prayer bar**, which powers one active prayer: *Protect* (2s invulnerability) or *Smite* (damage nova). This becomes the single optional button on mobile.

### Skills (stats)
Each level gained during a wave becomes a pick of 1 from 4 random "+skill" cards after the wave.

| Skill | Effect | Skill | Effect |
|---|---|---|---|
| Hitpoints | Max HP | Ranged | Ranged damage |
| Defence | Armour (% damage reduction) | Magic | Spell damage / AoE size |
| Agility | Move speed, dodge | Prayer | Prayer charge rate, regen |
| Attack | Attack speed | Thieving | Luck: rarer shop items, more drops |
| Strength | Melee damage | Farming | Coins harvested at wave end |
| Slayer | Damage vs elites/bosses | Crafting | Turret/deployable power |

### Weapons
There are 6 slots. Weapons auto-fire at the nearest enemy.

| Weapon | Class | Behaviour |
|---|---|---|
| Scimitar | Melee | Fast arc slash in the facing direction |
| Dagger | Melee | Very fast stab, high crit |
| Battleaxe | Melee | Slow 360° spin, knockback |
| Silver sickle | Melee | **×2 vs werewolves/vampyres** (silver tag) |
| Shortbow | Ranged | Rapid single-target arrows |
| Crossbow | Ranged | Slow, piercing bolts |
| Throwing knives | Ranged | 3-way spread |
| Boomchin (chinchompa nod) | Ranged | Lobbed, explodes in AoE |
| Elemental staff | Magic | Strike → Bolt → Blast → Wave as it tiers up |
| Frost burst staff | Magic | AoE freeze around Bob (Ancient Magicks nod) |
| Cannon | Crafting | Deployable turret that rotates and fires |

**Tiers:** Bronze → Iron → Steel → Mithril → Adamant → Rune → Dragon. Two copies of the same weapon at the same tier merge into the next tier. A tier is just a **colour tint** on one icon, so we need one piece of art per weapon, not seven.

### Items (passives that make enemy mechanics matter)
- Salve amulet (+% vs undead)
- Earmuffs (immune to banshee screams)
- Ghostspeak amulet (reveals ghasts)
- Rock hammer (gargoyles shatter instantly)
- Ring of wealth (more drops)
- Holy symbol (+% vs demons)
- Regen bracelet
- Lantern (larger light radius)
- …about 30 at full scope

---

## 3. Bestiary

| Enemy | Zone | Behaviour | Counter / interest |
|---|---|---|---|
| Zombie | 1 | Shambles at Bob; the horde fodder | — |
| Crawling hand | 1 | Tiny, fast, comes in packs of ~10, flanks | AoE |
| Bog slime | 1–2 | Splits into 2, then 4; leaves slowing goo | AoE, avoid goo |
| Werewolf | 1 | Walks in human form; below 50% HP transforms, telegraphs (red flash), lunges | Silver ×2 |
| Ghast | 2 | Invisible until close, flickers | Ghostspeak amulet, Lantern |
| Gargoyle | 3 | Flies over props, tanky; at 0 HP becomes a statue that blocks the path for 5s | Rock hammer shatters it |
| Banshee | 3 | Keeps its distance, scream cone (slow + damage) | Earmuffs |
| Bloodveld | 3 | Long tongue-lash reach, heals on hit | Kite it |
| Vampyre spawn | 5 | Short blinks, drains HP | Silver, Holy |
| Shade | 4 | Phases through props, rises from the ground | — |
| Abyssal demon | 3 | **Teleports next to Bob** every few seconds behind a telegraph ring (late elite) | Movement, Slayer |

**Bosses**
- Wave 10: **Alpha Werewolf**. Howls to summon a pack, then charges across the arena.
- Wave 20: **Abyssal Overlord**. Tentacle hazard zones, spawns minions, teleport phases.
- Later zones: three **Barrow Wights** at once, and a **Vampyre Lord**.

---

## 4. Zones (one per "act", each with its own tileset and enemy mix)

1. **Wolfmoor Outskirts** (Canifis analog). Fog, dead trees, broken fences, gravestones. **MVP zone.**
2. **The Myre** (Mort Myre). Bog patches that slow you, ghasts, slimes.
3. **Slayer Spire** (Slayer Tower). Stone floor, pillars, gargoyles, banshees, abyssals.
4. **Barrow Crypts.** Tight arena with wights and shades.
5. **Bloodmere** (Darkmeyer). Vampyres, blood fountains.

Run modifiers: **difficulty 0–5**, and **Ironman** (no shop, only drops), which gets its own hiscores.

---

## 5. Tech architecture

### Stack (versions as of 2026-10-27)

| Concern | Choice | Why |
|---|---|---|
| Language/build | TypeScript + **Vite 8** (npm workspaces) | Fast HMR, simple, already have npm |
| Rendering | **PixiJS 8.22** (WebGL/WebGPU) | Batches hundreds of sprites in 1–2 draw calls (ParticleContainer) and is renderer-only, so our sim stays engine-free |
| Simulation | Own pure-TS package `@game/sim` | Runs headless in Node for multiplayer, bot balancing and replay verification |
| Menus/shop UI | **Preact 11** DOM overlay | Crisp text, accessible, easy responsive layout; the in-run HUD stays in Pixi for performance |
| Audio | **Tone.js 15.1** + plain-TS synth | Adaptive music (Tone); SFX rendered offline in TS; Strudel later (§7) |
| Backend | **Vercel** (static site + Node functions) + **Upstash Redis** (@upstash/redis 1.40) | Hiscores, with every run replayed on the server (§8). Accounts, achievements and cloud save TBD |
| Multiplayer (later) | **socket.io 4.8** on Node, hosted on Fly.io/Railway | Needs a persistent server, not serverless |
| Mobile | PWA (vite-plugin-pwa 2.0); Capacitor later if we go to app stores | Install to home screen, fullscreen, offline |
| Art generation | **`gpt-image` skill** (Codex CLI + ChatGPT sign-in) | Subscription-backed, real transparent PNGs, reference-guided consistency |
| Asset tooling | **sharp 0.35** scripts | Trim, downscale, quantize and pack the sprites into an atlas |
| Tests | Vitest | Sim unit tests + headless bot runs |

**Why not Phaser 4.2?** It's a strong option and would be faster for week one. However, its physics and scene systems are tied to the renderer, which makes running the same sim on a socket.io server awkward. Since multiplayer is on the roadmap, a renderer-only library plus our own sim is the cleaner foundation. **Decided: PixiJS.**

### Repo layout
```
apps/
  client/          Vite app: Pixi renderer, input, Preact UI, Tone audio, hiscores client
    server/        the hiscores API (Vercel functions, also served by the Vite dev server)
  server/          (Phase 5) Node + socket.io, imports @game/sim
packages/
  sim/             pure TS: world state, systems, waves, weapons, seeded RNG — NO DOM
  content/         data tables: enemies, weapons, items, waves, zones, names (data-driven)
  shared/          types, net protocol, constants
supabase/
  migrations/      SQL schema + RLS policies
  functions/       submit-run Edge Function
tools/assets/      slice-sheet.mjs, pack-atlas.mjs
art/source/        raw GPT Image outputs (kept so we can re-pack)
art/manifests/     gpt-image batch manifests, one per asset set
```

### Simulation design (the part that makes multiplayer cheap later)
- **Fixed timestep** (60 Hz sim). The renderer interpolates between ticks and runs at display rate.
- **Input commands, not key reads.** Each tick consumes a `{moveX, moveY, special}` command per player. Local play, network play and replays all feed the same thing.
- **Seeded PRNG.** No `Math.random()` in the sim, so a run is reproducible from `seed + inputs` (enables daily challenges and replay checks).
- **Pooled entities plus a spatial hash grid** for collisions, enemy separation and "nearest enemy" queries. This is the main performance lever in this genre. Phase 1 uses pooled plain objects rather than struct-of-arrays: at the 300-enemy cap a tick costs ~0.23 ms on desktop, so SoA can wait until a phone profile says otherwise.
- **Event stream** out of the sim (`hit`, `death`, `pickup`, `levelUp`, `waveEnd`…). Audio, VFX and UI subscribe to it, and later network clients consume the same events.

### Performance budget (target: mid-range Android at 60 fps)
- About 300 enemies, 200 projectiles and 150 pickups on mobile; more on desktop. Quality scales automatically if frame time climbs.
- One texture atlas. Cap DPR at 2. Damage numbers use pooled bitmap text.
- Far-off enemies despawn and respawn near the screen edge.
- A debug overlay shows FPS, entity counts and sim ms (toggleable).

### Mobile specifics
- **Floating virtual joystick**: it appears wherever the thumb lands, so it works in **portrait and landscape**.
- The camera shows a fixed world area based on the shorter screen side, so both orientations play fairly.
- `touch-action: none`, no double-tap zoom, safe-area insets (notches), and auto-pause on `visibilitychange`.
- Audio unlocks on the first tap (`Tone.start()` requires a user gesture). On iOS, set `navigator.audioSession.type = 'playback'` where supported so the mute switch doesn't silence the game.
- Haptics via `navigator.vibrate` on Android (no-op on iOS).
- Desktop: WASD/arrows, Space for the prayer special, Esc to pause, plus the Gamepad API.

---

## 6. Art pipeline (GPT Image via ChatGPT subscription)

**Tool:** the `gpt-image` skill (installed 2026-10-27). It drives Codex CLI with **Sign in with ChatGPT**, so images come out of the ChatGPT subscription's included usage, not API credits.
- It never uses the Images API or an API key.
- The limit is the plan's usage caps. The setup confirmed sign-in, not exactly how many images the plan allows, so we pace generations in batches.
- *(OpenArt was dropped: its free tier had 24 credits, about 4 images.)*

**What this changes vs. the OpenArt plan**
- **Real transparent PNGs** (`--background transparent`). The bridge rejects any output without an actual alpha channel, so there's no magenta chroma-keying or despill step.
- **One subject per image** instead of crammed 4×4 sheets. That gives more reliable framing, and each sprite can be re-rolled or revised alone (`--mode edit --edit-target <last output>`).
- **We can lock the art direction early.** One look-dev pass (Bob + one zombie) in Phase 0–1 costs nothing extra.

**Strategy**
1. **Style anchor first.**
   - Generate Bob, iterate until he's right, and save him as `art/source/anchor-bob.png`.
   - Every later sprite passes the anchor as `--reference` so the style stays consistent.
   - Zone props also reference one approved prop.
2. **Bulk art waits for Phase 2**, and only for enemies and weapons that survived Phase 1 playtesting. Phase 1 plays with procedural placeholder shapes.
3. **Batches** use `batch --manifest art/manifests/<set>.json`, with 2 jobs at a time by default and 4 at most: one manifest per set (bestiary, bosses, props, icons).
4. **No frame animation needed.** Like Brotato, each entity is one static sprite animated procedurally: walk bob, squash and stretch, lean into movement, horizontal flip, white hit-flash, death pop.
5. **Multiply art with code.** Metal tiers and some skins are tints or palette swaps, and hats are overlay sprites on an anchor point.
6. **Procedural for everything image models are bad at or that should be dynamic:** ground (noise-based tiling), fog layers, the darkness + light-radius mask, projectiles, spells, particles, hitsplats, HP bars and UI chrome. Lighting and fog sell the Morytania mood more than the sprites do.
7. **Pack tool** (`tools/assets/pack.mjs`, sharp):
   - trim to the alpha bounds and centre the sprite on its "feet" anchor
   - downscale to 128 px (2× for a 64 px on-screen size)
   - optionally quantize to one fixed **32-colour swamp palette**, which unifies every image (and can push toward a pixel-art look)
   - pack a Pixi atlas JSON
   - for the rare multi-icon image, split it by connected alpha regions

Raw outputs live in `art/source/` (committed), and packed atlases in `apps/client/public/atlas/`.

**Asset list (about 55 images at full scope)**

| Set | Contents | Phase |
|---|---|---|
| Anchor + Bob | Bob default, then 3 skins as edits of Bob (ghostly, werewolf-Bob, armoured), 4 hats | look-dev, then 2 |
| Bestiary | Zombie ×2, crawling hand, slime L/S, werewolf human/beast, ghast, gargoyle + stone form, banshee, bloodveld, vampyre spawn, shade, abyssal demon | 2 (MVP four first), 4 (rest) |
| Bosses | Alpha Werewolf, Abyssal Overlord, Barrow Wight, Vampyre Lord | 4 |
| Props | Dead tree ×2, fence, lamp post, gravestone, reeds, mushrooms, coffin, bone pile, Wolfmoor hut | 2 |
| Icons/pickups | 11 weapons (tiers are tints), coin pile, bones, potion, chest, heart, lantern, about 10 item icons | 2–4 |
| Key art | Title screen and hiscores banner (wide, non-transparent) | 2 |

**Style block appended to every sprite prompt:**
> "Single game sprite, top-down 3/4 view, centred with generous padding, transparent background, no text, no labels, no ground shadow. Chunky hand-painted fantasy style inspired by early-2000s MMO art, thick dark outlines, muted swamp palette of sickly greens, bruised purples and bone whites, readable silhouette at small size, light from top-left. Match the style of the reference image."

---

## 7. Audio: Tone.js now, Strudel later

**SFX (all synthesized, so no files and tiny bundle)**
- weapon swings: noise + filter sweep
- hits: MembraneSynth thump
- coins: MetalSynth tink, pitch rising with pickup streak
- level-up: arpeggio
- werewolf howl: FM + pitch envelope
- boss stinger
- UI clicks

Two rules keep a horde from turning into noise:
- **Voice limiting and throttling:** at most N copies of a sound per 50 ms, with random pitch variance. This matters when 100 enemies die at once.
- **Low look-ahead** for snappy SFX, kept separate from music scheduling.

**Adaptive music** runs on `Tone.Transport` at 80–90 BPM in a minor/phrygian mode (eerie organ and harpsichord, very Morytania).
- Layers: drone pad → harpsichord arp → low toms → choir pad on bosses.
- `setIntensity(0..1)` is driven by enemy count and wave number.
- The shop gets a stripped-down music-box variant.

**Strudel later:** everything goes behind a `MusicEngine` interface (`setScene`, `setIntensity`), so the Tone engine and a future Strudel engine are swappable.

**Built (2026-10-28): "Wolfmoor Waltz"**, an original spooky waltz in D minor (3/4, 32 bars, A A' B C, with the flat-two Eb chord for the haunted feel). Code lives in `apps/client/src/audio/`:
- `score.ts` holds the tune as plain data (note:beats strings that fail the tests if a bar is the wrong length).
- `music.ts` is the `MusicEngine` interface plus the scene and intensity → layer-mix rules.
- `tone-music.ts` is the Tone engine. Ten layers each have their own gain, so scene changes are crossfades on one transport:
  - instruments: pizzicato bass, church organ, harpsichord stabs and arpeggio, clarinet-ish lead, tubular bells, timpani, bone clacks, "ooh" choir and music box
  - the wave scene adds arpeggio → timpani → clacks → choir as intensity rises (crowd size, wave number, elites, final wave) and leans the tempo from 86 to 96 BPM
  - the shop is the music-box variant; victory and defeat have their own stings
- `audio.ts` (`GameAudio`) owns the single AudioContext shared by music and SFX. It:
  - unlocks on any gesture
  - suspends when muted or hidden, so both cost no CPU
  - lazy-loads Tone (a 69 KB gzip chunk) after the first tap
  - stores the Sound and Music toggles in localStorage
- Layer volumes were balanced from offline renders (Tone.Offline in headless Edge) of each solo layer. Music sits about 6–10 dB under the SFX.
- Measured cost: none visible. Still about 101 fps at 300 enemies with every layer playing.
- SFX: see the SFX bank below.

**Built (2026-10-28): the SFX bank.** Survivors-style punch (loud, layered hits, coins that climb the scale), with an old-sampler crunch and a haunted streak. It does not use Tone after all:
- `synth.ts` is a tiny offline synth in plain TypeScript. It has:
  - layers: oscillators with pitch and filter sweeps, FM, noise, Karplus-Strong plucks, metal clusters
  - effects: drive, bit-crush, sample-and-hold, a small Schroeder reverb
  - output: 32 kHz mono buffers
- Why not Tone:
  - a shot costs one `AudioBufferSourceNode` instead of a synth graph
  - SFX work without the Tone chunk, so they still play with the music off
  - every sound renders identically in Node, so tests check each one's level, peak and tail
- `sfx-bank.ts` holds 44 recipes, each with variants, max voices, min gap, pitch jitter, a loudness target (loudest-30 ms RMS) and a priority:
  - five weapon attacks plus the staff and Boomchin bursts
  - blade, arrow and crit impacts
  - a death per enemy family (zombie groan, bone clatter, slime bloops, werewolf yelp, elite gong)
  - werewolf howl (transform), snarl (telegraph) and lunge
  - Bob's hurt grunt, dodge and death wail
  - coins in D minor pentatonic, food chomps, level-up
  - wave horn, wave-clear bells, victory
  - 15 menu sounds: rarity-scaled upgrade picks, buy, sell, reroll (bone dice), lock and unlock
- `sfx.ts` maps sim events to sounds. It pans by distance from Bob and renders the bank in idle time after the first tap: about 0.45 s of work and 5 MB in total, and every sound was ready within 2.5 s in testing.
- `VoicePool` enforces the per-sound gap and voice caps, plus a global cap where coins drop out first and Bob, elites and wave calls always play.
- The sim's `enemyHit` event now says which weapon landed. Splash weapons sound once through their burst, not once per enemy caught in it.
- Measured: still about 101 fps in a wave-10 horde with all five weapons and the music. The voice limiter drops most of the surplus hits there, as intended. A fight mixed over the music at game level averages about 5 dB above the music alone and never reaches the master limiter.

> ⚠️ **License:** `@strudel/web` is **AGPL-3.0-or-later**. Two options:
> - **(a) Recommended:** compose in Strudel and **bounce the patterns to OGG loops** that the game plays. No AGPL code ships.
> - **(b)** Run Strudel live in-game for truly generative music. The client would then need to be AGPL-compatible, which effectively means open-sourcing it.

---

## 8. Backend: hiscores on Vercel + Upstash Redis

**Built (2026-10-28).** Replaces the Supabase plan for hiscores. Accounts, achievements and cloud save are still open: Upstash can hold them too, or a separate auth provider joins later.

**Score** (`packages/sim/src/score.ts`, numbers in `packages/content/src/score.ts`). It is computed inside the sim, so the server recomputes it from a replay.
- **Kills:** each enemy has `points` (zombie 10, crawling hand 5, bog slime 15/5/2 for the splits, werewolf 50); elites are worth ×10.
- **Wave bonus:** surviving wave N pays N × 100, scaled by the fraction of HP left when it ends (dead players count 0). Rewards dodging, which is what separates players once everyone can win.
- **Victory:** +2,500 for clearing the last wave.
- Bot runs land around 7–14k for a win; kills are roughly half of a winning score.

**Replays** (`packages/sim/src/replay.ts`). A solo run is its seed, starting weapon, one movement command per wave tick and the between-wave actions.
- Movement is quantized to 1/127 steps per axis before the sim sees it, live and in replays, so both step with identical numbers. Runs of identical commands are run-length coded: a keyboard run is a few kB, a joystick run under 100 kB.
- `replayRun` re-runs to the end and rejects anything malformed, refused actions, and recordings that end early or late.
- A full 7-minute run replays in under a second in Node.
- The sim avoids engine-dependent float math (see `src/math.ts` and the lint rule), so Chrome, Firefox and Safari runs replay the same in Node.

**API** (`apps/client/server/`, one bundle deployed as three Vercel functions):
- `POST /api/ticket {player}` → `{ticket, seed}`. The server picks every ranked run's seed (no seed shopping) and remembers it for 24 h.
- `POST /api/runs {ticket, player, name, rules, score, replay}`. Takes the ticket once (GETDEL), checks it belongs to this player and seed, re-runs the replay, and requires the server's score to equal the client's. The run's wave time must fit between the ticket and the submission, so runs can't be simulated faster than real time. Then it records the server's own score.
- `GET /api/hiscores?board=week|all&player=…` → top 50 plus the player's own row. Shared responses (no player) are CDN-cached for 10 s.
- `rules` is a hash of the sim and content sources, injected at build time (`scripts/rules-version.ts`). A client on older rules gets "reload to post" instead of a mismatch.
- Rate limits per IP per minute: 30 tickets, 10 runs, 120 board reads.

**Players:** no accounts. A random 128-bit id lives in localStorage, and the name is chosen on the results screen (1–16 letters, digits, spaces, - or _). Ids never appear in API responses.

**Redis layout** (prefix `bob:s1`; bump `SEASON` in `server/api.ts` to start fresh boards):
- `:ticket:<id>` JSON, 24 h TTL.
- `:all` and `:week:<ISO week>`: sorted sets of player → best score (`ZADD GT CH`), each with a `:runs` hash of that best run's details. Weekly boards expire after 8 weeks.
- `:rate:<kind>:<ip>:<minute>` counters.

**Deploy:** `npm run build` in `apps/client` also bundles the API (`vite.api.config.ts`) and assembles `.vercel/output` (Build Output API v3, `scripts/vercel-output.mjs`), which Vercel deploys as-is. Credentials come from Vercel's Upstash integration (`KV_REST_API_URL` / `KV_REST_API_TOKEN`, or the `UPSTASH_REDIS_REST_*` names). Without them the API answers 503 and runs are simply unranked.

**Local dev:** `npm run dev` serves the same API from a Vite plugin, on an in-memory store, or on Upstash if `.env.local` has credentials.

**Not done yet:** a name filter (bad names are removed by hand in the Upstash console: `ZREM` from both boards plus `HDEL` from their `:runs` hashes), per-weapon boards, and co-op runs.

**Achievements and skins (examples)**
- "Slayer task: 500 crawling hands"
- "Silver lining: 50 werewolf kills with silver"
- "Bury 10,000 bones"
- "Flawless wave 20"
- "Clear on Ironman"

Skins unlock from achievements:
- **Werebob** (1,000 werewolves)
- **Ghostly Bob** (die 25 times)
- **Rune Bob** (clear difficulty 5)
- **Party-hat Bob**: secret, a 1/5,000 drop on any kill

---

## 9. Co-op multiplayer (agreed 2026-10-29)

Up to 4 friends in one run, joined by a shared link. Pulled forward ahead of Phase 4.

**Decided (2026-10-29):** the socket server is hosted on Railway; revive by standing next to a teammate for 3 s, and anyone still down returns next wave; co-op hiscores per party size; lockstep input relay, provided 5a shows every browser computes identically.

### How it plays
- **Starting a game:** "Play with friends" on the title screen opens a lobby with an invite link (`…/?room=K7QX2M`, 6 characters with no lookalikes like 0/O or 1/I). Phones get the share sheet; desktop gets Copy link.
- **Joining:** opening the link goes straight to that lobby. You type a name (remembered from hiscores), pick a starting weapon and press Ready. The host starts when everyone is ready. The host can also start with fewer than 4 players.
- **In the run:** one shared arena. Each Bob gets a colour (outline and name tag), the HUD shows teammates' HP, and arrows at the screen edge point to teammates who are off screen. Your camera follows you.
- **Between waves:** everyone levels up and shops on their own, as in solo. A strip shows who you're waiting for, and a 45 s timer readies anyone still shopping.
- **Going down:** at 0 HP you're down, not dead. A teammate who stands next to you for 3 s revives you at 50% HP. Anyone still down comes back at the start of the next wave with 50% HP. The run is lost only when everyone is down at the same time.
- **No pause in co-op.** Esc opens the menu, but the game keeps going. The menu has a Leave button.
- **The end:** team score plus each player's kills and damage. "Play again" returns the same group to the lobby.
- **Co-op hiscores:** separate weekly and all-time boards per party size (Duo, Trio, Squad), with the team's names on each entry.

### Fairness: monsters scale with the party
Each player brings their own weapons, so the horde has to grow. These are starting numbers, tuned with bot parties:

| Players | Spawn rate | Enemy HP | Elite HP | Enemy cap |
|---|---|---|---|---|
| 1 | ×1 | ×1 | ×1 | 300 |
| 2 | ×1.6 | ×1.15 | ×1.8 | 340 |
| 3 | ×2.2 | ×1.3 | ×2.6 | 380 |
| 4 | ×2.8 | ×1.45 | ×3.4 | 420 |

- Damage per hit doesn't change: each player faces the same danger per contact, just more of it at once.
- Coins and XP work as they do now. Each coin goes to whoever picks it up, and loose coins at wave end are split evenly (the sim already does this). More monsters means roughly the same coins per player.
- **Tuning:** the headless bot plays 1-, 2-, 3- and 4-player runs on 100 seeds each. The factors are adjusted until bot parties win about as often, and lose about as much HP, as a solo bot. All factors live in `packages/content` (`COOP_SCALING`).
- The enemy cap rises a little with the party but stays bounded for phones. It's checked on a mid-range Android in 5b.

### Netcode: lockstep, with the server as referee
This replaces the earlier snapshot plan. That plan rejected lockstep because cross-browser float differences could desync clients. Since then the sim has proven deterministic: every posted hiscore is re-simulated in Node and matches the browser exactly. 5a extends that proof to Firefox and Safari before anything else is built.

1. **The server is the clock.** It counts frames at 60 per second. Every 50 ms (3 frames) it sends all players a bundle: each player's movement for those frames (2 bytes each) and any level-up or shop choices. That's about 20 messages a second of a few dozen bytes, around 1 kB/s per player.
2. **Clients send input when it changes.** For each frame the server uses each player's latest input. Missing input repeats the last one, and after 2 s of silence that player's Bob stands still.
3. **Every client runs the same sim on the same bundles,** so all worlds stay identical. Sounds and effects come from each client's own sim, exactly as in solo. No positions are ever streamed.
4. **The server also runs the sim.** It costs about 0.5 ms a frame, so one small server handles dozens of rooms. Because of it, the server knows when waves end and readies stragglers. It also computes the team's score for the hiscores itself, so co-op runs need no replay upload.
5. **Desync guard.** Each client sends a hash of its world every second. If one differs from the server's, that client rebuilds by re-simulating the room's input log from the start, which takes about a second for a full run.
6. **Reconnects and backgrounded tabs** use the same fast-forward from the input log. Players can rejoin the same run within 2 minutes.
7. **Trade-off: input latency.** Your own Bob responds one round trip after you press, around 50–150 ms on normal connections. That's fine for an auto-attack game, but noticeable on bad 4G. If playtests say it hurts, 5f adds **rollback**: your Bob moves instantly, and the sim rewinds a few frames whenever teammates' inputs arrive.

- **Fallback if 5a fails:** the server runs the sim and streams binary snapshots, and clients interpolate everyone and predict their own Bob. It's robust to determinism bugs, but uses 10–50× the bandwidth, needs server-sent events for every sound and effect, and is a lot more client code.

### Server (`apps/server`)
- **Stack:** Node with socket.io 4.8, importing `@game/sim` and `@game/content` like the hiscores API does.
- **Rooms, in memory:** code, host, up to 4 players (id, name, weapon, colour, ready, connected), the input log and the sim world.
- **Messages:** `room:create`, `room:join`, `lobby` (state), `ready`, `start` (seed and players), `input`, `action`, `frames` (the bundles), `hash`, `resync`, `over`.
- **Limits:**
  - 4 players per room.
  - A room closes 10 minutes after it's empty.
  - Messages are rate-limited per socket.
  - Names follow the same rules as the hiscores.
  - Connections are accepted only from the game's own domains.
- **Hosting: Railway** (about $5/month). Vercel can't hold open connections, so only the socket server lives there. Players never see its address: the game, invite links and hiscores stay on the Vercel site, and the client connects to Railway by itself.
- The client finds the server through `VITE_COOP_URL`. Co-op hiscores are written to the same Upstash database (prefix `bob:`), with the REST token stored as a server secret.

### Changes by package
- **Sim:**
  - party scaling in the spawner and `spawnEnemy`;
  - a `downed` state with revive progress, and `startWave` bringing back players who are down;
  - a frame-based co-op replay (every player's input per frame, plus actions);
  - a cheap world hash.
- **Client:**
  - the lobby, invite links and share sheet;
  - a `NetSession` that feeds `step()` from server bundles instead of the local clock;
  - player colours, name tags, teammate HP, off-screen arrows, and a spectator camera while you're down;
  - the ready strip and timer, co-op results;
  - a ping indicator, "Reconnecting…", and host hand-over when the host leaves.
- **Content:** `COOP_SCALING`.
- **API:** co-op boards, written by the game server.

## 10. Phases

### Phase 0: Foundation (small)
- `git init`, npm-workspaces monorepo, Vite + TS + Pixi, ESLint/Prettier, Vitest.
- Fixed-timestep loop, seeded RNG, input-command layer (keyboard + floating joystick).
- Debug overlay. `.codegpt-game.json` manifest for the dev loop (§11).
- **Art look-dev:** generate the Bob style anchor plus one zombie with `gpt-image`, and agree on the look before anything else gets drawn.
- **Done when:** a placeholder Bob moves around a procedural foggy arena at 60 fps on a real phone in both orientations, and the art direction is approved.

### Phase 1: Core loop greybox (medium). *"Is it fun?" gate*
- Zone 1 with 10 waves.
- **4 enemies:** zombie, crawling hand, slime, werewolf.
- **5 weapons:** scimitar, dagger, shortbow, staff, boomchin.
- About 12 items, coins as XP + currency, skills level-up picks, shop (reroll + lock), HP and death, results screen.
- Hitsplats, HP bars and basic juice (knockback, hit-flash, shake).
- All art is placeholder shapes and all sound is placeholder blips.
- **Done when:** a full 10-wave run is playable and *feels good*. Tune here before generating bulk art.
- **Built (2026-10-28):** all of the above, plus 17 items, a weapon sell button, the coin bank, a title screen with starting-weapon choice, pause (Esc/P, button, auto on tab switch), mute (M) and placeholder Web Audio blips (Tone.js waits for Phase 2).
  - All numbers live in `packages/content`. A headless bot (`packages/sim/test/bot.ts`) plays every weapon to the end of a run as a soak test; it currently clears all 10 waves in about 6 of 15 runs. It runs away from everything, so melee looks weaker in its numbers than it should.
  - Dev shortcuts: `?weapon=staff&wave=5&seed=42` starts a run directly, and N skips to the end of the wave (dev builds only).
  - Menus are Preact with JSX compiled by Vite's built-in oxc transform, so no `@preact/preset-vite` (which pulls in Babel).
  - Known gap: menus need a mouse or touch. Gamepad menu navigation comes with Phase 2's settings work.

### Phase 2: Look & sound vertical slice (medium)
- Batch-generate the Phase 2 rows of the §6 asset list, build the pack pipeline and swap in the atlas.
- Procedural ground, fog, lighting mask and particles.
- SFX bank and adaptive music (**both done 2026-10-28**, see §7). Title screen, settings (volume, shake, haptics), pause.
- PWA install + fullscreen. Deploy to static hosting for phone testing over HTTPS.
- **Done when:** a shareable link plays a gorgeous, moody 10-wave run on a phone.

### Phase 3: Hiscores, then accounts and achievements (small–medium)
- **Done (2026-10-28):** score, replay-verified hiscores on Vercel + Upstash, weekly and all-time boards, hiscores page, score on the HUD and results screen (§8).
- Next: accounts (provider TBD), about 10 achievements, skin unlocks and equip, cloud save sync.
- **Done when:** players appear on weekly and all-time hiscores (done), unlock a skin, and keep it across devices.

### Phase 4: Content depth (large)
- 20 waves, the full bestiary, the Alpha Werewolf and Abyssal Overlord bosses.
- Weapon tiers and merging, about 30 items, damage tags (silver/undead/demon), bones → prayer special.
- Zone 2 (The Myre), difficulty 0–5, Ironman mode, more achievements and skins.
- Headless **bot-run balancing**: run thousands of simulated waves overnight and export the stats.
- **Done when:** a full 20-wave run is balanced across difficulties, with 2 zones.

### Phase 5: Co-op multiplayer (large; pulled ahead of Phase 4, plan in §9)
- **5a Determinism check (small).** Play one recorded run in Chrome, Firefox, Safari on iOS and Chrome on Android, and compare world hashes every second. Identical everywhere means go with lockstep; otherwise switch to the snapshot fallback before building more.
  - **2026-10-29: the three engines pass.** The `?sync` page plays a full solo run and a full 4-bot party run (421 checkpoints each). Every hash matched Node in Chromium (Edge 156), Firefox 157 (SpiderMonkey) and WebKit 27.2 (JavaScriptCore), both locally and on the live site. `npm run sync:browsers [url]` re-runs it; Playwright Firefox and WebKit are installed for that. Still to confirm on real devices: Safari on iPhone and Chrome on Android.
- **5b Party sim (small–medium).** Party scaling, down and revive, co-op replays and the world hash. Bot parties of 1–4 tune `COOP_SCALING`, and a 4-player wave 10 is measured on a mid-range phone.
- **5c Server and lobby (medium).** `apps/server`, rooms, invite links, the lobby, and lockstep play between two browsers locally, then deployed to the chosen host.
- **5d Co-op feel (medium).** Colours, name tags, teammate HP, off-screen arrows, the spectator camera, the ready timer, reconnect fast-forward, Leave and host hand-over.
- **5e Co-op hiscores (small).** Duo, Trio and Squad boards, weekly and all time.
- **5f Rollback (medium, only if needed).** Instant local movement if the input delay feels bad over 4G.
- **Done when:** four phones on different networks (one on 4G) finish a run together with no desyncs, and it takes under 30 s from tapping an invite link to the first wave.

### Phase 6: Creative extras (ongoing)
- Strudel-composed soundtrack (bounced loops or live, see §7).
- Daily seeded challenge with its own leaderboard.
- Zones 3–5 and more characters with different starting stats (e.g. the "Pure": high Strength, 1 Defence).
- Optional Capacitor wrap for app stores, accessibility options.

---

## 11. Dev & verification loop

**Build errors:** the `game-development` skill's `game.mjs` with a generic manifest:
```json
{
  "engine": "generic",
  "launch": { "cmd": "npm", "args": ["run", "dev", "-w", "apps/client"] },
  "log": { "stdout": true },
  "ready": "Local:",
  "sourceRoots": ["apps/client/src", "packages/sim/src", "packages/content/src"]
}
```
`game.mjs run` / `logs --errors` covers Vite/TS build and HMR errors, mapped back to source files.

**Runtime errors and visuals:** browser runtime errors don't reach Vite's stdout, so we use the built-in browser pane for console errors, screenshots and **mobile viewport emulation**.

**Real devices:** `vite --host` on the LAN (allow it through the Windows firewall once), and later the deployed HTTPS URL.

**Sim tests:** Vitest covers damage formulas, merge rules, wave spawn tables and shop RNG. A **headless bot** catches NaNs, softlocks and balance issues without opening a browser.

---

## 12. Risks & open decisions

| Risk | Plan |
|---|---|
| **IP:** RuneScape, Morytania, Kharyrll, Canifis, Barrows, Bloodveld etc. are Jagex IP | **Decided: inspired names only.** In-game text uses the original names in this doc (Wolfmoor, The Myre, Slayer Spire…). RuneScape names appear only here as design references. All names live in `packages/content` |
| **Art consistency and usage caps:** ChatGPT plan limits apply, and AI sprites can drift in style | Approve a style anchor first and pass it as a reference on every sprite. Batch in small sets, use tints and procedural FX to multiply assets, and placeholder art until Phase 2 |
| ~~Project lives in OneDrive~~ | Resolved: moved to `C:\Projects\3d_killa` |
| **Windows line endings** (global `core.autocrlf=true`) | Add `.gitattributes` with `* text=auto eol=lf` in Phase 0 so scripts and regex-based tooling behave the same everywhere |
| **Strudel AGPL** | Bounce Strudel compositions to audio files (§7) |
| **Score cheating** | **Done:** the server picks the seed, replays every posted run and records its own score (§8). Bots that play in real time remain possible |
| **iOS Safari audio quirks** | Gesture unlock, audioSession, resume on visibility change |
| **Co-op desyncs** (lockstep needs every browser to compute identically) | The sim already avoids engine-dependent float math, and solo replays already match Node exactly. 5a proves it across browsers first; the desync guard rebuilds a client from the input log; snapshots are the fallback |
| **Co-op input delay** on slow connections | Measured in 5c playtests; rollback (5f) if it hurts |
| **Low-end Android performance** | Atlas + ParticleContainer + spatial hash + entity caps + auto quality scaling |
