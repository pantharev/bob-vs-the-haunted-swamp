import { startWave } from './run';
import { buy, openShop, rerollPrice, restock, sellPrice } from './shop';
import { recomputeStats } from './stats';
import { rollUpgrades } from './upgrades';
import type { World } from './world';

/**
 * Between-wave choices. Like movement input, these are the only way the UI
 * changes the run, so a run is still reproducible from seed + inputs + actions.
 */
export type RunAction =
  | { readonly type: 'chooseUpgrade'; readonly index: number }
  | { readonly type: 'buy'; readonly index: number }
  | { readonly type: 'reroll' }
  | { readonly type: 'toggleLock'; readonly index: number }
  | { readonly type: 'sellWeapon'; readonly index: number }
  | { readonly type: 'ready' };

/** Applies one player's action. Returns false (and changes nothing) if it isn't allowed now. */
export function applyAction(world: World, playerIndex: number, action: RunAction): boolean {
  world.events.length = 0;
  const p = world.players[playerIndex];
  if (world.phase !== 'intermission' || !p?.alive) return false;

  switch (action.type) {
    case 'chooseUpgrade': {
      const choice = p.upgrades[action.index];
      if (p.intermission !== 'levelUp' || !choice) return false;
      p.skills[choice.skill] += choice.points;
      recomputeStats(p);
      p.pendingLevels--;
      if (p.pendingLevels > 0) {
        rollUpgrades(world, p);
      } else {
        p.upgrades = [];
        p.intermission = 'shop';
        openShop(world, p);
      }
      return true;
    }
    case 'buy': {
      const offer = p.shop[action.index];
      return p.intermission === 'shop' && offer !== undefined && buy(p, offer);
    }
    case 'reroll': {
      const price = rerollPrice(world, p);
      if (p.intermission !== 'shop' || p.coins < price) return false;
      p.coins -= price;
      p.rerolls++;
      restock(world, p);
      return true;
    }
    case 'toggleLock': {
      const offer = p.shop[action.index];
      if (p.intermission !== 'shop' || !offer || offer.sold) return false;
      offer.locked = !offer.locked;
      return true;
    }
    case 'sellWeapon': {
      const weapon = p.weapons[action.index];
      // Always keep one weapon, or the run can't progress.
      if (p.intermission !== 'shop' || !weapon || p.weapons.length <= 1) return false;
      p.coins += sellPrice(world, weapon.id);
      p.weapons.splice(action.index, 1);
      return true;
    }
    case 'ready': {
      if (p.intermission !== 'shop') return false;
      p.intermission = 'ready';
      if (world.players.every((q) => !q.alive || q.intermission === 'ready')) startWave(world, world.wave + 1);
      return true;
    }
  }
}
