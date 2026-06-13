// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

'use strict';

/**
 * Choisit un pas de graduation "joli" (1, 2, 5 × 10^n).
 * @param {number} range - L'intervalle total de l'axe.
 * @param {number} targetN - Le nombre cible de divisions souhaité.
 * @returns {number} Le pas de graduation recommandé.
 */
function niceStep(range, targetN) {
  if (range <= 0) return 1;
  const raw  = range / targetN;
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return nice * mag;
}

/**
 * Formate élégamment une valeur d'axe Y.
 * @param {number} v - La valeur numérique à formater.
 * @returns {string} La chaîne formatée.
 */
function fmtAxisY(v) {
  const a = Math.abs(v);
  if (a === 0)      return '0';
  if (a >= 100)     return v.toFixed(0);
  if (a >= 10)      return v.toFixed(1);
  if (a >= 0.1)     return v.toFixed(2);
  return v.toExponential(1);
}
