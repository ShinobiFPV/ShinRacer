// Generates resources/icon.ico — the Electron app's window/installer/shortcut
// icon — as a real, valid multi-resolution .ico using only Node's built-in
// `zlib` (no canvas/sharp/image library — none has a prebuilt binary for this
// environment's Node/win32 combo, the same native-dependency gap documented
// for better-sqlite3 in Phases 4/6 and mmap-io in Phase 9). This fills the
// "known pre-existing gap" flagged in docs/RELEASING.md and CLAUDE.md's
// Phase 12 notes (package.json referenced resources/icon.ico, but the file
// never existed).
//
// Same technique, same brand mark, and the same bitmap font as
// pwa/scripts/generate-icons.js (the PWA's home-screen icon) — the desktop
// app and the mobile app now share one visual identity — adapted to emit
// RGBA PNGs (Windows .ico wants 32bpp) wrapped in a real ICONDIR container
// instead of standalone PNG files.
//
// Run manually: node scripts/generate-icon.js
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const BG = [0x05, 0x05, 0x07]   // C.bg
const FG = [0x00, 0x66, 0xff]   // C.blue

// 5x7 bitmap font, just enough for "S" and "R" — identical to the PWA's.
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

// RGBA (color type 6, 32bpp) rather than the PWA script's RGB — a Windows
// .ico's PNG-format entries are conventionally 32bpp, and Explorer/taskbar
// rendering is most consistent with an explicit (even fully-opaque) alpha
// channel present.
function encodePNG(width, height, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8   // bit depth
  ihdrData[9] = 6   // color type: RGBA
  ihdrData[10] = 0  // compression
  ihdrData[11] = 0  // filter
  ihdrData[12] = 0  // interlace
  const ihdr = chunk('IHDR', ihdrData)

  // One filter-type byte (0 = None) per scanline, then raw RGBA bytes.
  const raw = Buffer.alloc(height * (1 + width * 4))
  let offset = 0
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixels[y * width + x]
      raw[offset++] = r
      raw[offset++] = g
      raw[offset++] = b
      raw[offset++] = a
    }
  }
  const idat = chunk('IDAT', zlib.deflateSync(raw))
  const iend = chunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdr, idat, iend])
}

function generateIconPixels(size) {
  const pixels = new Array(size * size).fill([...BG, 255])

  const cols = 5 + 1 + 5 // S, 1-col gap, R
  const rows = 7
  const scale = Math.max(1, Math.floor(size / 15))
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
            if (px >= 0 && px < size && py >= 0 && py < size) pixels[py * size + px] = [...FG, 255]
          }
        }
      }
    }
  }
  // Too small to read two letters legibly at 16px — just the "R" accent,
  // same call the PWA's maskable-icon variant makes for its own tightest case.
  if (size < 24) {
    plot(GLYPH_R, Math.floor((cols - 5) / 2))
  } else {
    plot(GLYPH_S, 0)
    plot(GLYPH_R, 6)
  }

  return pixels
}

function buildIco(sizes) {
  const images = sizes.map(size => ({ size, png: encodePNG(size, size, generateIconPixels(size)) }))

  const headerSize = 6
  const dirEntrySize = 16
  const dataStart = headerSize + dirEntrySize * images.length

  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)          // reserved
  header.writeUInt16LE(1, 2)          // type: 1 = icon
  header.writeUInt16LE(images.length, 4)

  let offset = dataStart
  const dirEntries = []
  for (const { size, png } of images) {
    const entry = Buffer.alloc(dirEntrySize)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)   // width (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)   // height (0 means 256)
    entry.writeUInt8(0, 2)     // color count (0 = no palette, true color)
    entry.writeUInt8(0, 3)     // reserved
    entry.writeUInt16LE(1, 4)  // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    dirEntries.push(entry)
    offset += png.length
  }

  return Buffer.concat([header, ...dirEntries, ...images.map(i => i.png)])
}

const SIZES = [16, 32, 48, 256]
const ico = buildIco(SIZES)
const outPath = path.join(__dirname, '..', 'resources', 'icon.ico')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, ico)
console.log(`Wrote ${outPath} (${SIZES.join('/')} px, ${ico.length} bytes)`)
