const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;

// ═════════════════════════════════════════════════════════════════════════════
// GENERADOR OFICIAL DEL ICONO DE APLICACIÓN WINDOWS PARA HCPTOOLKIT
// Respeta estrictamente la fuente, glifos y el isotipo oficial del logo de HCP+
// Optimizado para Windows 11 / 10 (.exe, acceso directo, barra de tareas, etc.)
// ═════════════════════════════════════════════════════════════════════════════

const masterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Gradiente de fondo blanco cerámico / luminancia pura estilo Windows 11 Fluent -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="60%" stop-color="#F8FAFC"/>
      <stop offset="100%" stop-color="#F1F5F9"/>
    </linearGradient>

    <!-- Bisel de luz superior y marco perimetral metálico sutil -->
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.9"/>
      <stop offset="25%" stop-color="#E2E8F0"/>
      <stop offset="80%" stop-color="#CBD5E1"/>
      <stop offset="100%" stop-color="#94A3B8"/>
    </linearGradient>

    <!-- Resplandor interior suave para dar volumen táctil -->
    <linearGradient id="innerGlow" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.8"/>
      <stop offset="40%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>

    <!-- Gradiente de la Tríada Oficial: Lima Arquitectura, Rosa Ingeniería, Violeta Urbanismo -->
    <linearGradient id="triadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#84CC16"/>
      <stop offset="15%" stop-color="#A3E635"/>
      <stop offset="50%" stop-color="#FF006E"/>
      <stop offset="85%" stop-color="#8B5CF6"/>
      <stop offset="100%" stop-color="#6B35FF"/>
    </linearGradient>

    <!-- Sombra de profundidad multi-capa para destacar en cualquier fondo de Windows -->
    <filter id="iconDepthShadow" x="-12%" y="-12%" width="124%" height="128%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#0F172A" flood-opacity="0.14"/>
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0F172A" flood-opacity="0.08"/>
    </filter>

    <!-- Sombra sutil para la barra de tríada -->
    <filter id="triadGlow" x="-10%" y="-30%" width="120%" height="200%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#FF006E" flood-opacity="0.28"/>
    </filter>
  </defs>

  <!-- Base del Icono: Squircle de precisión moderna con acabado cerámico -->
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#bgGrad)" stroke="url(#borderGrad)" stroke-width="3" filter="url(#iconDepthShadow)"/>

  <!-- Capa de brillo superior de cristal / bisel sutil -->
  <rect x="18" y="18" width="476" height="238" rx="110" fill="url(#innerGlow)" opacity="0.7" pointer-events="none"/>

  <!-- Rejilla técnica arquitectónica de diseño (CAD / Blueprint Studio) -->
  <g stroke="#0F172A" stroke-opacity="0.04" stroke-width="1.2">
    <!-- Líneas de rejilla -->
    <line x1="64" y1="160" x2="448" y2="160" />
    <line x1="64" y1="256" x2="448" y2="256" />
    <line x1="64" y1="352" x2="448" y2="352" />
    <line x1="160" y1="64" x2="160" y2="448" />
    <line x1="256" y1="64" x2="256" y2="448" />
    <line x1="352" y1="64" x2="352" y2="448" />
  </g>

  <!-- Puntos de mira / cruces técnicas en intersecciones arquitectónicas -->
  <g stroke="#0F172A" stroke-opacity="0.07" stroke-width="1">
    <path d="M 156 160 H 164 M 160 156 V 164" />
    <path d="M 348 160 H 356 M 352 156 V 164" />
    <path d="M 156 352 H 164 M 160 348 V 356" />
    <path d="M 348 352 H 356 M 352 348 V 356" />
  </g>

  <!-- Logotipo Oficial HCP + Vector Exacto y Proporciones Óptimas para Icono de App -->
  <!-- Ancho total de glifos: 786px. Con scale=0.535 -> 420.5px. Centrado horizontal perfecto: (512 - 420.5)/2 = 45.75px -->
  <g transform="translate(45.75, 170) scale(0.535)" fill="#0A0E1A">
    <!-- H (Glifo arquitectónico oficial con curva seccionada) -->
    <g transform="translate(0, 0)">
      <path d="M 0,0 H 34 V 83 H 126 V 117 H 68 C 48,117 34,136 34,160 V 200 H 0 V 83 H 34 C 16,83 0,64 0,40 Z" />
      <path d="M 126,0 H 160 V 200 H 126 Z" />
    </g>
    <!-- C (Glifo geométrico con apertura angular limpia) -->
    <g transform="translate(192, 0)">
      <path d="M 156,46 C 144,14 118,0 80,0 C 34,0 0,36 0,100 C 0,164 34,200 80,200 C 118,200 144,186 156,154 H 120 C 112,168 98,172 80,172 C 52,172 34,144 34,100 C 34,56 52,28 80,28 C 98,28 112,32 120,46 Z" />
    </g>
    <!-- P (Glifo con asta izquierda continua y bucle proporcional) -->
    <g transform="translate(380, 0)">
      <path d="M 0,0 H 92 C 128,0 154,18 154,60 C 154,102 128,120 92,120 H 34 V 200 H 0 Z M 34,28 V 92 H 90 C 108,92 120,82 120,60 C 120,38 108,28 90,28 Z" />
    </g>
    <!-- + (Isotipo Oficial HCP con cortes arquitectónicos y simetría rotacional 180°) -->
    <g transform="translate(586, 0)">
      <path d="M 83,0 H 117 V 83 H 200 V 117 H 83 C 103,117 117,136 117,160 V 200 H 83 V 117 H 0 V 83 H 117 C 97,83 83,64 83,40 Z" />
    </g>
  </g>

  <!-- Barra de Tríada de Marca Oficial (Architecture, Engineering, Urban Planning) -->
  <!-- Centrada ópticamente con resplandor cromático sutil -->
  <rect x="151" y="318" width="210" height="8" rx="4" fill="url(#triadGrad)" filter="url(#triadGlow)"/>

  <!-- Subtítulo Oficial URBAN PLANNING en tipografía técnica de alta legibilidad -->
  <text x="256" y="356" fill="#475569" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif" font-size="13.5" font-weight="800" letter-spacing="4.5" text-anchor="middle">URBAN PLANNING</text>
