// La courbe de glycémie, dessinée sur un canvas : la cible en bande, les mesures en points colorés, la prévision à
// 30 min en pointillés dorés avec sa marge, les heures, minuit, et un curseur qui lit un instant (souris ou doigt).
import { format, TREND_ARROW, formatDelta, unitLabel } from "../core/glucose.js";
import { cssVar, fmt } from "./h.js";

const HOUR = 3_600_000;

/** Prépare un canvas net sur les écrans haute densité ; renvoie le contexte et la taille en points CSS. */
export function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
  if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
    canvas.width = width * ratio;
    canvas.height = height * ratio;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

export function colorFor(mgdl, low, high, night = false) {
  if (night) return cssVar("--night");
  if (mgdl < low) return cssVar("--low");
  if (mgdl > high) return cssVar("--high");
  return cssVar("--in-range");
}

/**
 * Courbe d'accueil (et de l'écran de nuit, `night: true`).
 * state : { readings, prediction, hours, low, high, unit }
 */
export class GlucoseChart {
  constructor(canvas, { night = false, onRead = null } = {}) {
    this.canvas = canvas;
    this.night = night;
    this.onRead = onRead;
    this.cursor = null;
    this.state = null;
    const read = (event) => {
      const rect = canvas.getBoundingClientRect();
      this.cursor = event.clientX - rect.left;
      this.draw();
    };
    canvas.addEventListener("pointermove", read);
    canvas.addEventListener("pointerdown", read);
    canvas.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { this.cursor = null; this.draw(); } });
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  update(state) {
    this.state = state;
    this.draw();
  }

  clearCursor() {
    this.cursor = null;
    this.draw();
  }

  draw() {
    const s = this.state;
    if (!s || !this.canvas.isConnected) return;
    const { ctx, width, height } = setupCanvas(this.canvas);
    const { readings, prediction, hours, low, high, unit } = s;
    const last = readings[readings.length - 1];
    const end = (last?.date ?? Date.now()) + (prediction ? 32 : 5) * 60_000;
    const start = end - hours * HOUR - (prediction ? 32 : 5) * 60_000;
    const shown = readings.filter((r) => r.date >= start);
    const top = Math.min(400, Math.max(high + 50, Math.max(0, ...shown.map((r) => r.mgdl)) + 20));
    const bottom = 40;
    const pad = { left: 34, right: 8, top: this.night ? 8 : 30, bottom: 22 };
    const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
    const x = (t) => pad.left + ((t - start) / (end - start)) * plotW;
    const y = (v) => pad.top + (1 - (Math.min(Math.max(v, bottom), top) - bottom) / (top - bottom)) * plotH;
    const ink = cssVar(this.night ? "--night-dim" : "--sub");
    const grid = cssVar(this.night ? "--night-grid" : "--grid");

    // La cible.
    ctx.fillStyle = cssVar(this.night ? "--night-band" : "--band");
    ctx.fillRect(pad.left, y(high), plotW, y(low) - y(high));

    // Les heures (toutes les heures jusqu'à 12 h, toutes les 3 h au-delà), et minuit en pointillés avec le jour.
    ctx.font = "11px system-ui, -apple-system, sans-serif";
    ctx.textBaseline = "alphabetic";
    const step = hours <= 6 ? 1 : hours <= 12 ? 2 : 3;
    const firstHour = new Date(start); firstHour.setMinutes(0, 0, 0);
    for (let t = firstHour.getTime() + HOUR; t < end; t += HOUR) {
      const d = new Date(t);
      const midnight = d.getHours() === 0;
      if (!midnight && d.getHours() % step !== 0) continue;
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      ctx.setLineDash(midnight ? [3, 3] : []);
      ctx.beginPath(); ctx.moveTo(x(t), pad.top); ctx.lineTo(x(t), pad.top + plotH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ink;
      ctx.textAlign = "center";
      ctx.fillText(midnight ? fmt.weekdayDay(t) : `${d.getHours()} h`, x(t), height - 6);
    }

    // Les valeurs repères à gauche : la cible, puis 250 et 300 s'ils sont dans l'échelle.
    ctx.textAlign = "right";
    ctx.fillStyle = ink;
    for (const v of [low, high, 250, 300].filter((v, i, a) => v < top - 8 && a.indexOf(v) === i && (v <= high || v - high > 30))) {
      ctx.fillText(format(v, unit), pad.left - 6, y(v) + 4);
    }

    // La prévision : sa marge, puis la ligne en pointillés.
    if (prediction && last) {
      const pts = [{ date: prediction.start, value: prediction.startValue, low: prediction.startValue, high: prediction.startValue }, ...prediction.points];
      ctx.fillStyle = cssVar(this.night ? "--night-cone" : "--cone");
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(x(p.date), y(p.high)) : ctx.moveTo(x(p.date), y(p.high))));
      [...pts].reverse().forEach((p) => ctx.lineTo(x(p.date), y(p.low)));
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = cssVar(this.night ? "--night" : "--gold");
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 4]);
      ctx.lineCap = "round";
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(x(p.date), y(p.value)) : ctx.moveTo(x(p.date), y(p.value))));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Les mesures.
    const radius = hours <= 3 ? 3.4 : hours <= 6 ? 2.8 : hours <= 12 ? 2.2 : 1.7;
    for (const r of shown) {
      ctx.fillStyle = colorFor(r.mgdl, low, high, this.night);
      ctx.beginPath(); ctx.arc(x(r.date), y(r.mgdl), radius, 0, Math.PI * 2); ctx.fill();
    }

    // Le curseur : la mesure la plus proche (à 6 min près), ou la prévision après la dernière mesure.
    if (this.cursor !== null && this.cursor >= pad.left && this.cursor <= pad.left + plotW) {
      const t = start + ((this.cursor - pad.left) / plotW) * (end - start);
      const near = nearest(shown, t, 6 * 60_000);
      const predicted = !near && prediction && last && t > last.date + 120_000
        ? prediction.points.reduce((a, b) => (Math.abs(b.date - t) < Math.abs(a.date - t) ? b : a)) : null;
      const at = near?.date ?? predicted?.date ?? t;
      const cx = x(at);
      ctx.strokeStyle = cssVar(this.night ? "--night-dim" : "--ink");
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, pad.top - (this.night ? 0 : 6)); ctx.lineTo(cx, pad.top + plotH); ctx.stroke();
      ctx.globalAlpha = 1;
      let label = fmt.time(at) + " · pas de mesure";
      if (near) {
        const color = colorFor(near.mgdl, low, high, this.night);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(cx, y(near.mgdl), 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = cssVar(this.night ? "--night-bg" : "--card");
        ctx.lineWidth = 2; ctx.stroke();
        const i = shown.indexOf(near);
        const prev = shown[i - 1];
        const minutes = prev ? (near.date - prev.date) / 60_000 : 0;
        const delta = prev && minutes >= 2 && minutes <= 15 ? ((near.mgdl - prev.mgdl) / minutes) * 5 : null;
        label = `${fmt.time(near.date)} · ${format(near.mgdl, unit)} ${unitLabel(unit)} ${TREND_ARROW[near.trend] ?? ""}`
          + (delta !== null ? ` · ${formatDelta(delta, unit)} en 5 min` : "");
      } else if (predicted) {
        label = `${fmt.time(predicted.date)} · prévu ${format(predicted.value, unit)} (${format(predicted.low, unit)} à ${format(predicted.high, unit)})`;
      }
      if (!this.night) {
        ctx.font = "600 12px system-ui, -apple-system, sans-serif";
        const w = ctx.measureText(label).width + 16;
        const bx = Math.min(Math.max(cx - w / 2, 2), width - w - 2);
        ctx.fillStyle = cssVar("--card");
        ctx.strokeStyle = cssVar("--line");
        ctx.lineWidth = 1;
        roundRect(ctx, bx, 2, w, 22, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = cssVar("--ink");
        ctx.textAlign = "left";
        ctx.fillText(label, bx + 8, 17);
      }
      this.onRead?.(near, predicted);
    } else {
      this.onRead?.(null, null);
    }
  }
}

