// Generates the three PNG icons manifest.json needs (icon-192, icon-512,
// icon-maskable) as real, valid PNG files using only Node's built-in `zlib`
// (no canvas/sharp/image library — none has a prebuilt binary for this
// environment's Node/win32 combo, the same native-dependency gap documented
// for better-sqlite3 in Phases 4/6 and mmap-io in Phase 9). Content is a
// simple pixel-font "SR" mark on the brand background rather than real
// rendered Rubik Mono One glyphs — see CLAUDE.md's Phase 10 notes for why, and
// swap in real artwork before shipping to users if that matters.
//
// Run manually: node pwa/scripts/generate-icons.js
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const BG = [0x05, 0x05, 0x07]   // C.bg
const FG = [0x00, 0x66, 0xff]   // C.blue

// 5x7 bitmap font, just enough for "S" and "R".
const GLYPH_S = [
  '01110',
  '10001',
  '10000',
  '01110',
  '00001',
  '10001',
  '01110',
]
const GLYPH_R = [
  '11110',
  '10001',
  '10001',
  '11110',
  '10100',
  '10010',
  '10001',
]

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function encodePNG(width, height, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8   // bit depth
  ihdrData[9] = 2   // color type: RGB
  ihdrData[10] = 0  // compression
  ihdrData[11] = 0  // filter
  ihdrData[12] = 0  // interlace
  const ihdr = chunk('IHDR', ihdrData)

  // One filter-type byte (0 = None) per scanline, then raw RGB bytes.
  const raw = Buffer.alloc(height * (1 + width * 3))
  let offset = 0
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixels[y * width + x]
      raw[offset++] = r
      raw[offset++] = g
      raw[offset++] = b
    }
  }
  const idat = chunk('IDAT', zlib.deflateSync(raw))
  const iend = chunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdr, idat, iend])
}

function generateIcon(size, { maskable = false } = {}) {
  const pixels = new Array(size * size).fill(BG)

  const cols = 5 + 1 + 5 // S, 1-col gap, R
  const rows = 7
  // Maskable icons need their meaningful content inside the center ~80%-diameter
  // safe-zone circle — a smaller scale keeps the letter block well inside it.
  const scale = Math.max(1, Math.floor(size / (maskable ? 26 : 15)))
  const blockW = cols * scale
  const blockH = rows * scale
  const startX = Math.floor((size - blockW) / 2)
  const startY = Math.floor((size - blockH) / 2)

  const plot = (glyph, glyphStartCol) => {
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] !== '1') continue
        const px0 = startX + (glyphStartCol + gx) * scale
        const py0 = startY + gy * scale
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const px = px0 + dx, py = py0 + dy
            if (px >= 0 && px < size && py >= 0 && py < size) pixels[py * size + px] = FG
          }
        }
      }
    }
  }
  plot(GLYPH_S, 0)
  plot(GLYPH_R, 6)

  return encodePNG(size, size, pixels)
}

const outDir = path.join(__dirname, '..', 'public', 'icons')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'icon-192.png'), generateIcon(192))
fs.writeFileSync(path.join(outDir, 'icon-512.png'), generateIcon(512))
fs.writeFileSync(path.join(outDir, 'icon-maskable.png'), generateIcon(512, { maskable: true }))
console.log('Wrote icon-192.png, icon-512.png, icon-maskable.png to', outDir)
