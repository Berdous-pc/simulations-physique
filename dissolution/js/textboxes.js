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

    /* Fond arrondi semi-transparent, contraste suffisant sur le dégradé bleu
       de la scène quel que soit l'endroit où la boîte est placée. */
    const r = 10;
    ctx.beginPath();
    ctx.moveTo(box.x + r, box.y);
    ctx.arcTo(box.x + box.w, box.y, box.x + box.w, box.y + box.h, r);
    ctx.arcTo(box.x + box.w, box.y + box.h, box.x, box.y + box.h, r);
    ctx.arcTo(box.x, box.y + box.h, box.x, box.y, r);
    ctx.arcTo(box.x, box.y, box.x + box.w, box.y, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(20, 30, 40, 0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    /* Texte, découpé pour tenir dans la largeur utile de la boîte. */
    ctx.fillStyle = '#ffffff';
    ctx.font = (box.bold ? 'bold ' : '') + box.fontSize + "px 'Segoe UI', Arial, sans-serif";
    ctx.textBaseline = 'top';
    ctx.textAlign = box.align || 'left';

    const innerW = box.w - TEXT_BOX_PADDING * 2;
    const lineH = box.fontSize * 1.3;
    let tx = box.x + TEXT_BOX_PADDING;
    if (box.align === 'center') tx = box.x + box.w / 2;
    else if (box.align === 'right') tx = box.x + box.w - TEXT_BOX_PADDING;

    wrapTextBoxLines(ctx, box.text, innerW).forEach((line, i) => {
      ctx.fillText(line, tx, box.y + TEXT_BOX_PADDING + i * lineH);
    });

    ctx.restore();
  });
}
