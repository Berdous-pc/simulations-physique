// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

/* textboxes.js — boîtes de dialogue décrivant les étapes du mécanisme
   (TEXT_BOXES, cf. sim.js). Rendu entièrement en unités de scène fixes
   (STAGE_W/STAGE_H) comme le reste de l'animation : la mise à l'échelle vers
   l'écran réel est gérée une seule fois par le ctx.setTransform de resize()
   (ui.js), jamais ici. Chargé après eau.js, avant ui.js (drawScene() y
   appelle drawTextBoxes()). */

const TEXT_BOX_FADE_MS = 200;   // fondu d'entrée/sortie
const TEXT_BOX_PADDING = 16;    // unités de scène
const TEXT_BOX_TITLE_SCALE = 1.2;   // taille du titre par rapport à fontSize
const TEXT_BOX_TITLE_GAP = 10;      // espace (unités de scène) entre titre et corps

/* Découpe un texte en lignes tenant dans maxW (unités de scène), en
   respectant les retours à la ligne explicites (\n) du texte source. */
function wrapTextBoxLines(ctx, text, maxW) {
  const lines = [];
  String(text).split('\n').forEach(paragraph => {
    const words = paragraph.split(' ');
    let cur = '';
    words.forEach(word => {
      const test = cur ? cur + ' ' + word : word;
      if (cur && ctx.measureText(test).width > maxW) {
        lines.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    });
    lines.push(cur);
  });
  return lines;
}

/* Zone de la scène réellement visible (unités de scène), tenue à jour par
   resize() (ui.js) : en mode « cover », une fenêtre moins large que la scène
   en rogne les bords gauche/droit (ou haut/bas). Les boîtes y sont recadrées. */
let stageView = { x0: 0, y0: 0, x1: STAGE_W, y1: STAGE_H };
const TEXT_BOX_MARGIN = 12;   // marge minimale entre une boîte et le bord visible

function drawTextBoxes(ctx) {
  TEXT_BOXES.forEach(box => {
    const endMs = box.atMs + box.durationMs;
    if (state.animT < box.atMs || state.animT > endMs) return;

    let alpha = 1;
    if (state.animT < box.atMs + TEXT_BOX_FADE_MS) {
      alpha = (state.animT - box.atMs) / TEXT_BOX_FADE_MS;
    } else if (state.animT > endMs - TEXT_BOX_FADE_MS) {
      alpha = (endMs - state.animT) / TEXT_BOX_FADE_MS;
    }
    alpha = clamp01(alpha);

    ctx.save();
    ctx.globalAlpha = alpha;

    /* Mise en page d'abord : la hauteur est déduite du texte mesuré avec la
       police réellement utilisée (Segoe UI n'existe pas partout), jamais de
       box.h, qui n'est valable que pour la police de calage. */
    const view = stageView;
    const w = Math.min(box.w, view.x1 - view.x0 - TEXT_BOX_MARGIN * 2);
    const innerW = w - TEXT_BOX_PADDING * 2;
    const titleSize = box.fontSize * TEXT_BOX_TITLE_SCALE;
    const titleLineH = titleSize * 1.25;
    const bodyLineH = box.fontSize * 1.3;
    const titleFont = 'bold ' + titleSize + "px 'Segoe UI', Arial, sans-serif";
    const bodyFont = (box.bold ? 'bold ' : '') + box.fontSize + "px 'Segoe UI', Arial, sans-serif";

    let titleLines = [];
    if (box.title) {
      ctx.font = titleFont;
      titleLines = wrapTextBoxLines(ctx, box.title, innerW);
    }
    ctx.font = bodyFont;
    const bodyLines = wrapTextBoxLines(ctx, box.text, innerW);

    const h = TEXT_BOX_PADDING * 2 + bodyLines.length * bodyLineH +
      (titleLines.length ? titleLines.length * titleLineH + TEXT_BOX_TITLE_GAP : 0);

    /* Recadrage dans la zone visible (si la boîte est plus haute que la zone,
       elle reste collée en haut). */
    const x = Math.max(view.x0 + TEXT_BOX_MARGIN, Math.min(box.x, view.x1 - TEXT_BOX_MARGIN - w));
    const y = Math.max(view.y0 + TEXT_BOX_MARGIN, Math.min(box.y, view.y1 - TEXT_BOX_MARGIN - h));

    /* Fond arrondi semi-transparent, contraste suffisant sur le dégradé bleu
       de la scène quel que soit l'endroit où la boîte est placée. */
    const r = 10;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(20, 30, 40, 0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    ctx.textAlign = box.align || 'left';

    let tx = x + TEXT_BOX_PADDING;
    if (box.align === 'center') tx = x + w / 2;
    else if (box.align === 'right') tx = x + w - TEXT_BOX_PADDING;

    let cy = y + TEXT_BOX_PADDING;
    if (titleLines.length) {
      ctx.font = titleFont;
      titleLines.forEach(line => { ctx.fillText(line, tx, cy); cy += titleLineH; });
      cy += TEXT_BOX_TITLE_GAP;
    }
    ctx.font = bodyFont;
    bodyLines.forEach(line => { ctx.fillText(line, tx, cy); cy += bodyLineH; });

    ctx.restore();
  });
}
