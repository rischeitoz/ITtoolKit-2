const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;

// ═════════════════════════════════════════════════════════════════════════════
// GENERADOR OFICIAL DEL ICONO ORIGINAL DE ITTOOLKIT PARA WINDOWS (.EXE)
// Icono del rayo de energía eléctrica original de ITToolkit
// Compatible con Windows 11 / 10 (.exe, acceso directo, barra de tareas, etc.)
// ═════════════════════════════════════════════════════════════════════════════

const lightningBoltSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Fondo squircle premium estilo ITToolkit -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E3A8A"/>
      <stop offset="45%" stop-color="#1E293B"/>
      <stop offset="100%" stop-color="#0A0F1D"/>
    </linearGradient>

    <!-- Borde de luz sutil -->
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#93C5FD" stop-opacity="0.9"/>
      <stop offset="50%" stop-color="#3B82F6" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#1D4ED8" stop-opacity="0.15"/>
    </linearGradient>

    <!-- Resplandor interior suave para dar volumen táctil -->
    <linearGradient id="innerGlow" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="50%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>

    <!-- Gradiente de energía eléctrica para el rayo: amarillo ámbar luminoso -->
    <linearGradient id="boltGrad" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="18%" stop-color="#FEF08A"/>
      <stop offset="55%" stop-color="#FACC15"/>
      <stop offset="100%" stop-color="#F59E0B"/>
    </linearGradient>

    <!-- Sombra de profundidad multi-capa -->
    <filter id="iconDepthShadow" x="-12%" y="-12%" width="124%" height="128%">
      <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#000000" flood-opacity="0.5"/>
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.3"/>
    </filter>

    <!-- Resplandor del rayo eléctrico -->
    <filter id="boltGlow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#F59E0B" flood-opacity="0.55"/>
      <feDropShadow dx="0" dy="1" stdDeviation="3" flood-color="#FEF08A" flood-opacity="0.9"/>
    </filter>
  </defs>

  <!-- Base del Icono: Squircle de precisión moderna con acabado premium oscuro -->
  <rect x="24" y="24" width="464" height="464" rx="108" fill="url(#bgGrad)" stroke="url(#borderGrad)" stroke-width="3.5" filter="url(#iconDepthShadow)"/>

  <!-- Capa de brillo superior de cristal / bisel sutil -->
  <rect x="26" y="26" width="460" height="230" rx="106" fill="url(#innerGlow)" pointer-events="none"/>

  <!-- Rayo central de alta energía (Vector eléctrico estilizado original ITToolkit) -->
  <path d="M 284,56
           L 168,252
           L 254,252
           L 228,456
           L 364,236
           L 272,236
           Z"
        fill="url(#boltGrad)"
        filter="url(#boltGlow)"
        stroke="#FEF08A"
        stroke-width="3.5"
        stroke-linejoin="round"/>
</svg>
`.trim();

async function generateAllIcons() {
  console.log('== Generando icono original del rayo ITToolkit para Windows (.exe) ==');

  // 1. Crear directorio build si no existe
  const buildDir = path.join(__dirname, '..', 'build');
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
    console.log('✓ Directorio build/ asegurado');
  }

  // 2. Guardar SVG maestro en renderer/logo-icon.svg
  const outLogoIconSvg = path.join(__dirname, '..', 'renderer', 'logo-icon.svg');
  fs.writeFileSync(outLogoIconSvg, lightningBoltSvg + '\n', 'utf8');
  console.log('✓ Guardado: renderer/logo-icon.svg');

  // 3. Renderizar PNGs a múltiples resoluciones estándar de Windows con Resvg
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
  const pngBuffers = {};

  for (const size of sizes) {
    const resvg = new Resvg(lightningBoltSvg, {
      fitTo: { mode: 'width', value: size }
    });
    const png = resvg.render().asPng();
    pngBuffers[size] = png;
    console.log(`✓ Renderizado PNG: ${size}x${size} (${png.length} bytes)`);
  }

  // 4. Guardar build/icon.png (512x512) para electron-builder y Linux/macOS
  const outBuildPng = path.join(buildDir, 'icon.png');
  fs.writeFileSync(outBuildPng, pngBuffers[512]);
  console.log('✓ Guardado: build/icon.png (512x512)');

  // 5. Guardar renderer/logo.png (512x512)
  const outLogoPng = path.join(__dirname, '..', 'renderer', 'logo.png');
  fs.writeFileSync(outLogoPng, pngBuffers[512]);
  console.log('✓ Guardado: renderer/logo.png (512x512)');

  // 6. Guardar renderer/favicon.png (64x64)
  const outFavicon = path.join(__dirname, '..', 'renderer', 'favicon.png');
  fs.writeFileSync(outFavicon, pngBuffers[64]);
  console.log('✓ Guardado: renderer/favicon.png (64x64)');

  // 7. Generar build/icon.ico multi-resolución para Windows (.exe, Explorer, accesos directos)
  const icoInputBuffers = [
    pngBuffers[16],
    pngBuffers[24],
    pngBuffers[32],
    pngBuffers[48],
    pngBuffers[64],
    pngBuffers[128],
    pngBuffers[256]
  ];

  try {
    const icoBuffer = await pngToIco(icoInputBuffers);
    const outIcoPath = path.join(buildDir, 'icon.ico');
    fs.writeFileSync(outIcoPath, icoBuffer);
    console.log(`✓ Guardado con éxito: build/icon.ico (${icoBuffer.length} bytes, 7 resoluciones nativas)`);
  } catch (err) {
    console.error('Error generando ICO con pngToIco:', err);
    process.exit(1);
  }

  console.log('== Icono del rayo para el .exe generado con éxito ==');
}

generateAllIcons().catch(err => {
  console.error('Error fatal al generar iconos:', err);
  process.exit(1);
});
