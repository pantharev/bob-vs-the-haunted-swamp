import { reviveProgress, type Player, type World } from '@game/sim';
import { BitmapText, Container, Graphics } from 'pixi.js';
import type { Party } from '../coop/party';
import { HUD_FONT } from './art';
import type { Camera } from './camera';

/**
 * Multi-player readability (PLAN.md §9, 5d): a coloured ring under every Bob,
 * name tags with HP over your teammates, a revive ring around anyone who is
 * down, arrows at the screen edge to teammates out of view, and a banner when
 * you're the one down. Nothing here exists in a solo run.
 */

/** Name tag sits this far above a Bob's head (wu). */
const TAG_GAP = 16;
const BAR_WIDTH = 40;
const BAR_HEIGHT = 5;
const REVIVE_RADIUS = 30;
/** Arrows stay this far inside the screen edge (px). */
const ARROW_INSET = 34;
/** A teammate this far inside the edge (px) still counts as on screen. */
const ON_SCREEN_MARGIN = 12;
const DOWN_TINT = 0xff6a4a;

interface Member {
  readonly ring: Graphics;
  readonly tag: Container;
  readonly name: BitmapText;
  readonly hpFill: Graphics;
  readonly revive: Graphics;
  readonly arrow: Container;
  readonly arrowShape: Graphics;
}

export class PartyView {
  /** World space, under the Bobs. */
  readonly ground = new Container();
  /** World space, above the darkness: tags and revive rings stay readable in the fog. */
  readonly overlay = new Container();
  /** Screen space: edge arrows and the downed banner. */
  readonly screen = new Container();
  private members: Member[] = [];
  private party: Party | null = null;
  private time = 0;
  private readonly banner = new Container();
  private readonly bannerTitle = text("YOU'RE DOWN", 26);
  private readonly bannerHint = text('Hold on: a teammate can revive you.', 15);
  private readonly bannerBar = new Graphics();

  constructor() {
    this.bannerTitle.anchor.set(0.5);
    this.bannerTitle.tint = DOWN_TINT;
    this.bannerHint.anchor.set(0.5);
    this.bannerHint.position.y = 30;
    this.bannerBar.position.y = 54;
    this.banner.addChild(this.bannerTitle, this.bannerHint, this.bannerBar);
    this.banner.visible = false;
    this.screen.addChild(this.banner);
  }

  setParty(world: World, party: Party | null): void {
    for (const m of this.members) {
      for (const c of [m.ring, m.tag, m.revive, m.arrow]) c.destroy({ children: true });
    }
    this.members = [];
    this.party = party && world.players.length > 1 ? party : null;
    if (!this.party) return;

    const { names, colors, me } = this.party;
    this.members = world.players.map((p, i) => {
      const color = colors[i] ?? 0xffffff;
      const ring = new Graphics()
        .ellipse(0, 0, p.radius * 1.6, p.radius * 0.62)
        .fill({ color, alpha: i === me ? 0.22 : 0.12 })
        .stroke({ width: i === me ? 3.5 : 2.5, color, alpha: 0.95 });
      this.ground.addChild(ring);

      const tag = new Container();
      const name = text(names[i] ?? `Player ${i + 1}`, 14);
      name.anchor.set(0.5, 1);
      name.tint = color;
      const hpBack = new Graphics()
        .rect(-BAR_WIDTH / 2 - 1, 3, BAR_WIDTH + 2, BAR_HEIGHT + 2)
        .fill({ color: 0x000000, alpha: 0.65 });
      const hpFill = new Graphics().rect(0, 0, BAR_WIDTH, BAR_HEIGHT).fill(color);
      hpFill.position.set(-BAR_WIDTH / 2, 4);
      tag.addChild(name, hpBack, hpFill);
      // Your own HP is on the HUD; tags are for your teammates.
      tag.visible = i !== me;

      const revive = new Graphics();
      const arrow = new Container();
      const arrowShape = new Graphics()
        .poly([21, 0, -12, -15, -6, 0, -12, 15])
        .fill(0xffffff)
        .stroke({ width: 2, color: 0x000000, alpha: 0.7 });
      arrowShape.tint = color;
      const initial = text((names[i] ?? '?').charAt(0).toUpperCase(), 17);
      initial.anchor.set(0.5);
      initial.tint = color;
      initial.position.set(-28, 0);
      initial.label = 'initial';
      arrow.addChild(arrowShape, initial);
      arrow.visible = false;

      this.overlay.addChild(tag, revive);
      this.screen.addChildAt(arrow, 0);
      return { ring, tag, name, hpFill, revive, arrow, arrowShape };
    });
  }

