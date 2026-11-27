import { invoke } from "@tauri-apps/api/core";
import { buildCells, HEATMAP_WEEKS } from "./heatmap";
import type { DaySummary } from "./db";
import { toDateKey } from "./date";
import { mixHex } from "./theme";

// Fixed light palette so the exported image looks the same whatever the Windows theme.
const COLORS = {
  bg: "#fbfaf7",
  title: "#1f1e1c",
  sub: "#6b6a65",
  faint: "#9c9a93",
  empty: "#ebeae5",
};
// The signature is the app's, not the user's: Daily is made by jkdev.
const SIGNATURE = "Made with love by jkdev ";
const APP_CREDIT = "Daily · github.com/jkagullo/daily";

/** Same ramp as the panel's CSS (--l0…--l4), computed for the export. */
function levelColors(accent: string): string[] {
  return [
    COLORS.empty,
    mixHex(COLORS.empty, accent, 0.35),
    mixHex(COLORS.empty, accent, 0.65),
    accent,
    mixHex(accent, "#000000", 0.3),
  ];
}
const FONT = `"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif`;
const EMOJI_FONT = `"Segoe UI Emoji", "Segoe UI", sans-serif`;

const SCALE = 2; // render at 2x so it's crisp on hi-dpi screens and when shared
const PAD = 40;
const CELL = 18;
const GAP = 4;
const DAY_LABEL_W = 36;

interface ExportInput {
  today: Date;
  summaries: DaySummary[];
  streak: number;
  /** Hex accent from settings */
  accent: string;
  title: string;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

export function renderHeatmapPng({ today, summaries, streak, accent, title }: ExportInput): Promise<Blob> {
  const levels = levelColors(accent);
  const weeks = HEATMAP_WEEKS;
  const cells = buildCells(today, summaries, weeks);
  const gridX = PAD + DAY_LABEL_W;
  const gridY = 150;
  const gridW = weeks * (CELL + GAP) - GAP;
  const gridH = 7 * (CELL + GAP) - GAP;
  const width = gridX + gridW + PAD;
  const height = gridY + gridH + 96;

  const canvas = document.createElement("canvas");
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas not available"));
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  // Title + summary line
  const past = cells.filter((c) => !c.future);
  const totalDone = past.reduce((n, c) => n + (c.summary?.done ?? 0), 0);
  const fmt = (d: Date, withYear = false) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
  const range = `${fmt(cells[0].date)} – ${fmt(today, true)}`;

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.title;
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(title.trim() || "My tasks", PAD, PAD + 30);
  ctx.fillStyle = COLORS.sub;
  ctx.font = `400 14px ${FONT}`;
  ctx.fillText(`${range}  ·  ${totalDone} tasks done  ·  ${streak} day streak`, PAD, PAD + 58);

  // Month labels: whenever a column starts a new month
  ctx.fillStyle = COLORS.faint;
  ctx.font = `400 11px ${FONT}`;
  const monthCols: number[] = [];
  for (let w = 0; w < weeks; w++) {
    if (w === 0 || cells[w * 7].date.getMonth() !== cells[(w - 1) * 7].date.getMonth()) monthCols.push(w);
  }
  // Drop the first column's label if the next month starts too close and they'd overlap.
  if (monthCols.length > 1 && monthCols[1] - monthCols[0] < 3) monthCols.shift();
  for (const w of monthCols) {
    const label = cells[w * 7].date.toLocaleDateString(undefined, { month: "short" });
    ctx.fillText(label, gridX + w * (CELL + GAP), gridY - 10);
  }

  // Weekday labels
  ["Mon", "Wed", "Fri"].forEach((label, i) => {
    const row = i * 2 + 1;
    ctx.fillText(label, PAD, gridY + row * (CELL + GAP) + CELL - 5);
  });

  // Cells
  cells.forEach((c, i) => {
    if (c.future) return;
    const col = Math.floor(i / 7);
    const row = i % 7;
    ctx.fillStyle = levels[c.level];
    roundRect(ctx, gridX + col * (CELL + GAP), gridY + row * (CELL + GAP), CELL, CELL, 4);
  });

  // Footer: signature left, legend right
  const footY = gridY + gridH + 46;
  ctx.fillStyle = COLORS.sub;
  ctx.font = `400 13px ${FONT}`;
  ctx.fillText(SIGNATURE, PAD, footY);
  ctx.font = `400 13px ${EMOJI_FONT}`;
  ctx.fillText("🌼", PAD + ctx.measureText(SIGNATURE).width + 2, footY);

  ctx.font = `400 11px ${FONT}`;
  ctx.fillStyle = COLORS.faint;
  const legendCell = 12;
  const legendW = 5 * (legendCell + 3) - 3;
  const legendRight = width - PAD;
  const moreW = ctx.measureText("More").width;
  const legendX = legendRight - moreW - 8 - legendW;
  ctx.fillText("More", legendRight - moreW, footY);
  const lessW = ctx.measureText("Less").width;
  ctx.fillText("Less", legendX - 8 - lessW, footY);
  levels.forEach((color, i) => {
    ctx.fillStyle = color;
    roundRect(ctx, legendX + i * (legendCell + 3), footY - legendCell + 1, legendCell, legendCell, 3);
  });

  // Small app credit under the signature
  ctx.fillStyle = COLORS.faint;
  ctx.font = `400 11px ${FONT}`;
  ctx.fillText(APP_CREDIT, PAD, footY + 20);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode PNG"))), "image/png"),
  );
}

/** Render, then hand the bytes to Rust, which shows the save dialog and writes the file. */
export async function exportHeatmap(input: ExportInput): Promise<boolean> {
  const blob = await renderHeatmapPng(input);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return invoke<boolean>("export_png", bytes, {
    headers: { "x-file-name": `my-tasks-${toDateKey(input.today)}.png` },
  });
}
