"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Lil' Mikey's Wine Adventure — a self-contained, client-side endless-runner.
//
// Intentionally OFF-BRAND: this is a fun break, not a graded mode, so it breaks the
// "Cellar" design language (bright gradients, cartoon styling). It is fully client-side:
// no server calls, no auth-gated data, no persistence of any kind. Everything is drawn
// to a single <canvas> with requestAnimationFrame and vector shapes/gradients — no image
// assets, no network. The RAF loop + key listeners are torn down on unmount (pause/reset).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MikeyMusicPlayer } from "./MikeyMusicPlayer";

// ── World constants (logical canvas units; the element is scaled responsively) ──
const W = 900;
const H = 460;
const GROUND_Y = 372;

// Environment cycle: a long VINEYARD stretch, then a short WINERY interlude (~10%).
const VINEYARD_LEN = 8200;
const WINERY_LEN = 900;
const PERIOD = VINEYARD_LEN + WINERY_LEN;

// Jump physics (px, seconds). Sized from intent, not magic numbers: peak height
// must clear the tallest obstacle (86px) with margin, AND hold Mikey above that
// height longer than the widest obstacle (tractor, 120px of overlap) takes to pass
// under him at the SLOWEST scroll speed (250px/s → 0.48s). The old 760/2600 arc
// peaked at 111px and only held the clear-window for 0.31s, so the tall+wide
// obstacles were literally unclearable at the easy early speed. 840/2100 peaks at
// 168px with a 0.58s clear-window — every obstacle is now threadable at every speed.
const VJUMP = 840;
const GRAV = 2100;
const AIRTIME = (2 * VJUMP) / GRAV; // 0.80 s
// Forgiveness: release the jump key while rising to cut the arc short (tap = small
// hop, hold = full arc); a jump pressed just before landing is remembered and fires
// on touchdown so a slightly-early press isn't swallowed.
const JUMP_CUT = 0.45;
const JUMP_BUFFER = 0.12; // s

// Parker Points accrue with time survived (≈ distance). ~80s to reach the 100 cap.
const SCORE_RATE = 1.25;

// Lives. Start with three; a hit costs one (with brief invulnerability so a single
// obstacle can't drain several). One — and only one — wine bottle floats in around
// 50 Parker Points; "chugging" it (running into it) grants an extra life.
const START_LIVES = 3;
const HIT_INVULN = 1.2; // s of blink-and-can't-be-hit after losing a life
const BOTTLE_SCORE = 50; // Parker Points at which the single bottle appears
const BOTTLE_Y = GROUND_Y - 46; // float height (torso level — grab it by running through)

type Env = "vineyard" | "winery";

interface Obstacle {
  worldX: number;
  env: Env;
  kind: string;
  mode: "jump" | "duck";
  w: number;
  h: number;
  hangBottom: number;
}

interface Game {
  score: number;
  worldX: number;
  mikeyX: number;
  yOff: number;
  vy: number;
  onGround: boolean;
  buffer: number; // remaining seconds a buffered (too-early) jump press stays live
  ducking: boolean;
  runPhase: number;
  obstacles: Obstacle[];
  nextSpawnX: number;
  lives: number;
  invuln: number; // i-frames after a hit (s) — Mikey can't be hit & blinks
  bottle: { worldX: number } | null; // the single life-giving wine bottle in the world
  bottleDone: boolean; // the one bottle has already spawned (it never respawns)
  lastInt: number;
  lastLives: number;
  lastZone: Env;
  dead: boolean;
  won: boolean;
  last: number;
  raf: number;
}

