/**
 * Anchor helper for workspace snapshots
 *
 * - Writes anchor records into blockchain/memory_system as JSON files named by SHA256
 * - Verifies anchors by recomputing SHA and comparing to stored record
 *
 * Usage (examples):
 *   import { anchorSnapshot, verifyAnchor, listAnchors } from './server/anchor.js'
 *
 *   const anchor = await anchorSnapshot({
 *     snapshotPath: '/path/to/_incoming/snapshot-123.tar.gz',
 *     branch: 'salvage/autosave-123',
 *     summary: 'Short summary: fixed build, added HybridPanel',
 *     author: 'chrisha+',
 *     metadata: { note: 'manual snapshot before deploy' }
 *   })
 *
 *   const ok = await verifyAnchor(anchor.sha256, anchor.snapshotPath)
 *
 * Notes:
 * - This module is intentionally local-only and has no external network behavior.
 * - Protect access to the ledger directory (blockchain/memory_system) and keep keys off-repo.
 */

import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import crypto from 'crypto'

const LEDGER_DIR = path.resolve(process.cwd(), 'blockchain', 'memory_system')

async function ensureLedgerDir() {
  try {
    await fs.mkdir(LEDGER_DIR, { recursive: true })
  } catch (err) {
    // best-effort; propagate later if needed
  }
}

/**
 * Compute SHA256 hex digest for a file at given path.
 * Returns { sha, size }.
 */
export async function computeFileSha256(filePath) {
  if (!fsSync.existsSync(filePath)) {
    throw new Error(`computeFileSha256: file not found: ${filePath}`)
  }

  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    let size = 0
    const stream = fsSync.createReadStream(filePath)
    stream.on('data', (chunk) => {
      size += chunk.length
      hash.update(chunk)
    })
    stream.on('end', () => {
      resolve({ sha: hash.digest('hex'), size })
    })
    stream.on('error', (err) => reject(err))
  })
}

/**
 * Create an anchor record for a snapshot file.
 *
 * snapshotPath - absolute or relative path to the snapshot tar/gzip file
 * branch       - branch name string (e.g., salvage/autosave-123)
 * summary      - human-readable short summary (string)
 * author       - optional author identifier
 * metadata     - optional object with additional fields to include in the record
 *
 * Returns an object: { sha, outPath, record } where outPath is the ledger JSON path.
 */
export async function anchorSnapshot({ snapshotPath, branch = null, summary = '', author = 'unknown', metadata = {} } = {}) {
  if (!snapshotPath) throw new Error('anchorSnapshot: snapshotPath required')

  // Resolve path relative to project root
  const resolved = path.resolve(process.cwd(), snapshotPath)

  if (!fsSync.existsSync(resolved)) {
    throw new Error(`anchorSnapshot: snapshot file does not exist: ${resolved}`)
  }

  await ensureLedgerDir()

  const { sha, size } = await computeFileSha256(resolved)

  const timestamp = new Date().toISOString()
  const record = {
    sha256: sha,
    snapshotPath: resolved,
    sizeBytes: size,
    branch: branch || null,
    summary: summary || null,
    author: author || null,
    metadata: metadata || null,
    timestamp,
  }

  const outFile = path.join(LEDGER_DIR, `${sha}.json`)
  // Write atomically: write to temp then rename
  const tmp = `${outFile}.tmp`
  await fs.writeFile(tmp, JSON.stringify(record, null, 2), 'utf8')
  await fs.rename(tmp, outFile)

  return { sha, outPath: outFile, record }
}

/**
 * Verify that an anchor exists and that the snapshot file matches the anchored SHA.
 * Returns { ok: boolean, record: object|null, computedSha?: string, error?: string }
 */
export async function verifyAnchor(sha, snapshotPath = null) {
  if (!sha) throw new Error('verifyAnchor: sha required')

  const ledgerFile = path.join(LEDGER_DIR, `${sha}.json`)
  if (!fsSync.existsSync(ledgerFile)) {
    return { ok: false, record: null, error: 'anchor record not found' }
  }

  const txt = await fs.readFile(ledgerFile, 'utf8')
  let record = null
  try {
    record = JSON.parse(txt)
  } catch (err) {
    return { ok: false, record: null, error: 'invalid anchor JSON' }
  }

  const targetPath = snapshotPath ? path.resolve(process.cwd(), snapshotPath) : record.snapshotPath
  if (!targetPath || !fsSync.existsSync(targetPath)) {
    return { ok: false, record, error: `snapshot not found: ${targetPath}` }
  }

  const { sha: computedSha, size } = await computeFileSha256(targetPath)
  const ok = computedSha === sha
  return { ok, record, computedSha, size }
}

/**
 * List anchor records present in the ledger directory.
 * Returns array of { sha, path, timestamp?, summary? } quickly reading each JSON.
 */
export async function listAnchors({ limit = 200 } = {}) {
  await ensureLedgerDir()
  const files = await fs.readdir(LEDGER_DIR)
  const jsonFiles = files.filter((f) => f.endsWith('.json')).slice(0, limit)
  const out = []
  for (const f of jsonFiles) {
    try {
      const txt = await fs.readFile(path.join(LEDGER_DIR, f), 'utf8')
      const rec = JSON.parse(txt)
      out.push({
        sha: rec.sha256 || path.basename(f, '.json'),
        path: path.join(LEDGER_DIR, f),
        timestamp: rec.timestamp || null,
        summary: rec.summary || null,
        branch: rec.branch || null,
      })
    } catch (err) {
      // skip bad file but include minimal info
      out.push({ sha: path.basename(f, '.json'), path: path.join(LEDGER_DIR, f), error: String(err) })
    }
  }
  return out
}

/**
 * Read an anchor record by sha (returns parsed record or null).
 */
export async function readAnchor(sha) {
  const file = path.join(LEDGER_DIR, `${sha}.json`)
  if (!fsSync.existsSync(file)) return null
  const txt = await fs.readFile(file, 'utf8')
  try {
    return JSON.parse(txt)
  } catch (err) {
    throw new Error(`readAnchor: invalid JSON for ${sha}`)
  }
}

/**
 * Remove an anchor record by sha (use with care).
 * This only removes the local ledger file; the snapshot tar remains untouched.
 */
export async function removeAnchor(sha) {
  const file = path.join(LEDGER_DIR, `${sha}.json`)
  if (!fsSync.existsSync(file)) return { removed: false, reason: 'not found' }
  await fs.unlink(file)
  return { removed: true }
}

export default {
  anchorSnapshot,
  verifyAnchor,
  listAnchors,
  readAnchor,
  removeAnchor,
}
