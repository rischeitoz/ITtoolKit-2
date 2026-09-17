const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const svgPath = path.join(__dirname, '..', 'renderer', 'logo.svg');
const svgContent = fs.readFileSync(svgPath, 'utf8');

// 1. Generar PNG de 512x512 para renderer/logo.png
const resvg512 = new Resvg(svgContent, {
  fitTo: { mode: 'width', value: 512 }
});
const pngData512 = resvg512.render();
const pngBuffer512 = pngData512.asPng();

const outRendererLogo = path.join(__dirname, '..', 'renderer', 'logo.png');
fs.writeFileSync(outRendererLogo, pngBuffer512);
console.log('Generado renderer/logo.png (512x512)');

// 2. Crear carpeta build si no existe
const buildDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// 3. Escribir build/icon.png
const outBuildPng = path.join(buildDir, 'icon.png');
fs.writeFileSync(outBuildPng, pngBuffer512);
console.log('Generado build/icon.png (512x512)');

// 4. Generar 256x256 para build/icon.ico (Formato ICO con contenedor PNG)
const resvg256 = new Resvg(svgContent, {
  fitTo: { mode: 'width', value: 256 }
});
const pngBuffer256 = resvg256.render().asPng();

// Cabecera ICO (ICONDIR: 6 bytes) + Entrada (ICONDIRENTRY: 16 bytes) + PNG Payload
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // Reservado
icoHeader.writeUInt16LE(1, 2); // Tipo 1 = ICO
icoHeader.writeUInt16LE(1, 4); // 1 imagen

const icoEntry = Buffer.alloc(16);
icoEntry.writeUInt8(0, 0); // Ancho 256 = 0
icoEntry.writeUInt8(0, 1); // Alto 256 = 0
icoEntry.writeUInt8(0, 2); // Paleta de colores
icoEntry.writeUInt8(0, 3); // Reservado
icoEntry.writeUInt16LE(1, 4); // Planos de color
icoEntry.writeUInt16LE(32, 6); // BPP
icoEntry.writeUInt32LE(pngBuffer256.length, 8); // Tamaño del archivo PNG
icoEntry.writeUInt32LE(22, 12); // Offset (6 + 16 = 22)

const icoBuffer = Buffer.concat([icoHeader, icoEntry, pngBuffer256]);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);
console.log('Generado build/icon.ico (256x256)');

// 5. Generar renderer/favicon.png (64x64)
const resvg64 = new Resvg(svgContent, {
  fitTo: { mode: 'width', value: 64 }
});
const pngBuffer64 = resvg64.render().asPng();
fs.writeFileSync(path.join(__dirname, '..', 'renderer', 'favicon.png'), pngBuffer64);
console.log('Generado renderer/favicon.png (64x64)');
