// Strips personal identifiers from a copied export directory before it's
// pushed to the public ac-server-manager repo. Run by publish-public.ps1,
// not directly. Order matters: multi-word/context-specific patterns run
// before the bare `shinobi` word swap, so a specific replacement doesn't
// get double-mangled by the generic one that follows it (same convention
// as imq2's tools/shinagent_sanitize.py).
const fs = require('fs')
const path = require('path')

const exportDir = process.argv[2]
if (!exportDir) {
  console.error('Usage: node sanitize-public-export.js <export-dir>')
  process.exit(1)
}

const SCRUB_EXTS = new Set(['.js', '.jsx', '.json', '.md', '.html', '.service', '.ps1'])

const PATTERNS = [
  [/placeholder="e\.g\. shinobi"/g, 'placeholder="e.g. yourhandle"'],
  [/\bshinobi\b/g, 'your-pi'],
  [/192\.168\.1\.203/g, '192.168.1.100'],
]

let scrubbedCount = 0
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      walk(full)
    } else if (SCRUB_EXTS.has(path.extname(entry.name))) {
      const text = fs.readFileSync(full, 'utf8')
      let next = text
      for (const [pattern, replacement] of PATTERNS) {
        next = next.replace(pattern, replacement)
      }
      if (next !== text) {
        fs.writeFileSync(full, next, 'utf8')
        scrubbedCount++
        console.log(`  scrubbed: ${path.relative(exportDir, full)}`)
      }
    }
  }
}

walk(exportDir)
console.log(`Sanitize: ${scrubbedCount} file(s) updated`)