interface Keys {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

// ── Difficulty curve ──────────────────────────────────────────────────────────
// Gentle up to 90 Parker Points, then logarithmically brutal from 90 → 100. The
// scroll speed climbs and the gaps between obstacles shrink toward the very limit
// of what a perfect jump can thread — the final stretch is near-impossible.
function worldSpeed(s: number): number {
  if (s <= 90) return 250 + (s / 90) * 170; // 250 → 420 px/s
  const t = (s - 90) / 10;
  return 420 + Math.sqrt(t) * 360; // → ~780 px/s
}
function spawnGapSec(s: number): number {
  if (s <= 90) return lerp(1.55, 0.95, s / 90);
  const t = (s - 90) / 10;
  return lerp(0.95, 0.6, Math.sqrt(t));
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function envAt(pos: number): Env {
  const m = ((pos % PERIOD) + PERIOD) % PERIOD;
  return m < VINEYARD_LEN ? "vineyard" : "winery";
}
function nextBoundary(pos: number): number {
  const m = ((pos % PERIOD) + PERIOD) % PERIOD;
  const d = m < VINEYARD_LEN ? VINEYARD_LEN - m : PERIOD - m;
  return pos + d;
}

// ── Obstacle catalogue ──────────────────────────────────────────────────────────
const SHAPES: Record<string, { mode: "jump" | "duck"; w: number; h: number; hangBottom: number }> = {
  vine:    { mode: "jump", w: 46,  h: 64,  hangBottom: 0 },
  tractor: { mode: "jump", w: 104, h: 86,  hangBottom: 0 },
  farmer:  { mode: "jump", w: 50,  h: 82,  hangBottom: 0 },
  dog:     { mode: "jump", w: 76,  h: 44,  hangBottom: 0 },
  trellis: { mode: "duck", w: 110, h: 0,   hangBottom: GROUND_Y - 48 },
  barrel:  { mode: "jump", w: 66,  h: 60,  hangBottom: 0 },
  tank:    { mode: "jump", w: 76,  h: 86,  hangBottom: 0 },
  pipe:    { mode: "duck", w: 124, h: 0,   hangBottom: GROUND_Y - 48 },
};
const WEIGHTS: Record<Env, [string, number][]> = {
  vineyard: [["vine", 30], ["dog", 22], ["farmer", 16], ["tractor", 13], ["trellis", 19]],
  winery: [["barrel", 40], ["tank", 26], ["pipe", 26]],
};
function pickKind(env: Env): string {
  const table = WEIGHTS[env];
  const total = table.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [kind, w] of table) {
    if ((r -= w) <= 0) return kind;
  }
  return table[0][0];
}

// ── Collision (AABB with a little forgiveness) ──────────────────────────────────
function collide(g: Game): boolean {
  const mLeft = g.mikeyX - 13;
  const mRight = g.mikeyX + 13;
  const mH = g.ducking ? 42 : 78;
  const feetY = GROUND_Y - g.yOff;
  const mTop = feetY - mH + 4;
  const mBot = feetY - 2;
  for (const o of g.obstacles) {
    const sx = o.worldX - g.worldX;
    if (sx > mRight + 10 || sx + o.w < mLeft - 10) continue;
    const oL = sx + 5;
    const oR = sx + o.w - 5;
    let oTop: number;
    let oBot: number;
    if (o.mode === "jump") {
      oTop = GROUND_Y - o.h + 5;
      oBot = GROUND_Y;
    } else {
      oTop = GROUND_Y - 160;
      oBot = o.hangBottom;
    }
    if (mRight > oL && mLeft < oR && mBot > oTop && mTop < oBot) return true;
  }
  return false;
}

// ════════════════════════════════════════════════════════════════════════════
//  DRAWING — cartoon-realistic vector shapes with soft gradient shading & shadows.
// ════════════════════════════════════════════════════════════════════════════
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
function softShadow(ctx: CanvasRenderingContext2D, cx: number, w: number, alpha = 0.22) {
  ctx.save();
  ctx.fillStyle = `rgba(20,10,30,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, GROUND_Y + 7, w, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHillLayer(ctx: CanvasRenderingContext2D, baseY: number, amp: number, color: string, off: number, wl: number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 12) {
    const y = baseY + Math.sin((x + off) / wl) * amp + Math.cos((x + off) / (wl * 0.43)) * amp * 0.4;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

function drawChateau(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // small French chateau in the distance: beige body + two conical-roof towers
  ctx.save();
  const wall = ctx.createLinearGradient(x, y - 46 * s, x, y);
  wall.addColorStop(0, "#efe4cf");
  wall.addColorStop(1, "#cdbfa3");
  ctx.fillStyle = wall;
  rr(ctx, x, y - 40 * s, 70 * s, 40 * s, 3);
  ctx.fill();
  // main roof
  ctx.fillStyle = "#6b5b7a";
  ctx.beginPath();
  ctx.moveTo(x - 3 * s, y - 40 * s);
  ctx.lineTo(x + 35 * s, y - 58 * s);
  ctx.lineTo(x + 73 * s, y - 40 * s);
  ctx.closePath();
  ctx.fill();
  // towers
  for (const tx of [x + 2 * s, x + 56 * s]) {
    ctx.fillStyle = wall;
    rr(ctx, tx, y - 56 * s, 14 * s, 56 * s, 2);
    ctx.fill();
    ctx.fillStyle = "#5b4d6b";
    ctx.beginPath();
    ctx.moveTo(tx - 2 * s, y - 56 * s);
    ctx.lineTo(tx + 7 * s, y - 76 * s);
    ctx.lineTo(tx + 16 * s, y - 56 * s);
    ctx.closePath();
    ctx.fill();
  }
  // windows
  ctx.fillStyle = "rgba(80,60,40,0.55)";
  for (let i = 0; i < 3; i++) {
    rr(ctx, x + (16 + i * 16) * s, y - 28 * s, 7 * s, 12 * s, 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawVineyard(ctx: CanvasRenderingContext2D, worldX: number) {
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, "#74c4ee");
  sky.addColorStop(0.55, "#bfe4f3");
  sky.addColorStop(1, "#edf4da");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND_Y);
  // sun
  const sun = ctx.createRadialGradient(W - 130, 78, 6, W - 130, 78, 60);
  sun.addColorStop(0, "rgba(255,247,214,0.95)");
  sun.addColorStop(1, "rgba(255,247,214,0)");
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(W - 130, 78, 60, 0, Math.PI * 2);
  ctx.fill();
  // rolling hills (parallax layers)
  drawHillLayer(ctx, 250, 26, "#9fcf86", -worldX * 0.12, 230);
  drawHillLayer(ctx, 286, 30, "#7dbd6b", -worldX * 0.2, 180);
  // distant chateau, repeating
  const gap = 2600;
  const startK = Math.floor((worldX * 0.28 - 200) / gap);
  for (let k = startK; k <= startK + 2; k++) {
    const cx = k * gap - worldX * 0.28;
    if (cx > -120 && cx < W + 60) drawChateau(ctx, cx, 268, 1);
  }
  drawHillLayer(ctx, 318, 22, "#5fa957", -worldX * 0.34, 150);
  // ground: grass band
  const grass = ctx.createLinearGradient(0, GROUND_Y - 20, 0, H);
  grass.addColorStop(0, "#6fae54");
  grass.addColorStop(1, "#4d8a3d");
  ctx.fillStyle = grass;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  // curving rows of vines (midground parallax)
  const vp = worldX * 0.6;
  for (let i = -1; i < W / 64 + 2; i++) {
    const bx = i * 64 - (vp % 64);
    const by = GROUND_Y - 8 + Math.sin((bx + worldX * 0.6) / 120) * 5;
    // vine post
    ctx.fillStyle = "#6b4a2e";
    rr(ctx, bx - 2, by - 30, 4, 30, 2);
    ctx.fill();
    // foliage
    const fol = ctx.createRadialGradient(bx, by - 30, 2, bx, by - 30, 16);
    fol.addColorStop(0, "#5a9e3f");
    fol.addColorStop(1, "#39722a");
    ctx.fillStyle = fol;
    ctx.beginPath();
    ctx.ellipse(bx, by - 30, 15, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    // a little grape cluster
    ctx.fillStyle = "#6d3f86";
    for (let gx = 0; gx < 3; gx++) {
      ctx.beginPath();
      ctx.arc(bx - 3 + gx * 3, by - 18, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // dirt running strip
  const dirt = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 16);
  dirt.addColorStop(0, "#a9824f");
  dirt.addColorStop(1, "#8a6638");
  ctx.fillStyle = dirt;
  ctx.fillRect(0, GROUND_Y, W, 14);
}

function drawWinery(ctx: CanvasRenderingContext2D, worldX: number) {
  // warm stone wall
  const wall = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  wall.addColorStop(0, "#7a5c45");
  wall.addColorStop(1, "#4f3a2c");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, GROUND_Y);
  // stone courses
  ctx.strokeStyle = "rgba(40,26,16,0.35)";
  ctx.lineWidth = 2;
  const so = worldX * 0.25;
  for (let y = 36; y < GROUND_Y; y += 42) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    for (let x = -((so + (y % 84 ? 42 : 0)) % 84); x < W; x += 84) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 42);
      ctx.stroke();
    }
  }
  // gleaming steel tanks in the background
  const tp = worldX * 0.4;
  for (let i = -1; i < W / 150 + 2; i++) {
    const cx = i * 150 - (tp % 150) + 60;
    const grad = ctx.createLinearGradient(cx - 34, 0, cx + 34, 0);
    grad.addColorStop(0, "#9aa3ad");
    grad.addColorStop(0.4, "#eef2f6");
    grad.addColorStop(0.55, "#cdd5dd");
    grad.addColorStop(1, "#7c858f");
    ctx.fillStyle = grad;
    rr(ctx, cx - 34, 120, 68, GROUND_Y - 120, 14);
    ctx.fill();
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - 30, 120);
    ctx.lineTo(cx, 96);
    ctx.lineTo(cx + 30, 120);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 16, 140);
    ctx.lineTo(cx - 16, GROUND_Y - 20);
    ctx.stroke();
  }
  // stone floor
  const floor = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  floor.addColorStop(0, "#6a5036");
  floor.addColorStop(1, "#43321f");
  ctx.fillStyle = floor;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.fillStyle = "rgba(20,12,6,0.3)";
  ctx.fillRect(0, GROUND_Y, W, 5);
}

function drawDoorway(ctx: CanvasRenderingContext2D, sx: number, intoWinery: boolean) {
  // a stone threshold/arch the runner passes through at the environment boundary
  ctx.save();
  const w = 64;
  const x = sx - w / 2;
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, "#6b513c");
  grad.addColorStop(0.5, "#8a6a4d");
  grad.addColorStop(1, "#5a4231");
  ctx.fillStyle = grad;
  // posts
  rr(ctx, x - 12, 150, 20, GROUND_Y - 150, 4);
  ctx.fill();
  rr(ctx, x + w - 8, 150, 20, GROUND_Y - 150, 4);
  ctx.fill();
  // arch
  ctx.beginPath();
  ctx.moveTo(x - 12, 150);
  ctx.quadraticCurveTo(sx, 104, x + w + 12, 150);
  ctx.lineTo(x + w + 12, 174);
  ctx.quadraticCurveTo(sx, 132, x - 12, 174);
  ctx.closePath();
  ctx.fill();
  // glow of the next room
  const glow = ctx.createLinearGradient(0, 150, 0, GROUND_Y);
  if (intoWinery) {
    glow.addColorStop(0, "rgba(120,80,40,0.4)");
    glow.addColorStop(1, "rgba(60,40,24,0.55)");
  } else {
    glow.addColorStop(0, "rgba(180,220,255,0.35)");
    glow.addColorStop(1, "rgba(200,235,180,0.3)");
  }
  ctx.fillStyle = glow;
  rr(ctx, x + 8, 150, w - 16, GROUND_Y - 150, 4);
  ctx.fill();
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, worldX: number) {
  const leftEnv = envAt(worldX);
  const rightEnv = envAt(worldX + W);
  const paint = (env: Env, x0: number, x1: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, x1 - x0, H);
    ctx.clip();
    if (env === "vineyard") drawVineyard(ctx, worldX);
    else drawWinery(ctx, worldX);
    ctx.restore();
  };
  if (leftEnv === rightEnv) {
    paint(leftEnv, 0, W);
  } else {
    const sx = nextBoundary(worldX) - worldX;
    paint(leftEnv, 0, sx);
    paint(rightEnv, sx, W);
    drawDoorway(ctx, sx, leftEnv === "vineyard");
  }
}

// ── Obstacle drawers ────────────────────────────────────────────────────────────
function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle, sx: number, worldX: number) {
  switch (o.kind) {
    case "vine": return drawVineObstacle(ctx, sx, o);
    case "tractor": return drawTractor(ctx, sx, o);
    case "farmer": return drawFarmer(ctx, sx, o);
    case "dog": return drawDog(ctx, sx, o, worldX);
    case "trellis": return drawTrellis(ctx, sx, o);
    case "barrel": return drawBarrel(ctx, sx, o, worldX);
    case "tank": return drawTank(ctx, sx, o);
    case "pipe": return drawPipe(ctx, sx, o);
  }
}

function drawVineObstacle(ctx: CanvasRenderingContext2D, sx: number, o: Obstacle) {
  const cx = sx + o.w / 2;
  softShadow(ctx, cx, o.w * 0.5);
  ctx.fillStyle = "#6b4a2e";
  rr(ctx, cx - 4, GROUND_Y - o.h, 8, o.h, 3);
  ctx.fill();
  const fol = ctx.createRadialGradient(cx, GROUND_Y - o.h + 14, 4, cx, GROUND_Y - o.h + 14, 28);
  fol.addColorStop(0, "#6cb04a");
  fol.addColorStop(1, "#3c7a2b");
  ctx.fillStyle = fol;
  ctx.beginPath();
  ctx.ellipse(cx, GROUND_Y - o.h + 16, 26, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  // grape clusters
  ctx.fillStyle = "#6d3f86";
  for (let r = 0; r < 6; r++) {
    const gx = cx - 8 + (r % 3) * 8;
    const gy = GROUND_Y - o.h + 28 + Math.floor(r / 3) * 7;
    ctx.beginPath();
    ctx.arc(gx, gy, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const hl = ctx.createRadialGradient(cx - 6, GROUND_Y - o.h + 30, 1, cx - 6, GROUND_Y - o.h + 30, 4);
  hl.addColorStop(0, "rgba(200,160,230,0.8)");
  hl.addColorStop(1, "rgba(200,160,230,0)");
  ctx.fillStyle = hl;
  ctx.beginPath();
  ctx.arc(cx - 6, GROUND_Y - o.h + 30, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawTractor(ctx: CanvasRenderingContext2D, sx: number, o: Obstacle) {
  const top = GROUND_Y - o.h;
  softShadow(ctx, sx + o.w / 2, o.w * 0.5);
  // body
  const body = ctx.createLinearGradient(0, top, 0, GROUND_Y);
  body.addColorStop(0, "#4caa3f");
  body.addColorStop(1, "#2f7a2a");
  ctx.fillStyle = body;
  rr(ctx, sx + 8, top + 26, o.w - 16, o.h - 44, 8);
  ctx.fill();
  // cabin
  rr(ctx, sx + o.w - 46, top, 36, 36, 6);
  ctx.fillStyle = "#3f9437";
  ctx.fill();
  ctx.fillStyle = "rgba(190,230,255,0.7)";
  rr(ctx, sx + o.w - 40, top + 5, 24, 18, 3);
  ctx.fill();
  // exhaust
  ctx.fillStyle = "#555";
  rr(ctx, sx + 16, top - 12, 6, 16, 2);
  ctx.fill();
  // wheels
  const wheel = (wx: number, r: number) => {
    ctx.fillStyle = "#1c1c1c";
    ctx.beginPath();
    ctx.arc(wx, GROUND_Y - r, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4c542";
    ctx.beginPath();
    ctx.arc(wx, GROUND_Y - r, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  };
  wheel(sx + o.w - 26, 22);
  wheel(sx + 24, 13);
}

function drawFarmer(ctx: CanvasRenderingContext2D, sx: number, o: Obstacle) {
  const cx = sx + o.w / 2;
  const top = GROUND_Y - o.h;
  softShadow(ctx, cx, o.w * 0.5);
  // legs
  ctx.strokeStyle = "#3a5a8a";
  ctx.lineCap = "round";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(cx - 7, GROUND_Y - 26);
  ctx.lineTo(cx - 8, GROUND_Y - 2);
  ctx.moveTo(cx + 7, GROUND_Y - 26);
  ctx.lineTo(cx + 8, GROUND_Y - 2);
  ctx.stroke();
  // body (overalls)
  const ov = ctx.createLinearGradient(cx - 14, 0, cx + 14, 0);
  ov.addColorStop(0, "#2f5fa0");
  ov.addColorStop(1, "#23477a");
  ctx.fillStyle = ov;
  rr(ctx, cx - 14, top + 28, 28, o.h - 50, 8);
  ctx.fill();
  // arms
  ctx.strokeStyle = "#e9ddc9";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(cx - 12, top + 34);
  ctx.lineTo(cx - 20, top + 54);
  ctx.moveTo(cx + 12, top + 34);
  ctx.lineTo(cx + 20, top + 54);
  ctx.stroke();
  // head
  const head = ctx.createRadialGradient(cx - 3, top + 14, 2, cx, top + 16, 14);
  head.addColorStop(0, "#ffe7c9");
  head.addColorStop(1, "#e3b78c");
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.arc(cx, top + 16, 13, 0, Math.PI * 2);
  ctx.fill();
  // straw hat
  ctx.fillStyle = "#d8b25a";
  rr(ctx, cx - 18, top + 6, 36, 5, 2);
  ctx.fill();
  rr(ctx, cx - 9, top - 4, 18, 12, 4);
  ctx.fill();
}

function drawDog(ctx: CanvasRenderingContext2D, sx: number, o: Obstacle, worldX: number) {
  const cx = sx + o.w / 2;
  softShadow(ctx, cx, o.w * 0.5);
  const body = ctx.createLinearGradient(0, GROUND_Y - o.h, 0, GROUND_Y);
  body.addColorStop(0, "#b9844f");
  body.addColorStop(1, "#8c5e32");
  ctx.fillStyle = body;
  rr(ctx, sx + 8, GROUND_Y - 26, o.w - 22, 18, 9);
  ctx.fill();
  // head
  ctx.beginPath();
  ctx.ellipse(sx + o.w - 14, GROUND_Y - 28, 12, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // ear
  ctx.fillStyle = "#6e4626";
  ctx.beginPath();
  ctx.ellipse(sx + o.w - 20, GROUND_Y - 34, 5, 8, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // snout + eye
  ctx.fillStyle = "#2a1a0e";
  ctx.beginPath();
  ctx.arc(sx + o.w - 3, GROUND_Y - 28, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx + o.w - 12, GROUND_Y - 31, 1.8, 0, Math.PI * 2);
  ctx.fill();
  // tail
  ctx.strokeStyle = "#8c5e32";
  ctx.lineCap = "round";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(sx + 8, GROUND_Y - 24);
  ctx.lineTo(sx - 2, GROUND_Y - 34);
  ctx.stroke();
  // legs (trotting)
  const p = worldX * 0.05;
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#a0733f";
  for (let i = 0; i < 4; i++) {
    const lx = sx + 14 + i * 14;
    const sw = Math.sin(p + i) * 4;
    ctx.beginPath();
    ctx.moveTo(lx, GROUND_Y - 10);
    ctx.lineTo(lx + sw, GROUND_Y - 1);
    ctx.stroke();
  }
}

function drawTrellis(ctx: CanvasRenderingContext2D, sx: number, o: Obstacle) {
  // an overhead arbor of vines you must DUCK under
  const top = 150;
  ctx.fillStyle = "#6b4a2e";
  rr(ctx, sx - 8, top, 14, o.hangBottom - top, 3);
  ctx.fill();
  rr(ctx, sx + o.w - 6, top, 14, o.hangBottom - top, 3);
  ctx.fill();
  const beam = ctx.createLinearGradient(0, o.hangBottom - 16, 0, o.hangBottom);
  beam.addColorStop(0, "#7a5634");
  beam.addColorStop(1, "#553a22");
  ctx.fillStyle = beam;
  rr(ctx, sx - 10, o.hangBottom - 18, o.w + 24, 18, 5);
  ctx.fill();
  // hanging foliage + grapes
  for (let i = 0; i <= o.w; i += 18) {
    const lx = sx + i;
    const fol = ctx.createRadialGradient(lx, o.hangBottom, 2, lx, o.hangBottom, 14);
    fol.addColorStop(0, "#5fa33f");
    fol.addColorStop(1, "#357027");
    ctx.fillStyle = fol;
    ctx.beginPath();
    ctx.ellipse(lx, o.hangBottom, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6d3f86";
    ctx.beginPath();
    ctx.arc(lx, o.hangBottom + 8, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBarrel(ctx: CanvasRenderingContext2D, sx: number, o: Obstacle, worldX: number) {
  const cx = sx + o.w / 2;
  const cy = GROUND_Y - o.h / 2;
  const r = o.h / 2;
  softShadow(ctx, cx, o.w * 0.5);
  const body = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  body.addColorStop(0, "#b9712f");
  body.addColorStop(0.5, "#8a4d1c");
  body.addColorStop(1, "#5f3413");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // hoops (rotate with travel)
  const rot = -worldX * 0.03;
  ctx.strokeStyle = "#3a2412";
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const a = rot + (i * Math.PI) / 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r - 2, (r - 2) * 0.5, a, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = "#c9c9c9";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
  ctx.stroke();
}

function drawTank(ctx: CanvasRenderingContext2D, sx: number, o: Obstacle) {
  const top = GROUND_Y - o.h;
  softShadow(ctx, sx + o.w / 2, o.w * 0.5);
  const grad = ctx.createLinearGradient(sx, 0, sx + o.w, 0);
  grad.addColorStop(0, "#8b949e");
  grad.addColorStop(0.4, "#f1f5f9");
  grad.addColorStop(0.55, "#cdd5dd");
  grad.addColorStop(1, "#6e767f");
  ctx.fillStyle = grad;
  rr(ctx, sx + 6, top + 14, o.w - 12, o.h - 14, 12);
  ctx.fill();
  // conical top
  ctx.beginPath();
  ctx.moveTo(sx + 10, top + 16);
  ctx.lineTo(sx + o.w / 2, top);
  ctx.lineTo(sx + o.w - 10, top + 16);
  ctx.closePath();
  ctx.fill();
  // gauge + valve
  ctx.fillStyle = "#c0392b";
  ctx.beginPath();
  ctx.arc(sx + o.w / 2, GROUND_Y - 18, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx + 18, top + 24);
  ctx.lineTo(sx + 18, GROUND_Y - 8);
  ctx.stroke();
}

function drawPipe(ctx: CanvasRenderingContext2D, sx: number, o: Obstacle) {
  // overhead gantry/pipe to DUCK under
  const top = 150;
  ctx.fillStyle = "#4b5560";
  rr(ctx, sx - 4, top, 12, o.hangBottom - top, 3);
  ctx.fill();
  rr(ctx, sx + o.w - 8, top, 12, o.hangBottom - top, 3);
  ctx.fill();
  const pipe = ctx.createLinearGradient(0, o.hangBottom - 22, 0, o.hangBottom);
  pipe.addColorStop(0, "#cfd6dd");
  pipe.addColorStop(0.5, "#9aa3ad");
  pipe.addColorStop(1, "#646c75");
  ctx.fillStyle = pipe;
  rr(ctx, sx - 8, o.hangBottom - 22, o.w + 20, 22, 8);
  ctx.fill();
  // valve wheel
  ctx.strokeStyle = "#c0392b";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(sx + o.w / 2, o.hangBottom - 11, 9, 0, Math.PI * 2);
  ctx.stroke();
}

// ── Mikey ───────────────────────────────────────────────────────────────────────
function limb(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
  w: number, color: string,
) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.stroke();
}

function drawMikey(ctx: CanvasRenderingContext2D, x: number, yOff: number, ducking: boolean, phase: number) {
  const feetY = GROUND_Y - yOff;
  const inAir = yOff > 3;
  // drop shadow (shrinks as he rises)
  ctx.save();
  ctx.fillStyle = `rgba(20,10,30,${Math.max(0.06, 0.3 - yOff / 320)})`;
  ctx.beginPath();
  ctx.ellipse(x, GROUND_Y + 7, Math.max(12, 30 - yOff * 0.06), 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const bob = inAir ? 0 : Math.sin(phase * 2) * 1.6;
  const torsoH = ducking ? 20 : 30;
  const legLen = ducking ? 12 : 26;
  const hipY = feetY - legLen;
  const shoulderY = hipY - torsoH + bob;
  const headR = ducking ? 12 : 13;
  const lean = ducking ? 8 : 2;
  const headCX = x + lean;
  const headCY = shoulderY - headR - 2 + bob;

  const skin = "#f4ece8";
  const skinHi = "#ffffff";
  const skinSh = "#d8cbc4";
  const shirt = "#6d28a8";
  const shirtD = "#4a1c74";
  const pants = "#3a2a55";
  const pantsD = "#281c3c";
  const mohA = "#a855f7";
  const mohB = "#7c3aed";

  // running cycle offsets
  const sw = inAir ? 4 : 16;
  const o1 = Math.sin(phase) * sw;
  const o2 = Math.sin(phase + Math.PI) * sw;
  const kneeY = (hipY + feetY) / 2 - (inAir ? 12 : 2);
  const aSw = inAir ? 9 : 14;
  const a1 = Math.sin(phase + Math.PI) * aSw;
  const a2 = Math.sin(phase) * aSw;
  const shY = shoulderY + 6;

  // back leg + back arm (behind torso)
  limb(ctx, x, hipY, x + o2 * 0.4, kneeY, x + o2, feetY - (inAir ? 8 : 0), 11, pantsD);
  ctx.fillStyle = "#241a14";
  ctx.beginPath();
  ctx.ellipse(x + o2 + 3, feetY - (inAir ? 8 : 1), 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  limb(ctx, headCX - 9, shY, headCX - 9 + a2 * 0.5, shY + 14, headCX - 9 + a2, shY + 24, 8, skinSh);

  // torso (tank top) with shading
  const torsoGrad = ctx.createLinearGradient(x - 14, 0, x + 14, 0);
  torsoGrad.addColorStop(0, shirt);
  torsoGrad.addColorStop(1, shirtD);
  ctx.fillStyle = torsoGrad;
  rr(ctx, x - 14, shoulderY, 28, hipY - shoulderY + 8, 12);
  ctx.fill();
  // a little grape badge
  ctx.fillStyle = "#c084fc";
  ctx.beginPath();
  ctx.arc(x + 5, shoulderY + 13, 3, 0, Math.PI * 2);
  ctx.fill();

  // front leg
  limb(ctx, x, hipY, x + o1 * 0.4, kneeY, x + o1, feetY - (inAir ? 2 : 0), 11, pants);
  ctx.fillStyle = "#2c2018";
  ctx.beginPath();
  ctx.ellipse(x + o1 + 3, feetY - (inAir ? 2 : 0) - 1, 8, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // front arm (skin) with hand
  limb(ctx, headCX + 9, shY, headCX + 9 + a1 * 0.5, shY + 14, headCX + 9 + a1, shY + 24, 8, skin);
  ctx.fillStyle = skinHi;
  ctx.beginPath();
  ctx.arc(headCX + 9 + a1, shY + 25, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // head
  const headGrad = ctx.createRadialGradient(headCX - 4, headCY - 4, 2, headCX, headCY, headR + 3);
  headGrad.addColorStop(0, skinHi);
  headGrad.addColorStop(0.7, skin);
  headGrad.addColorStop(1, skinSh);
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
  ctx.fill();
  // ear
  ctx.beginPath();
  ctx.arc(headCX - headR + 2, headCY + 1, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // face — eyes + big grin
  ctx.fillStyle = "#241018";
  ctx.beginPath();
  ctx.arc(headCX + 3, headCY - 2, 2, 0, Math.PI * 2);
  ctx.arc(headCX + 9, headCY - 2, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#7a2e3a";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(headCX + 5, headCY + 3, 5, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  // rosy cheek
  ctx.fillStyle = "rgba(230,120,140,0.4)";
  ctx.beginPath();
  ctx.arc(headCX + 9, headCY + 4, 3, 0, Math.PI * 2);
  ctx.fill();

  // chunky spiky PURPLE MOHAWK along the crest
  const baseY = headCY - headR + 4;
  const mGrad = ctx.createLinearGradient(0, baseY - 18, 0, baseY);
  mGrad.addColorStop(0, mohA);
  mGrad.addColorStop(1, mohB);
  ctx.fillStyle = mGrad;
  ctx.strokeStyle = "#5b21b6";
  ctx.lineWidth = 1.5;
  const spikes = 5;
  for (let i = 0; i < spikes; i++) {
    const t = i / (spikes - 1);
    const sxk = headCX - 8 + t * 16;
    const hgt = 16 - Math.abs(t - 0.5) * 10;
    ctx.beginPath();
    ctx.moveTo(sxk - 4.5, baseY + 2);
    ctx.lineTo(sxk - 1, baseY - hgt);
    ctx.lineTo(sxk + 4.5, baseY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

// The single life-giving wine bottle — a glowing collectible, deliberately inviting.
function drawBottle(ctx: CanvasRenderingContext2D, sx: number, phase: number) {
  const y = BOTTLE_Y;
  const bob = Math.sin(phase * 1.6) * 4;
  const cy = y + bob;
  // attract glow
  const halo = ctx.createRadialGradient(sx, cy, 2, sx, cy, 34);
  halo.addColorStop(0, "rgba(255,215,120,0.55)");
  halo.addColorStop(1, "rgba(255,215,120,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(sx, cy, 34, 0, Math.PI * 2);
  ctx.fill();
  // bottle body
  ctx.save();
  ctx.translate(sx, cy);
  ctx.fillStyle = "#2f5d34";
  rr(ctx, -9, -10, 18, 34, 6); // body
  ctx.fill();
  ctx.fillStyle = "#2a5230";
  ctx.fillRect(-4, -26, 8, 18); // neck
  ctx.fillStyle = "#7a1f2b";
  ctx.fillRect(-4, -28, 8, 5); // capsule
  // label
  ctx.fillStyle = "#f4e9c9";
  ctx.fillRect(-8, 2, 16, 13);
  ctx.fillStyle = "#7a1f2b";
  ctx.fillRect(-8, 6, 16, 2);
  // highlight
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(-7, -8, 3, 28);
  ctx.restore();
}

function drawScene(ctx: CanvasRenderingContext2D, g: Game) {
  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, g.worldX);
  for (const o of g.obstacles) drawObstacle(ctx, o, o.worldX - g.worldX, g.worldX);
  if (g.bottle) drawBottle(ctx, g.bottle.worldX - g.worldX, g.runPhase);
  // blink Mikey while invulnerable (after a hit): hide on alternating ~0.1s beats.
  const blinking = g.invuln > 0 && Math.floor(g.invuln * 10) % 2 === 0;
  if (!blinking) drawMikey(ctx, g.mikeyX, g.yOff, g.ducking, g.runPhase);
}

// ════════════════════════════════════════════════════════════════════════════
//  COMPONENT
// ════════════════════════════════════════════════════════════════════════════
type Phase = "ready" | "playing" | "over";

function freshGame(): Game {
  return {
    score: 0, worldX: 0, mikeyX: 180, yOff: 0, vy: 0, onGround: true, buffer: 0,
    ducking: false, runPhase: 0, obstacles: [], nextSpawnX: W + 520,
    lives: START_LIVES, invuln: 0, bottle: null, bottleDone: false,
    lastInt: -1, lastLives: START_LIVES, lastZone: "vineyard",
    dead: false, won: false, last: 0, raf: 0,
  };
}

export default function MikeyPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game>(freshGame());
  const keysRef = useRef<Keys>({ up: false, down: false, left: false, right: false });
  const dprRef = useRef(1);

  const [phase, setPhase] = useState<Phase>("ready");
  const [musicOn, setMusicOn] = useState(false);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(START_LIVES);
  const [zone, setZone] = useState<Env>("vineyard");
  const [won, setWon] = useState(false);

  const getCtx = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return null;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
    return ctx;
  }, []);

  const drawPreview = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const g = freshGame();
    g.worldX = 400;
    drawScene(ctx, g);
  }, [getCtx]);

  // Size the canvas once (crisp on retina) and paint the idle preview.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    dprRef.current = dpr;
    c.width = W * dpr;
    c.height = H * dpr;
    drawPreview();
  }, [drawPreview]);

  const startGame = useCallback(() => {
    gameRef.current = freshGame();
    keysRef.current = { up: false, down: false, left: false, right: false };
    setScore(0);
    setLives(START_LIVES);
    setZone("vineyard");
    setWon(false);
    setMusicOn(true); // kick off the soundtrack (unmuted) on this start gesture
    setPhase("playing");
  }, []);

  const doJump = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.dead || g.ducking) return;
    if (g.onGround) {
      g.vy = VJUMP;
      g.onGround = false;
      g.yOff = 0.01;
      g.buffer = 0;
    } else {
      g.buffer = JUMP_BUFFER; // airborne — remember it and fire on landing
    }
  }, []);

  // The game loop + input listeners live for the duration of "playing"; the cleanup
  // cancels the RAF and removes listeners on game-over AND on unmount (pause/reset).
  useEffect(() => {
    if (phase !== "playing") {
      if (phase === "ready") drawPreview();
      return;
    }
    const ctx = getCtx();
    if (!ctx) return;

    const finish = (win: boolean) => {
      const g = gameRef.current;
      g.dead = true;
      g.won = win;
      setScore(win ? 100 : Math.floor(g.score));
      setWon(win);
      setPhase("over");
    };

    const update = (g: Game, dt: number) => {
      const keys = keysRef.current;
      g.score = Math.min(100, g.score + SCORE_RATE * dt);
      const spd = worldSpeed(g.score);
      g.worldX += spd * dt;
      g.runPhase += dt * (6 + spd * 0.012);

      // vertical movement
      g.buffer = Math.max(0, g.buffer - dt);
      g.invuln = Math.max(0, g.invuln - dt);
      if (!g.onGround) {
        g.yOff += g.vy * dt;
        g.vy -= GRAV * dt;
        if (keys.down) g.vy -= GRAV * 1.6 * dt; // fast-fall
        if (g.yOff <= 0) {
          g.yOff = 0;
          g.vy = 0;
          g.onGround = true;
          // buffered jump: a press that landed just before touchdown still fires,
          // as long as the player isn't holding down to duck.
          if (g.buffer > 0 && !keys.down) {
            g.vy = VJUMP;
            g.onGround = false;
            g.yOff = 0.01;
            g.buffer = 0;
          }
        }
      }
      g.ducking = g.onGround && keys.down;

      // horizontal nudge
      if (keys.left) g.mikeyX -= 300 * dt;
      if (keys.right) g.mikeyX += 300 * dt;
      g.mikeyX = clamp(g.mikeyX, 90, 540);

      // spawn obstacles ahead
      while (g.nextSpawnX <= g.worldX + W + 140) {
        let spawnX = g.nextSpawnX;
        const b = nextBoundary(spawnX);
        if (b - spawnX < 250) spawnX = b + 230; // keep the doorway clear
        const env = envAt(spawnX);
        const kind = pickKind(env);
        const sh = SHAPES[kind];
        g.obstacles.push({ worldX: spawnX, env, kind, mode: sh.mode, w: sh.w, h: sh.h, hangBottom: sh.hangBottom });
        const cur = worldSpeed(g.score);
        const floorGap = AIRTIME * cur * 1.1; // never below a threadable jump distance
        g.nextSpawnX = spawnX + Math.max(spawnGapSec(g.score) * cur, floorGap) + rand(0, 90);
      }
      g.obstacles = g.obstacles.filter((o) => o.worldX - g.worldX > -220);

      // The one wine bottle: float it in once, around 50 Parker Points, in a clear
      // spot just off the right edge. Run into it to chug it (+1 life).
      if (!g.bottleDone && g.score >= BOTTLE_SCORE) {
        g.bottle = { worldX: g.worldX + W + 220 };
        g.bottleDone = true;
      }
      if (g.bottle) {
        const bx = g.bottle.worldX - g.worldX;
        if (Math.abs(bx - g.mikeyX) < 30) {
          g.lives += 1; // chug! extra life
          g.bottle = null;
        } else if (bx < -80) {
          g.bottle = null; // missed — it's gone for good (only one ever)
        }
      }

      // live HUD updates (only when something changes)
      const intScore = Math.floor(g.score);
      if (intScore !== g.lastInt) {
        g.lastInt = intScore;
        setScore(intScore);
      }
      if (g.lives !== g.lastLives) {
        g.lastLives = g.lives;
        setLives(g.lives);
      }
      const z = envAt(g.worldX + W / 2);
      if (z !== g.lastZone) {
        g.lastZone = z;
        setZone(z);
      }

      if (g.score >= 100) {
        finish(true);
        return;
      }
      // A hit costs a life (unless still invulnerable from the last one). Out of
      // lives → game over; otherwise grant brief i-frames so the same obstacle
      // doesn't drain several lives on consecutive frames.
      if (g.invuln <= 0 && collide(g)) {
        g.lives -= 1;
        setLives(g.lives);
        g.lastLives = g.lives;
        if (g.lives <= 0) {
          finish(false);
          return;
        }
        g.invuln = HIT_INVULN;
      }
    };

    const loop = (now: number) => {
      const g = gameRef.current;
      if (!g || g.dead) return;
      const dt = Math.min(0.05, g.last ? (now - g.last) / 1000 : 0);
      g.last = now;
      update(g, dt);
      drawScene(ctx, g);
      if (!g.dead) g.raf = requestAnimationFrame(loop);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp":
        case " ":
        case "Spacebar":
          e.preventDefault();
          keysRef.current.up = true;
          doJump();
          break;
        case "ArrowDown":
          e.preventDefault();
          keysRef.current.down = true;
          break;
        case "ArrowLeft":
          e.preventDefault();
          keysRef.current.left = true;
          break;
        case "ArrowRight":
          e.preventDefault();
          keysRef.current.right = true;
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp": case " ": case "Spacebar": {
          keysRef.current.up = false;
          // variable jump height: releasing while still rising cuts the arc short.
          const g = gameRef.current;
          if (g && g.vy > 0) g.vy *= JUMP_CUT;
          break;
        }
        case "ArrowDown": keysRef.current.down = false; break;
        case "ArrowLeft": keysRef.current.left = false; break;
        case "ArrowRight": keysRef.current.right = false; break;
      }
    };
    const onBlur = () => { keysRef.current = { up: false, down: false, left: false, right: false }; };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    gameRef.current.last = 0;
    gameRef.current.raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(gameRef.current.raf);
      gameRef.current.dead = true;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Touch controls (set the same key flags as the keyboard)
  const pressKey = useCallback((k: keyof Keys, v: boolean) => {
    keysRef.current[k] = v;
    if (k === "up" && v) doJump();
    // release Jump while still rising → cut the arc short (variable jump height)
    if (k === "up" && !v) {
      const g = gameRef.current;
      if (g && g.vy > 0) g.vy *= JUMP_CUT;
    }
  }, [doJump]);

  const finalScore = score;
  const verdict =
    won || finalScore >= 100
      ? {
          title: "ICON STATUS",
          sub: "100 Parker Points. Robert himself weeps. You ARE the vintage of the century.",
          cls: "text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400",
          glow: "from-amber-400/30 via-yellow-300/20 to-amber-500/30",
          icon: "🏆",
        }
      : finalScore >= 90
        ? {
            title: "Solid pour",
            sub: "So close to greatness — a genuinely serious wine. One more push for icon status.",
            cls: "text-fuchsia-200",
            glow: "from-fuchsia-500/20 via-purple-500/15 to-fuchsia-500/20",
            icon: "🍷",
          }
        : {
            title: "What is this plonk?",
            sub: "Drinkable, technically. Decant your ego and run it again.",
            cls: "text-rose-200",
            glow: "from-rose-500/20 via-fuchsia-500/15 to-rose-500/20",
            icon: "🥴",
          };

  return (
    <div className="flex flex-col flex-1 bg-gradient-to-b from-violet-950 via-purple-950 to-fuchsia-950">
      <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col flex-1">
        {/* Loud header — intentionally off-brand */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-fuchsia-200/80 hover:text-white transition-colors cursor-pointer"
          >
            &larr; Back to studying
          </button>
          <span className="text-xs font-bold uppercase tracking-widest text-amber-200/80">
            Just for fun · not graded
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center mb-1 text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-pink-200 to-fuchsia-200 drop-shadow">
          Lil&apos; Mikey&apos;s Wine Adventure 🍇
        </h1>
        <p className="text-center text-fuchsia-100/80 text-sm mb-4 font-medium">
          Auto-run through the vineyard &amp; winery. Chase 100 Parker Points!
        </p>

        {/* Game stage */}
        <div className="relative w-full mx-auto rounded-2xl overflow-hidden ring-4 ring-fuchsia-500/40 shadow-2xl shadow-fuchsia-900/50" style={{ aspectRatio: `${W} / ${H}` }}>
          <canvas ref={canvasRef} className="block w-full h-full" />

          {/* HUD — live Parker Points + current zone */}
          {phase === "playing" && (
            <>
              <div className="absolute top-3 left-3 select-none">
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-200/90 drop-shadow">
                  Parker Points
                </div>
                <div className="text-4xl font-extrabold tabular-nums leading-none text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                  {finalScore}
                  <span className="text-lg text-amber-200/80">/100</span>
                </div>
                <div className="mt-1 h-2 w-40 rounded-full bg-black/30 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-300 via-pink-400 to-fuchsia-500 transition-all"
                    style={{ width: `${finalScore}%` }}
                  />
                </div>
              </div>
              <div className="absolute top-3 right-3 flex flex-col items-end gap-2 select-none">
                <div className="flex items-center gap-1" aria-label={`${lives} lives`}>
                  {Array.from({ length: lives }).map((_, i) => (
                    <span key={i} className="text-2xl leading-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.7)]">
                      🍇
                    </span>
                  ))}
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-black/35 text-white border border-white/20">
                  {zone === "vineyard" ? "🍇 Vineyard" : "🏭 Winery"}
                </span>
              </div>
            </>
          )}

          {/* Ready overlay */}
          {phase === "ready" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 backdrop-blur-[2px] text-center px-6">
              <div className="text-5xl mb-3">🏃‍♂️💨</div>
              <h2 className="text-2xl font-extrabold text-white mb-2">Ready to run?</h2>
              <p className="text-fuchsia-100/90 text-sm max-w-sm mb-5">
                <span className="font-bold text-amber-200">↑ Jump</span> over vines, tractors &amp;
                barrels. <span className="font-bold text-amber-200">↓ Duck</span> under trellises &amp;
                pipes. <span className="font-bold text-amber-200">← →</span> nudge. You&apos;ve got
                <span className="font-bold text-fuchsia-200"> 🍇🍇🍇 three lives</span> — grab the
                <span className="font-bold text-amber-200"> 🍷 wine bottle</span> around 50 points to
                chug an extra one. It gets <span className="font-bold text-rose-200">brutal</span> after 90!
              </p>
              <button
                onClick={startGame}
                className="px-8 py-3 rounded-full font-extrabold text-lg text-white bg-gradient-to-r from-fuchsia-500 via-purple-500 to-amber-400 hover:from-fuchsia-400 hover:via-purple-400 hover:to-amber-300 shadow-lg shadow-fuchsia-500/40 transition-all hover:scale-105 cursor-pointer"
              >
                START RUN 🍷
              </button>
            </div>
          )}

          {/* Verdict / game-over overlay */}
          {phase === "over" && (
            <div className={`absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm text-center px-6 bg-gradient-to-br ${verdict.glow}`}>
              <div className="text-6xl mb-2 animate-bounce">{verdict.icon}</div>
              <h2 className={`text-4xl font-extrabold mb-2 drop-shadow ${verdict.cls}`}>{verdict.title}</h2>
              <p className="text-white/90 text-sm max-w-sm mb-4">{verdict.sub}</p>
              <div className="mb-5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-200/90">Final Parker Points</div>
                <div className="text-6xl font-extrabold tabular-nums text-white drop-shadow">
                  {finalScore}
                  <span className="text-2xl text-amber-200/80">/100</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={startGame}
                  className="px-8 py-3 rounded-full font-extrabold text-white bg-gradient-to-r from-fuchsia-500 via-purple-500 to-amber-400 hover:from-fuchsia-400 hover:via-purple-400 hover:to-amber-300 shadow-lg shadow-fuchsia-500/40 transition-all hover:scale-105 cursor-pointer"
                >
                  Play Again 🔁
                </button>
                <button
                  onClick={() => router.push("/")}
                  className="px-6 py-3 rounded-full font-semibold text-fuchsia-100 border border-white/30 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Back to studying
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Touch controls (mobile) */}
        {phase === "playing" && (
          <div className="mt-4 grid grid-cols-4 gap-2 sm:hidden select-none touch-none">
            <button onPointerDown={(e) => { e.preventDefault(); pressKey("left", true); }} onPointerUp={() => pressKey("left", false)} onPointerLeave={() => pressKey("left", false)} className="py-4 rounded-xl bg-white/10 text-white text-xl font-bold active:bg-white/25">←</button>
            <button onPointerDown={(e) => { e.preventDefault(); pressKey("up", true); }} onPointerUp={() => pressKey("up", false)} onPointerLeave={() => pressKey("up", false)} className="py-4 rounded-xl bg-amber-400/30 text-white text-xl font-bold active:bg-amber-400/50">↑ Jump</button>
            <button onPointerDown={(e) => { e.preventDefault(); pressKey("down", true); }} onPointerUp={() => pressKey("down", false)} onPointerLeave={() => pressKey("down", false)} className="py-4 rounded-xl bg-fuchsia-400/30 text-white text-xl font-bold active:bg-fuchsia-400/50">↓ Duck</button>
            <button onPointerDown={(e) => { e.preventDefault(); pressKey("right", true); }} onPointerUp={() => pressKey("right", false)} onPointerLeave={() => pressKey("right", false)} className="py-4 rounded-xl bg-white/10 text-white text-xl font-bold active:bg-white/25">→</button>
          </div>
        )}

        {/* Desktop control hint */}
        <p className="mt-4 text-center text-xs text-fuchsia-200/60 hidden sm:block">
          ↑ jump · ↓ duck/slide · ← → nudge · reach 100 Parker Points for ICON STATUS
        </p>
      </div>

      {/* Soundtrack — mounts (and starts unmuted) once the run begins; persists across replays. */}
      {musicOn && <MikeyMusicPlayer />}
    </div>
  );
}
