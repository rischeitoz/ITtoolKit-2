const fs = require('fs');
const { Resvg } = require('@resvg/resvg-js');

// Parámetros maestros del logotipo oficial HCP+ positivo
// Altura de glifos: 460px (de y=70 a y=530) dentro de un lienzo de 2240 x 600
const Y_TOP = 70;
const Y_BOT = 530;
const Y_MID = 300;
const T = 74; // Grosor de trazo uniforme

const Y_BAR_TOP = Y_MID - T / 2; // 263
const Y_BAR_BOT = Y_MID + T / 2; // 337

// ── 1. LETRA H ──────────────────────────────────────────────────────────────
const h_x1 = 60;
const h_x2 = h_x1 + T;       // 134
const h_x3 = h_x1 + 400 - T; // 386
const h_x4 = h_x1 + 400;     // 460

const pathH = `
  M ${h_x1},${Y_TOP}
  L ${h_x2},${Y_TOP}
  L ${h_x2},${Y_BAR_TOP}
  L ${h_x3},${Y_BAR_TOP}
  L ${h_x3},${Y_TOP}
  L ${h_x4},${Y_TOP}
  L ${h_x4},${Y_BOT}
  L ${h_x3},${Y_BOT}
  L ${h_x3},${Y_BAR_BOT}
  L ${h_x2 + 85},${Y_BAR_BOT}
  C ${h_x2 + 45},${Y_BAR_BOT} ${h_x2 + 25},${Y_MID} ${h_x2},${Y_MID}
  C ${h_x1 + 35},${Y_MID} ${h_x1},${Y_TOP + 175} ${h_x1},${Y_TOP + 135}
  Z
  M ${h_x1},${Y_MID}
  L ${h_x2},${Y_MID}
  L ${h_x2},${Y_BOT}
  L ${h_x1},${Y_BOT}
  Z
`.trim();

// ── 2. LETRA C ──────────────────────────────────────────────────────────────
const c_x1 = 570;
const c_w  = 390;
const c_x2 = c_x1 + c_w; // 960
const c_cx = (c_x1 + c_x2) / 2; // 765

const pathC = `
  M ${c_x2 - 8},${Y_TOP + 125}
  L ${c_x2 - T - 8},${Y_TOP + 125}
  C ${c_x2 - T - 8},${Y_TOP + 95} ${c_x2 - 130},${Y_TOP + T} ${c_cx - 8},${Y_TOP + T}
  C ${c_x1 + 115},${Y_TOP + T} ${c_x1 + T},${Y_TOP + 110} ${c_x1 + T},${Y_MID}
  C ${c_x1 + T},${Y_BOT - 110} ${c_x1 + 115},${Y_BOT - T} ${c_cx - 8},${Y_BOT - T}
  C ${c_x2 - 130},${Y_BOT - T} ${c_x2 - T - 8},${Y_BOT - 95} ${c_x2 - T - 8},${Y_BOT - 125}
  L ${c_x2 - 8},${Y_BOT - 125}
  C ${c_x2 - 8},${Y_BOT - 65} ${c_x2 - 75},${Y_BOT} ${c_cx - 8},${Y_BOT}
  C ${c_x1 + 65},${Y_BOT} ${c_x1},${Y_BOT - 90} ${c_x1},${Y_MID}
  C ${c_x1},${Y_TOP + 90} ${c_x1 + 65},${Y_TOP} ${c_cx - 8},${Y_TOP}
  C ${c_x2 - 75},${Y_TOP} ${c_x2 - 8},${Y_TOP + 65} ${c_x2 - 8},${Y_TOP + 125}
  Z
`.trim();

// ── 3. LETRA P ──────────────────────────────────────────────────────────────
const p_x1 = 1070;
const p_x2 = p_x1 + T;
const p_w  = 360;
const p_r_out = p_x1 + p_w; // 1430