</svg>
`.trim();

async function main() {
  console.log('== Iniciando generación de iconos oficiales para Windows ==');

  // Guardar renderer/logo.svg actualizado
  const outLogoSvg = path.join(__dirname, '..', 'renderer', 'logo.svg');
  fs.writeFileSync(outLogoSvg, masterSvg + '\n', 'utf8');
  console.log('✓ Escrito: renderer/logo.svg (Master Vector 512x512)');

  // Guardar también renderer/logo-icon.svg
  const outLogoIconSvg = path.join(__dirname, '..', 'renderer', 'logo-icon.svg');
  fs.writeFileSync(outLogoIconSvg, masterSvg + '\n', 'utf8');
  console.log('✓ Escrito: renderer/logo-icon.svg');

  // Asegurar existencia de directorio build
  const buildDir = path.join(__dirname, '..', 'build');
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
    console.log('✓ Directorio build/ creado');
  }

  // Renderizar PNGs a múltiples resoluciones de alta fidelidad con Resvg
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
  const pngBuffers = {};

  for (const size of sizes) {
    const resvg = new Resvg(masterSvg, {
      fitTo: { mode: 'width', value: size }
    });
    const png = resvg.render().asPng();
    pngBuffers[size] = png;
    console.log(`✓ Renderizado PNG: ${size}x${size} (${png.length} bytes)`);
  }

  // Guardar renderer/logo.png (512x512)
  fs.writeFileSync(path.join(__dirname, '..', 'renderer', 'logo.png'), pngBuffers[512]);
  console.log('✓ Guardado: renderer/logo.png (512x512)');

  // Guardar build/icon.png (512x512)
  fs.writeFileSync(path.join(buildDir, 'icon.png'), pngBuffers[512]);
  console.log('✓ Guardado: build/icon.png (512x512)');

  // Guardar renderer/favicon.png (64x64)
  fs.writeFileSync(path.join(__dirname, '..', 'renderer', 'favicon.png'), pngBuffers[64]);
  console.log('✓ Guardado: renderer/favicon.png (64x64)');

  // Generar build/icon.ico multi-resolución profesional para Windows
  // Incluye 16x16, 24x24, 32x32, 48x48, 64x64, 128x128 y 256x256
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

  console.log('== Generación de iconos completada exitosamente ==');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
