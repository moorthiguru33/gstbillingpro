// Tiny EAN-13 renderer for tests / fake camera videos (no deps).
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = L.map(c => [...c].map(b => (b === '1' ? '0' : '1')).reverse().join(''));
const R = L.map(c => [...c].map(b => (b === '1' ? '0' : '1')).join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function ean13Check(d12) {
  const s = [...d12].reduce((a, ch, i) => a + Number(ch) * (i % 2 ? 3 : 1), 0);
  return String((10 - (s % 10)) % 10);
}
export function ean13Modules(code) {
  const c = code.length === 12 ? code + ean13Check(code) : code;
  const first = Number(c[0]);
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (PARITY[first][i - 1] === 'L' ? L : G)[Number(c[i])];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[Number(c[i])];
  return bits + '101';
}
// Luminance image (0 = black) with quiet zones; `mod` px per module.
export function ean13Image(code, { mod = 3, height = 120, width, offsetX } = {}) {
  const bits = ean13Modules(code);
  const w = width || (bits.length + 22) * mod;
  const ox = offsetX ?? Math.floor((w - bits.length * mod) / 2);
  const img = new Uint8ClampedArray(w * height).fill(255);
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] !== '1') continue;
      for (let k = 0; k < mod; k++) img[y * w + ox + i * mod + k] = 0;
    }
  }
  return { luminance: img, width: w, height };
}