const pathP = `
  M ${p_x1},${Y_TOP}
  L ${p_r_out - 110},${Y_TOP}
  C ${p_r_out - 35},${Y_TOP} ${p_r_out},${Y_TOP + 45} ${p_r_out},${Y_TOP + 130}
  C ${p_r_out},${Y_BAR_BOT - 45} ${p_r_out - 35},${Y_BAR_BOT} ${p_r_out - 110},${Y_BAR_BOT}
  L ${p_x2},${Y_BAR_BOT}
  L ${p_x2},${Y_BOT}
  L ${p_x1},${Y_BOT}
  Z
  M ${p_x2},${Y_TOP + T}
  L ${p_r_out - 110},${Y_TOP + T}
  C ${p_r_out - 75},${Y_TOP + T} ${p_r_out - T},${Y_TOP + 95} ${p_r_out - T},${Y_TOP + 130}
  C ${p_r_out - T},${Y_TOP + 165} ${p_r_out - 75},${Y_BAR_BOT - T} ${p_r_out - 110},${Y_BAR_BOT - T}
  L ${p_x2},${Y_BAR_BOT - T}
  Z
`.trim();

// ── 4. SÍMBOLO + ────────────────────────────────────────────────────────────
const plus_cx = 1810;
const plus_vx1 = plus_cx - T / 2; // 1773
const plus_vx2 = plus_cx + T / 2; // 1847
const plus_arm_w = 200;
const plus_x_left  = plus_cx - plus_arm_w; // 1610
const plus_x_right = plus_cx + plus_arm_w; // 2010

const pathPlus = `
  M ${plus_vx1},${Y_TOP}
  L ${plus_vx2},${Y_TOP}
  L ${plus_vx2},${Y_BAR_TOP}
  L ${plus_x_right},${Y_BAR_TOP}
  L ${plus_x_right},${Y_BAR_BOT}
  L ${plus_vx2 + 85},${Y_BAR_BOT}
  C ${plus_vx2 + 45},${Y_BAR_BOT} ${plus_vx2 + 25},${Y_MID} ${plus_vx2},${Y_MID}
  C ${plus_vx1 + 35},${Y_MID} ${plus_vx1},${Y_TOP + 175} ${plus_vx1},${Y_TOP + 135}
  Z
  M ${plus_x_left},${Y_BAR_TOP}
  L ${plus_vx1},${Y_BAR_TOP}
  L ${plus_vx1},${Y_MID}
  L ${plus_vx2},${Y_MID}
  L ${plus_vx2},${Y_BOT}
  L ${plus_vx1},${Y_BOT}
  L ${plus_vx1},${Y_BAR_BOT}
  L ${plus_x_left},${Y_BAR_BOT}
  Z
`.trim();

// SVG Horizontal Completo (Proporción nativa oficial de 01_logo_positivo.png)
const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2150 600" width="2150" height="600">
  <g fill="#000000">
    <path d="${pathH}" fill-rule="evenodd" />
    <path d="${pathC}" fill-rule="evenodd" />
    <path d="${pathP}" fill-rule="evenodd" />
    <path d="${pathPlus}" fill-rule="evenodd" />
  </g>
</svg>
`;

fs.writeFileSync('renderer/logo.svg', fullSvg.trim() + '\n');
console.log('renderer/logo.svg written.');

// Generar renderer/logo.png de alta resolución con fondo transparente
const resvg = new Resvg(fullSvg, {
  fitTo: {
    mode: 'width',
    value: 2150
  }
});
const pngData = resvg.render();
fs.writeFileSync('renderer/logo.png', pngData.asPng());
console.log('renderer/logo.png generated successfully, size:', pngData.asPng().length);

// Generar también favicon.png y logo-square.svg para los íconos de aplicación
const squareSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <rect width="600" height="600" rx="120" fill="#FFFFFF" />
  <g transform="translate(-1510, 0)" fill="#000000">
    <path d="${pathPlus}" fill-rule="evenodd" />
  </g>
</svg>`;
fs.writeFileSync('renderer/logo-icon.svg', squareSvg.trim() + '\n');

const resvgIcon = new Resvg(squareSvg, { fitTo: { mode: 'width', value: 256 } });
fs.writeFileSync('renderer/favicon.png', resvgIcon.render().asPng());
console.log('renderer/favicon.png generated successfully.');
