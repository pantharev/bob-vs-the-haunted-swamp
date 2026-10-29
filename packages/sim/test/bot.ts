import { type SkillId, type WeaponId, type ZoneDef } from '@game/content';
import {
  applyAction,
  buyBlocker,
  createWorld,
  ReplayRecorder,
  step,
  type InputCommand,
  type Player,
  type Replay,
  type RunAction,
  type RunOutcome,
  type World,
} from '../src';

/**
 * A simple headless player for balance checks and soak tests (PLAN.md §11).
 * It only reads world state, so a bot run is as deterministic as the sim.
 */

const THREAT_RADIUS = 240;
const WALL_MARGIN = 220;
const SKILL_PRIORITY: readonly SkillId[] = [
  'attack',
  'hitpoints',
  'strength',
  'ranged',
  'magic',
  'agility',
  'defence',
  'prayer',
  'slayer',
  'thieving',
  'farming',
];

export function botInput(world: World, p: Player): InputCommand {
  let ax = 0;
  let ay = 0;
  for (const e of world.enemies) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > THREAT_RADIUS * THREAT_RADIUS) continue;
    const w = (e.damage + 1) / (d2 + 100);
    ax += dx * w;
    ay += dy * w;
  }
  for (const g of world.goo) {
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < (g.radius + 40) * (g.radius + 40)) {
      ax += dx * 0.002;
      ay += dy * 0.002;
    }
  }

  const threat = Math.sqrt(ax * ax + ay * ay);
  if (threat > 0.0005) {
    // Kite: mostly away, partly sideways, so it circles instead of pinning itself to a wall.
    const awayX = ax / threat;
    const awayY = ay / threat;
    ax = awayX - awayY * 0.6;
    ay = awayY + awayX * 0.6;
  }
  // Drift towards the nearest coin, more strongly the calmer things are.
  let best = Infinity;
  let cx = 0;
  let cy = 0;
  for (const pk of world.pickups) {
    const dx = pk.x - p.x;
    const dy = pk.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) {
      best = d2;
      cx = dx;
      cy = dy;
    }
  }
  if (best < Infinity) {
    const d = Math.sqrt(best) || 1;
    const pull = threat > 0.002 ? 0.3 : 1;
    ax += (cx / d) * pull;
    ay += (cy / d) * pull;
  }

  const { width, height } = world.arena;
  if (p.x < WALL_MARGIN) ax += (WALL_MARGIN - p.x) / WALL_MARGIN;
  if (p.x > width - WALL_MARGIN) ax -= (p.x - (width - WALL_MARGIN)) / WALL_MARGIN;
  if (p.y < WALL_MARGIN) ay += (WALL_MARGIN - p.y) / WALL_MARGIN;
  if (p.y > height - WALL_MARGIN) ay -= (p.y - (height - WALL_MARGIN)) / WALL_MARGIN;

  const len = Math.sqrt(ax * ax + ay * ay);
  return len > 0.001 ? { moveX: ax / len, moveY: ay / len } : { moveX: 0, moveY: 0 };
}

/** Spends the intermission: best upgrade card, then greedy shopping, then ready. `act` applies each choice. */
export function botIntermission(
  world: World,
  index: number,
  act: (action: RunAction) => boolean = (action) => applyAction(world, index, action),
): void {
  for (let guard = 0; guard < 200 && world.phase === 'intermission'; guard++) {
    const p = world.players[index]!;
    if (p.intermission === 'levelUp') {
      let best = 0;
      p.upgrades.forEach((u, i) => {
        const b = p.upgrades[best]!;
        const better =
          u.rarity > b.rarity ||
          (u.rarity === b.rarity && SKILL_PRIORITY.indexOf(u.skill) < SKILL_PRIORITY.indexOf(b.skill));
        if (better) best = i;
      });
      act({ type: 'chooseUpgrade', index: best });
    } else if (p.intermission === 'shop') {
      const buyable = p.shop
        .map((offer, i) => ({ offer, i }))
        .filter(({ offer }) => buyBlocker(p, offer) === null)
        .sort((a, b) => score(b.offer, p) - score(a.offer, p));
      const pick = buyable[0];
      if (pick) act({ type: 'buy', index: pick.i });
      else act({ type: 'ready' });
    } else {
      return;
    }
  }
}

function score(offer: Player['shop'][number], p: Player): number {
  if (offer.kind === 'weapon') return p.weapons.length < 4 ? 10 : 1;
  return offer.rarity * 2;
}

export interface BotResult {
  outcome: RunOutcome | null;
  wave: number;
  level: number;
  kills: number;
  coins: number;
  weapons: number;
  items: number;
  seconds: number;
  maxEnemies: number;
}

export function runBot(
  seed: number,
  zone: ZoneDef,
  weapons: readonly WeaponId[],
  onTick?: (world: World) => void,
): BotResult {
  const world = createWorld({ seed, zone, weapons });
  let maxEnemies = 0;
  // Generous cap: a full run is ~7 minutes of wave time.
  for (let guard = 0; guard < 60 * 60 * 20 && world.phase !== 'over'; guard++) {
    if (world.phase === 'intermission') {
      botIntermission(world, 0);
      continue;
    }
    step(world, world.players.map((p) => botInput(world, p)));
    maxEnemies = Math.max(maxEnemies, world.enemies.length);
    onTick?.(world);
  }
  const p = world.players[0]!;
  return {
    outcome: world.outcome,
    wave: world.wave,
    level: p.level,
    kills: world.stats.kills,
    coins: world.stats.coinsCollected,
    weapons: p.weapons.length,
    items: Object.values(p.items).reduce((a, b) => a + b, 0),
    seconds: Math.round(world.stats.timeTicks / 60),
    maxEnemies,
  };
}

/**
 * A bot run played the way the client plays: every command and accepted action
 * goes through a ReplayRecorder. `onTick` sees the world after each wave tick.
 */
export function recordBot(
  seed: number,
  zone: ZoneDef,
  weapon: WeaponId,
  onTick?: (world: World) => void,
): { world: World; replay: Replay } {
  const world = createWorld({ seed, zone, weapons: [weapon] });
  const recorder = new ReplayRecorder(seed, weapon);
  for (let guard = 0; guard < 60 * 60 * 20 && world.phase !== 'over'; guard++) {
    if (world.phase === 'intermission') {
      botIntermission(world, 0, (action) => {
        const ok = applyAction(world, 0, action);
        if (ok) recorder.action(action);
        return ok;
      });
      continue;
    }
    step(world, [recorder.input(botInput(world, world.players[0]!))]);
    onTick?.(world);
  }
  return { world, replay: recorder.finish() };
}