export function nearest(readings, t, within) {
  let best = null, bestGap = Infinity;
  for (const r of readings) {
    const gap = Math.abs(r.date - t);
    if (gap < bestGap) { best = r; bestGap = gap; }
  }
  return bestGap <= within ? best : null;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Profil type : bande 5–95 %, bande 25–75 %, médiane, sur la cible. */
export function drawAGP(canvas, buckets, low, high, unit) {
  const { ctx, width, height } = setupCanvas(canvas);
  const pad = { left: 34, right: 8, top: 8, bottom: 22 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const top = Math.min(400, Math.max(300, ...buckets.map((b) => b.p95 + 10)));
  const x = (minute) => pad.left + (minute / 1440) * plotW;
  const y = (v) => pad.top + (1 - (Math.min(Math.max(v, 40), top) - 40) / (top - 40)) * plotH;
  ctx.fillStyle = cssVar("--band");
  ctx.fillRect(pad.left, y(high), plotW, y(low) - y(high));
  ctx.font = "11px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = cssVar("--sub");
  for (const hour of [0, 6, 12, 18, 24]) {
    ctx.strokeStyle = cssVar("--grid");
    ctx.beginPath(); ctx.moveTo(x(hour * 60), pad.top); ctx.lineTo(x(hour * 60), pad.top + plotH); ctx.stroke();
    ctx.textAlign = hour === 0 ? "left" : hour === 24 ? "right" : "center";
    ctx.fillText(`${hour} h`, x(hour * 60), height - 6);
  }
  ctx.textAlign = "right";
  for (const v of [low, high, 250].filter((v, i, a) => a.indexOf(v) === i)) ctx.fillText(format(v, unit), pad.left - 6, y(v) + 4);
  if (buckets.length < 2) return;
  const mid = (b) => b.minute + 7.5;
  const band = (lo, hi, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    buckets.forEach((b, i) => (i ? ctx.lineTo(x(mid(b)), y(b[hi])) : ctx.moveTo(x(mid(b)), y(b[hi]))));
    [...buckets].reverse().forEach((b) => ctx.lineTo(x(mid(b)), y(b[lo])));
    ctx.closePath(); ctx.fill();
  };
  band("p5", "p95", cssVar("--agp-outer"));
  band("p25", "p75", cssVar("--agp-inner"));
  ctx.strokeStyle = cssVar("--accent");
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  buckets.forEach((b, i) => (i ? ctx.lineTo(x(mid(b)), y(b.p50)) : ctx.moveTo(x(mid(b)), y(b.p50))));
  ctx.stroke();
}

/** Une nuit en miniature : les mesures, la cible, le seuil de 70 en pointillés. */
export function drawSpark(canvas, readings, start, end, low, high) {
  const { ctx, width, height } = setupCanvas(canvas);
  const values = readings.map((r) => r.mgdl);
  const top = Math.max(high + 30, ...values) + 5, bottom = Math.min(55, ...values) - 5;
  const x = (t) => ((t - start) / Math.max(end - start, 1)) * width;
  const y = (v) => (1 - (v - bottom) / (top - bottom)) * (height - 4) + 2;
  ctx.fillStyle = cssVar("--band");
  ctx.fillRect(0, y(high), width, y(low) - y(high));
  ctx.strokeStyle = cssVar("--heat-low");
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(0, y(70)); ctx.lineTo(width, y(70)); ctx.stroke();
  ctx.setLineDash([]);
  for (const r of readings) {
    ctx.fillStyle = r.mgdl < 70 ? cssVar("--heat-low") : colorFor(r.mgdl, low, high);
    ctx.beginPath(); ctx.arc(x(r.date), y(r.mgdl), 1.5, 0, Math.PI * 2); ctx.fill();
  }
}
