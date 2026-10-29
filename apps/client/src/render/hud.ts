import { xpToNext, type Player, type World } from '@game/sim';
import { BitmapText, Container, Sprite, Texture } from 'pixi.js';
import { HUD_FONT, type Art } from './art';

const BAR_WIDTH = 180;
const MARGIN = 12;

/**
 * In-run HUD drawn in Pixi (PLAN.md §5: menus are DOM, the HUD stays on the
 * canvas). Text only re-renders when its value changes.
 */
export class Hud {
  readonly root = new Container();
  private readonly left = new Container();
  private readonly centre = new Container();
  private readonly hpFill = bar(0x2fd12f);
  private readonly hpText = text(15);
  private readonly xpFill = bar(0x46b4ff);
  private readonly levelText = text(13);
  private readonly coinText = text(17);
  private readonly bankText = text(13);
  private readonly scoreText = text(13);
  private readonly waveText = text(14);
  private readonly timerText = text(30);
  private readonly safe = SafeArea.shared();
  private shown = new Map<BitmapText, string>();

  constructor(art: Art) {
    const hpBack = bar(0xc0170f);
    hpBack.width = this.hpFill.width = BAR_WIDTH;
    hpBack.height = this.hpFill.height = 18;
    const hpFrame = bar(0x000000);
    hpFrame.alpha = 0.6;
    hpFrame.position.set(-2, -2);
    hpFrame.width = BAR_WIDTH + 4;
    hpFrame.height = 22;
    this.hpText.anchor.set(0.5);
    this.hpText.position.set(BAR_WIDTH / 2, 9);

    const xpBack = bar(0x0d1a26);
    xpBack.alpha = 0.85;
    xpBack.position.set(0, 23);
    this.xpFill.position.set(0, 23);
    xpBack.width = BAR_WIDTH;
    xpBack.height = this.xpFill.height = 6;
    this.levelText.anchor.set(0, 0.5);
    this.levelText.position.set(BAR_WIDTH + 6, 26);

    const coin = new Sprite(art.coin);
    coin.anchor.set(0.5);
    coin.scale.set(1.25);
    coin.position.set(9, 45);
    this.coinText.anchor.set(0, 0.5);
    this.coinText.position.set(22, 45);
    this.bankText.anchor.set(0, 0.5);
    this.bankText.tint = 0xffd75a;
    this.scoreText.position.set(0, 62);

    this.left.addChild(hpFrame, hpBack, this.hpFill, this.hpText, xpBack, this.xpFill, this.levelText);
    this.left.addChild(coin, this.coinText, this.bankText, this.scoreText);

    this.waveText.anchor.set(0.5, 0);
    this.timerText.anchor.set(0.5, 0);
    this.timerText.position.set(0, 16);
    this.centre.addChild(this.waveText, this.timerText);
    this.root.addChild(this.left, this.centre);
  }

  update(world: World, p: Player, screenW: number, screenH: number): void {
    const s = Math.min(1.5, Math.max(0.8, Math.min(screenW, screenH) / 420));
    const inset = this.safe.read();
    this.left.scale.set(s);
    this.left.position.set(inset.left + MARGIN, inset.top + MARGIN);
    this.centre.scale.set(s);
    // On narrow phones the centred wave label would sit on the HP bar; slide it right.
    const leftEdge = inset.left + MARGIN + (BAR_WIDTH + 44) * s;
    const halfLabel = (Math.max(this.waveText.width, this.timerText.width) / 2 + 6) * s;
    this.centre.position.set(Math.max(screenW / 2, leftEdge + halfLabel), inset.top + MARGIN * 0.6);

    this.hpFill.width = BAR_WIDTH * Math.max(0, p.hp / p.maxHp);
    this.set(this.hpText, `${p.hp} / ${p.maxHp}`);
    this.xpFill.width = BAR_WIDTH * Math.min(1, p.xp / xpToNext(p.level));
    this.set(this.levelText, `Lv ${p.level}`);
    this.set(this.coinText, String(p.coins));
    this.bankText.x = this.coinText.x + this.coinText.width + 8;
    this.set(this.bankText, p.bank > 0 ? `+${p.bank} banked` : '');
    this.set(this.scoreText, `SCORE ${world.stats.score.toLocaleString('en-US')}`);

    const left = Math.max(0, Math.ceil((world.waveTicks - world.waveTick) / 60));
    this.set(this.waveText, `WAVE ${world.wave} / ${world.waves.length}`);
    this.set(this.timerText, String(left));
    this.timerText.tint = left <= 5 ? 0xff6a4a : 0xffffff;
  }

  private set(target: BitmapText, value: string): void {
    if (this.shown.get(target) === value) return;
    this.shown.set(target, value);
    target.text = value;
  }
}

function bar(tint: number): Sprite {
  const s = new Sprite(Texture.WHITE);
  s.tint = tint;
  return s;
}

function text(size: number): BitmapText {
  return new BitmapText({ text: '', style: { fontFamily: HUD_FONT, fontSize: size } });
}

/** Reads the CSS safe-area insets (notches, home bars) via a hidden probe element. */
class SafeArea {
  private static instance: SafeArea | null = null;
  static shared(): SafeArea {
    return (SafeArea.instance ??= new SafeArea());
  }

  private readonly probe = document.createElement('div');
  private cached = { top: 0, left: 0, right: 0, bottom: 0 };
  private stale = true;

  constructor() {
    this.probe.style.cssText =
      'position:fixed;inset:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(this.probe);
    window.addEventListener('resize', () => (this.stale = true));
  }

  read() {
    if (this.stale) {
      const style = getComputedStyle(this.probe);
      this.cached = {
        top: parseFloat(style.paddingTop) || 0,
        left: parseFloat(style.paddingLeft) || 0,
        right: parseFloat(style.paddingRight) || 0,
        bottom: parseFloat(style.paddingBottom) || 0,
      };
      this.stale = false;
    }
    return this.cached;
  }
}
