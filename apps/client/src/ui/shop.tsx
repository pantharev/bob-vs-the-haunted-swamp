import {
  ITEMS_BY_ID,
  MAX_WEAPONS,
  RARITY_NAMES,
  SKILL_IDS,
  SKILLS,
  STATS,
  WEAPONS,
  type StatKey,
} from '@game/content';
import { buyBlocker, rerollPrice, sellPrice, type Player } from '@game/sim';
import type { Game } from '../game';
import { useHotkeys } from './app';
import { PartyStrip } from './coop';
import { formatStat, itemIcon, offerInfo, WEAPON_ICONS } from './format';

const BLOCKER_TEXT = { sold: 'Sold', coins: 'Not enough gp', slots: 'Weapon slots full' } as const;

export function ShopScreen({ game, player }: { game: Game; player: Player }) {
  const { world } = game;
  const reroll = rerollPrice(world, player);
  const next = () => game.act({ type: 'ready' });
  useHotkeys(
    (code) => {
      if (code === 'KeyR') {
        game.act({ type: 'reroll' });
        return true;
      }
      if (code === 'Enter') {
        next();
        return true;
      }
    },
    [player],
  );

  return (
    <div class="screen enter">
      <div class="panel wide">
        <PartyStrip game={game} />
        <header class="shop-head">
          <div>
            <h1>Shop</h1>
            <p class="sub">
              Wave {world.wave} cleared · next up: wave {world.wave + 1} of {world.waves.length}
            </p>
          </div>
          <span class="purse" aria-label={`${player.coins} gold pieces`}>
            {player.coins} <small>gp</small>
          </span>
        </header>

        <div class="cards">
          {player.shop.map((offer, i) => {
            const info = offerInfo(offer);
            const blocker = buyBlocker(player, offer);
            return (
              <div
                key={`${offer.id}-${i}`}
                class={`card offer rarity-${offer.rarity} ${offer.sold ? 'sold' : ''}`}
              >
                <span class="icon">{info.icon}</span>
                <span class="name">{info.name}</span>
                <span class="rarity">
                  {offer.kind === 'weapon' ? 'Weapon' : RARITY_NAMES[offer.rarity]}
                </span>
                <span class="blurb">{info.blurb}</span>
                <ul class="lines">
                  {info.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <div class="offer-actions">
                  <button
                    class="lock"
                    aria-pressed={offer.locked}
                    aria-label={offer.locked ? 'Unlock' : 'Lock for next shop'}
                    title={
                      offer.locked ? 'Locked: stays for the next shop' : 'Lock for the next shop'
                    }
                    disabled={offer.sold}
                    onClick={() => game.act({ type: 'toggleLock', index: i })}
                  >
                    {offer.locked ? '🔒' : '🔓'}
                  </button>
                  <button
                    class="buy"
                    disabled={blocker !== null}
                    title={blocker ? BLOCKER_TEXT[blocker] : undefined}
                    onClick={() => game.act({ type: 'buy', index: i })}
                  >
                    {offer.sold ? 'Sold' : `${offer.price} gp`}
                  </button>
                </div>
                {blocker === 'slots' && !offer.sold && <span class="warn">Weapon slots full</span>}
              </div>
            );
          })}
        </div>

        <div class="actions">
          <button disabled={player.coins < reroll} onClick={() => game.act({ type: 'reroll' })}>
            Reroll · {reroll} gp
          </button>
          <button class="primary big" onClick={next}>
            Next wave ▶
          </button>
        </div>

        <section>
          <h2>
            Weapons {player.weapons.length}/{MAX_WEAPONS}
          </h2>
          <div class="slots">
            {player.weapons.map((w, i) => (
              <div key={i} class="slot">
                <span class="icon">{WEAPON_ICONS[w.id]}</span>
                <span class="name">{WEAPONS[w.id].name}</span>
                <button
                  class="small"
                  disabled={player.weapons.length <= 1}
                  onClick={() => game.act({ type: 'sellWeapon', index: i })}
                >
                  Sell +{sellPrice(world, w.id)}
                </button>
              </div>
            ))}
            {Array.from({ length: MAX_WEAPONS - player.weapons.length }, (_, i) => (
              <div key={`empty-${i}`} class="slot empty" />
            ))}
          </div>
        </section>

        <Items player={player} />
        <Stats player={player} />
      </div>
    </div>
  );
}

function Items({ player }: { player: Player }) {
  const owned = Object.entries(player.items).filter(([, count]) => count > 0);
  if (owned.length === 0) return null;
  return (
    <section>
      <h2>Items</h2>
      <div class="chips">
        {owned.map(([id, count]) => {
          const item = ITEMS_BY_ID.get(id);
          return (
            <span key={id} class={`chip rarity-${item?.rarity ?? 1}`} title={item?.blurb}>
              {itemIcon(id)} {item?.name ?? id}
              {count > 1 && <b> ×{count}</b>}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function Stats({ player }: { player: Player }) {
  const shown = (Object.keys(STATS) as StatKey[]).filter(
    (k) => k !== 'maxHp' && player.stats[k] !== 0,
  );
  return (
    <details class="stats">
      <summary>
        Stats · {player.maxHp} max HP · level {player.level}
      </summary>
      <div class="skill-grid">
        {SKILL_IDS.map((s) => (
          <span key={s} class={player.skillTotals[s] === 0 ? 'zero' : ''}>
            {SKILLS[s].name} <b>{player.skillTotals[s]}</b>
          </span>
        ))}
      </div>
      {shown.length > 0 && (
        <ul class="lines">
          {shown.map((k) => (
            <li key={k}>{formatStat(k, player.stats[k])}</li>
          ))}
        </ul>
      )}
    </details>
  );
}