  update(
    world: World,
    alpha: number,
    cam: Camera,
    width: number,
    height: number,
    dt: number,
  ): void {
    const party = this.party;
    this.time += dt;
    const inWave = world.phase === 'wave';
    this.banner.visible = false;
    if (!party) return;

    world.players.forEach((p, i) => {
      const m = this.members[i];
      if (!m) return;
      const x = p.prevX + (p.x - p.prevX) * alpha;
      const y = p.prevY + (p.y - p.prevY) * alpha;

      m.ring.position.set(x, y);
      m.ring.alpha = p.alive ? 1 : 0.45;

      m.tag.position.set(x, y - p.character.spriteHeight - TAG_GAP);
      m.hpFill.scale.x = p.alive ? Math.max(0, p.hp / p.maxHp) : 0;
      m.name.tint = p.alive ? (party.colors[i] ?? 0xffffff) : DOWN_TINT;

      this.drawRevive(m.revive, p, x, y, party.colors[i] ?? 0xffffff, inWave);
      if (i !== party.me) this.placeArrow(m, p, x, y, cam, width, height, inWave);
    });

    const me = world.players[party.me];
    if (me && !me.alive && inWave) this.showBanner(me, width, height);
  }

  /** A ring that fills as a teammate stands on a downed player. */
  private drawRevive(
    g: Graphics,
    p: Player,
    x: number,
    y: number,
    color: number,
    inWave: boolean,
  ): void {
    g.clear();
    g.visible = !p.alive && inWave;
    if (!g.visible) return;
    const cy = y - 14;
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(this.time * 4));
    g.circle(x, cy, REVIVE_RADIUS).stroke({ width: 4, color: 0x000000, alpha: 0.55 });
    g.circle(x, cy, REVIVE_RADIUS).stroke({ width: 2, color: DOWN_TINT, alpha: pulse * 0.6 });
    const done = reviveProgress(p);
    if (done > 0) {
      const start = -Math.PI / 2;
      g.moveTo(x + Math.cos(start) * REVIVE_RADIUS, cy + Math.sin(start) * REVIVE_RADIUS)
        .arc(x, cy, REVIVE_RADIUS, start, start + done * Math.PI * 2)
        .stroke({ width: 5, color, alpha: 1 });
    }
  }

  /** Off screen: an arrow on the edge, pointing at the teammate. Down: it blinks red. */
  private placeArrow(
    m: Member,
    p: Player,
    x: number,
    y: number,
    cam: Camera,
    width: number,
    height: number,
    inWave: boolean,
  ): void {
    const sx = width / 2 + (x - cam.x) * cam.scale;
    const sy = height / 2 + (y - p.character.spriteHeight / 2 - cam.y) * cam.scale;
    const onScreen =
      sx > ON_SCREEN_MARGIN &&
      sx < width - ON_SCREEN_MARGIN &&
      sy > ON_SCREEN_MARGIN &&
      sy < height - ON_SCREEN_MARGIN;
    m.arrow.visible = inWave && !onScreen;
    if (!m.arrow.visible) return;

    // Walk from the centre towards the teammate until the inset edge.
    const dx = sx - width / 2;
    const dy = sy - height / 2;
    const halfW = width / 2 - ARROW_INSET;
    const halfH = height / 2 - ARROW_INSET;
    const t = Math.min(halfW / Math.max(Math.abs(dx), 1e-6), halfH / Math.max(Math.abs(dy), 1e-6));
    m.arrow.position.set(width / 2 + dx * t, height / 2 + dy * t);
    const angle = Math.atan2(dy, dx);
    m.arrowShape.rotation = angle;
    const initial = m.arrow.getChildByLabel('initial');
    initial?.position.set(-Math.cos(angle) * 28, -Math.sin(angle) * 28);
    const down = !p.alive;
    m.arrowShape.tint = down ? DOWN_TINT : m.name.tint;
    m.arrow.alpha = down ? 0.55 + 0.45 * Math.abs(Math.sin(this.time * 5)) : 1;
  }

  private showBanner(me: Player, width: number, height: number): void {
    this.banner.visible = true;
    this.banner.position.set(width / 2, height * 0.68);
    const done = reviveProgress(me);
    const w = 220;
    this.bannerBar.clear();
    this.bannerBar.rect(-w / 2 - 2, -2, w + 4, 12).fill({ color: 0x000000, alpha: 0.6 });
    if (done > 0) this.bannerBar.rect(-w / 2, 0, w * done, 8).fill(0x7be36a);
    this.bannerHint.text = done > 0 ? 'Reviving...' : 'Hold on: a teammate can revive you.';
  }
}

function text(value: string, size: number): BitmapText {
  return new BitmapText({ text: value, style: { fontFamily: HUD_FONT, fontSize: size } });
}
