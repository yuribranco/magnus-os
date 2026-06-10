const sharp = require('sharp');
const W = 600, H = 600;

(async () => {
  // 1) Dama recolorida em cobre vivo: usa o alpha do icon como máscara → preenche com cobre
  const alpha = await sharp('app/icon.png').resize({ width: 230, height: 230, fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } }).extractChannel(3).toBuffer();
  const queen = await sharp({ create: { width: 230, height: 230, channels: 3, background: { r: 0xC8, g: 0x88, b: 0x46 } } })
    .joinChannel(alpha).png().toBuffer();

  // 2) Fundo + texto via SVG (paleta do design system: stone-900 → black, accent cobre)
  const svg = `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stop-color="#1C1917"/>
        <stop offset="55%" stop-color="#14110F"/>
        <stop offset="100%" stop-color="#0C0A09"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="34%" r="42%">
        <stop offset="0%"  stop-color="#C88846" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#C88846" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    <!-- moldura premium -->
    <rect x="20" y="20" width="${W-40}" height="${H-40}" rx="22" fill="none" stroke="#C88846" stroke-opacity="0.28" stroke-width="1.5"/>
    <!-- nome do produto -->
    <text x="300" y="430" text-anchor="middle" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="62" font-weight="700" letter-spacing="0.5">
      <tspan fill="#F5F3F0">Magnus</tspan><tspan fill="#C88846" dx="18">OS</tspan>
    </text>
    <!-- divisor -->
    <line x1="232" y1="460" x2="368" y2="460" stroke="#C88846" stroke-opacity="0.55" stroke-width="1.5"/>
    <!-- tagline -->
    <text x="300" y="492" text-anchor="middle" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="15.5" font-weight="500" letter-spacing="3.2" fill="#C19461">SISTEMA OPERACIONAL DO SEU NEGÓCIO</text>
  </svg>`;

  const base = await sharp(Buffer.from(svg)).png().toBuffer();

  // 3) Compõe a dama no topo
  await sharp(base)
    .composite([{ input: queen, top: 112, left: Math.round((W - 230) / 2) }])
    .png()
    .toFile('/tmp/magnus-cover/magnus-os-cover-600.png');

  const m = await sharp('/tmp/magnus-cover/magnus-os-cover-600.png').metadata();
  console.log('OK', m.width + 'x' + m.height, m.format);
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
