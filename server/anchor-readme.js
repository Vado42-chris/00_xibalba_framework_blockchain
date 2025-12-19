#!/usr/bin/env node
/**
 * anchor-readme.js
 *
 * Purpose:
 *  - Canonicalize a README (or any text file) into a deterministic byte form
 *  - Compute SHA256 of the canonical content
 *  - Create a canonical anchor JSON record and write it to `blockchain/memory_system/<sha>.json`
 *  - Sign the anchor with an Ed25519 keypair stored under `.keys/` (optional)
 *  - Verify an anchor record and its signature
 *
 * Additions in this version:
 *  - Accepts `--owner` and `--payout` flags for the `create` command.
 *    These values are included in the anchor JSON and are part of the signed payload.
 *  - README snippet produced includes Owner and Payout lines so marketplace/backends can
 *    read routing/provenance information directly from README.
 *
 * CLI:
 *  node server/anchor-readme.js init-keys
 *    -> generate .keys/anchor_key.pem (private) and .keys/anchor_pub.pem (public)
 *
 *  node server/anchor-readme.js create --file README.md --summary "short summary" --author "me" --owner seed001 --payout <address>
 *    -> canonicalizes README.md, computes sha256, writes anchor JSON to blockchain/memory_system/<sha>.json
 *       writes signature to blockchain/memory_system/<sha>.sig (if keys exist or are generated)
 *
 *  node server/anchor-readme.js verify --sha <sha> [--file README.md]
 *    -> verifies the anchored record exists and the signature is valid. If --file is given,
 *       re-computes the canonical SHA of the file and checks it matches the anchored sha.
 *
 *  node server/anchor-readme.js show --sha <sha>
 *    -> pretty prints the anchored record and signature info
 *
 * Security notes:
 *  - The private key is stored under `.keys/anchor_key.pem` and should never be committed.
 *  - The public key fingerprint should be published in a trusted place (org site / contract / DNS).
 *  - Anchors written to `blockchain/memory_system` are local by default. To make anchors globally
 *    available you should publish the JSON to a public immutable store (IPFS/CID) and optionally
 *    anchor the CID on-chain.
 *
 * Determinism:
 *  - Canonicalization normalizes line endings to LF, trims trailing whitespace per-line,
 *    normalizes Unicode to NFC, and ensures a final single newline.
 *
 */

import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import crypto from "crypto";

const LEDGER_DIR = path.resolve(process.cwd(), "blockchain", "memory_system");
const KEYS_DIR = path.resolve(process.cwd(), ".keys");
const PRIV_KEY_PATH = path.join(KEYS_DIR, "anchor_key.pem");
const PUB_KEY_PATH = path.join(KEYS_DIR, "anchor_pub.pem");
const GITIGNORE_PATH = path.resolve(process.cwd(), ".gitignore");
const CANONICAL_VERSION = "anchor-readme-v1";

/* ------------------------------ Utilities ------------------------------ */

function ensureDirSync(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    // ignore
  }
}

async function ensureDir(dir) {
  try {
    await fsPromises.mkdir(dir, { recursive: true });
  } catch (e) {
    // ignore
  }
}

function toNFC(str) {
  return str && str.normalize ? str.normalize("NFC") : str;
}

/**
 * Canonicalize a text Buffer or string deterministically.
 * - Normalize Unicode (NFC)
 * - Normalize CRLF -> LF
 * - Trim trailing whitespace on each line
 * - Ensure single trailing newline
 *
 * Returns a Buffer (UTF-8) suitable for hashing or writing.
 */
async function canonicalizeFile(filePath) {
  const raw = await fsPromises.readFile(filePath, "utf8");
  return canonicalizeText(raw);
}

function canonicalizeText(raw) {
  let s = String(raw);
  // Remove BOM
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  // Normalize
  s = toNFC(s);
  // Normalize CRLF -> LF
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Remove trailing spaces on each line
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .join("\n");
  // Ensure single trailing newline
  if (!s.endsWith("\n")) s += "\n";
  return Buffer.from(s, "utf8");
}

function computeSha256Buffer(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function writeJsonAtomic(filePath, obj) {
  const tmp = `${filePath}.tmp`;
  await fsPromises.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
  await fsPromises.rename(tmp, filePath);
}

/* ------------------------------ Keys & Signing ------------------------------ */

/**
 * Generate an Ed25519 keypair and persist to .keys/
 * - private: PEM PKCS8
 * - public: PEM SPKI
 */
function generateKeypair() {
  ensureDirSync(KEYS_DIR);
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  fs.writeFileSync(PRIV_KEY_PATH, privateKey, { mode: 0o600 });
  fs.writeFileSync(PUB_KEY_PATH, publicKey, { mode: 0o644 });
  // Add .keys to .gitignore if not present
  try {
    const gi = fs.existsSync(GITIGNORE_PATH)
      ? fs.readFileSync(GITIGNORE_PATH, "utf8")
      : "";
    if (!gi.split("\n").includes(".keys")) {
      fs.appendFileSync(
        GITIGNORE_PATH,
        (gi && !gi.endsWith("\n") ? "\n" : "") + ".keys\n",
      );
    }
  } catch (e) {
    // ignore
  }
  return { publicKey, privateKey };
}

function loadKeys() {
  if (!fs.existsSync(PRIV_KEY_PATH) || !fs.existsSync(PUB_KEY_PATH)) {
    return null;
  }
  const priv = fs.readFileSync(PRIV_KEY_PATH, "utf8");
  const pub = fs.readFileSync(PUB_KEY_PATH, "utf8");
  return { privateKey: priv, publicKey: pub };
}

/**
 * Sign a canonical JSON string (Buffer) using the private key (Ed25519).
 * Returns base64 signature.
 */
function signBuffer(privateKeyPem, buf) {
  const sig = crypto.sign(null, buf, {
    key: privateKeyPem,
    dsaEncoding: "ieee-p1363",
  });
  return sig.toString("base64");
}

/**
 * Verify a signature (base64) against buffer using publicKeyPem.
 * Returns boolean.
 */
function verifyBuffer(publicKeyPem, buf, signatureBase64) {
  try {
    const sig = Buffer.from(signatureBase64, "base64");
    return crypto.verify(null, buf, publicKeyPem, sig);
  } catch (e) {
    return false;
  }
}

/**
 * Compute a compact fingerprint for the public key (sha256 of SPKI DER).
 * Returns hex string.
 */
function pubkeyFingerprint(publicKeyPem) {
  try {
    const keyObj = crypto.createPublicKey(publicKeyPem);
    const spki = keyObj.export({ type: "spki", format: "der" });
    return crypto.createHash("sha256").update(spki).digest("hex");
  } catch (e) {
    return null;
  }
}

/* ------------------------------ Anchor operations ------------------------------ */

/**
 * Build canonical anchor JSON object for given data.
 * Includes owner and payoutAddress when provided.
 */
function buildAnchorObject({
  sha256,
  sizeBytes,
  filePath,
  summary = "",
  author = null,
  owner = null,
  payoutAddress = null,
  metadata = {},
} = {}) {
  return {
    version: CANONICAL_VERSION,
    content: {
      type: "sha256",
      value: sha256,
      sizeBytes: sizeBytes || null,
      path: filePath || null,
    },
    summary: summary || null,
    author: author || null,
    owner: owner || null,
    payoutAddress: payoutAddress || null,
    metadata: metadata || null,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Canonical JSON stringify with stable key ordering.
 * For our small anchor structs this deterministic method is sufficient.
 */
function canonicalJson(obj) {
  function sortKeys(v) {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(sortKeys);
    const out = {};
    for (const k of Object.keys(v).sort()) {
      out[k] = sortKeys(v[k]);
    }
    return out;
  }
  const sorted = sortKeys(obj);
  return JSON.stringify(sorted, null, 2);
}

/**
 * Create an anchor for a file (path is relative or absolute).
 * Steps:
 *  - canonicalize file content -> Buffer
 *  - compute SHA256 and size
 *  - build anchor JSON -> canonical JSON bytes (sorted keys)
 *  - sign anchor bytes with private key -> base64 signature
 *  - write anchor JSON to LEDGER_DIR/<sha>.json and signature to LEDGER_DIR/<sha>.sig
 *
 * Returns { sha, anchorPath, sigPath, anchorObj }
 */
export async function createAnchorForFile({
  filePath,
  summary = "",
  author = null,
  owner = null,
  payoutAddress = null,
  metadata = {},
} = {}) {
  if (!filePath) throw new Error("filePath required");
  await ensureDir(LEDGER_DIR);
  // canonicalize file
  const canonicalBuf = await canonicalizeFile(filePath);
  const sha = computeSha256Buffer(canonicalBuf);
  const sizeBytes = canonicalBuf.length;
  const anchorObj = buildAnchorObject({
    sha256: sha,
    sizeBytes,
    filePath,
    summary,
    author,
    owner,
    payoutAddress,
    metadata,
  });
  const anchorJson = canonicalJson(anchorObj);
  const anchorBuf = Buffer.from(anchorJson, "utf8");

  // ensure keys exist (generate if missing)
  let keys = loadKeys();
  if (!keys) {
    console.log(
      "Keys not found; generating new Ed25519 keypair under .keys/ (private key will be created).",
    );
    const { publicKey, privateKey } = generateKeypair();
    keys = { publicKey, privateKey };
  }

  // sign anchor JSON
  const signatureBase64 = signBuffer(keys.privateKey, anchorBuf);

  // write anchor and signature atomically
  const outJsonPath = path.join(LEDGER_DIR, `${sha}.json`);
  const outSigPath = path.join(LEDGER_DIR, `${sha}.sig`);

  await writeJsonAtomic(outJsonPath, anchorObj);
  await fsPromises.writeFile(`${outSigPath}.tmp`, signatureBase64, "utf8");
  await fsPromises.rename(`${outSigPath}.tmp`, outSigPath);

  return {
    sha,
    anchorPath: outJsonPath,
    sigPath: outSigPath,
    anchorObj,
    signatureBase64,
    publicKeyPem: keys.publicKey,
  };
}

/**
 * Verify an anchor by SHA:
 *  - ensure LEDGER_DIR/<sha>.json exists
 *  - read the JSON and signature
 *  - verify the signature with public key (.keys/anchor_pub.pem)
 *  - optionally, if a filePath is provided, canonicalize that file and verify computed sha matches the anchor's sha
 *
 * Returns { ok: boolean, details: { signatureValid, fileMatches, anchorObj } }
 */
export async function verifyAnchorBySha({ sha, filePath = null } = {}) {
  if (!sha) throw new Error("sha required");
  const outJsonPath = path.join(LEDGER_DIR, `${sha}.json`);
  const outSigPath = path.join(LEDGER_DIR, `${sha}.sig`);
  if (!fs.existsSync(outJsonPath)) {
    return { ok: false, details: { error: "anchor record not found" } };
  }
  if (!fs.existsSync(outSigPath)) {
    return { ok: false, details: { error: "signature file not found" } };
  }
  const anchorTxt = await fsPromises.readFile(outJsonPath, "utf8");
  let anchorObj = null;
  try {
    anchorObj = JSON.parse(anchorTxt);
  } catch (e) {
    return { ok: false, details: { error: "invalid anchor JSON" } };
  }
  const sigTxt = (await fsPromises.readFile(outSigPath, "utf8")).trim();
  const keys = loadKeys();
  if (!keys) {
    return {
      ok: false,
      details: {
        error:
          "local public key not available for verification (put .keys/anchor_pub.pem in repo or provide externally)",
      },
    };
  }
  // canonicalize anchor JSON in same deterministic way
  const canonicalAnchorJson = canonicalJson(anchorObj);
  const anchorBuf = Buffer.from(canonicalAnchorJson, "utf8");
  const signatureValid = verifyBuffer(keys.publicKey, anchorBuf, sigTxt);

  let fileMatches = null;
  if (filePath) {
    if (!fs.existsSync(filePath)) {
      fileMatches = false;
    } else {
      const canonicalFile = await canonicalizeFile(filePath);
      const computed = computeSha256Buffer(canonicalFile);
      fileMatches = computed === sha;
    }
  }

  const ok = signatureValid && (filePath ? fileMatches : true);
  return { ok, details: { signatureValid, fileMatches, anchorObj } };
}

/* ------------------------------ CLI wiring ------------------------------ */

function usageAndExit(code = 1) {
  console.error(`
Usage:
  node server/anchor-readme.js init-keys
      -> generate .keys/ed25519 keypair (private & public)

  node server/anchor-readme.js create --file README.md [--summary "short text"] [--author "you"] [--owner seed001] [--payout <address>]
      -> canonicalize file, compute sha, create anchor and sign it in ${LEDGER_DIR}

  node server/anchor-readme.js verify --sha <sha> [--file README.md]
      -> verify signature and (optionally) that file matches anchored sha

  node server/anchor-readme.js show --sha <sha>
      -> pretty print ledger entry and signature existence

Notes:
  - Private key is stored at ${PRIV_KEY_PATH}; keep it secret (do NOT commit).
  - Public key is stored at ${PUB_KEY_PATH}; publish its fingerprint in a trusted place.
`);
  process.exit(code);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) return usageAndExit();

  const cmd = argv[0];

  function argVal(flag) {
    const idx = argv.indexOf(flag);
    if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
    return null;
  }

  if (cmd === "init-keys") {
    if (fs.existsSync(PRIV_KEY_PATH) || fs.existsSync(PUB_KEY_PATH)) {
      console.log("Keys already exist at", KEYS_DIR);
      const keys = loadKeys();
      if (keys) {
        console.log("Existing public key:\n", keys.publicKey);
        console.log(
          "Public key fingerprint:",
          pubkeyFingerprint(keys.publicKey),
        );
      }
      return;
    }
    const { publicKey } = generateKeypair();
    console.log("Generated keys in", KEYS_DIR);
    console.log("Public key (publish/fingerprint):\n", publicKey);
    console.log("Fingerprint:", pubkeyFingerprint(publicKey));
    return;
  }

  if (cmd === "create") {
    const file = argVal("--file");
    if (!file) {
      console.error("Missing --file");
      return usageAndExit();
    }
    const summary = argVal("--summary") || "";
    const author = argVal("--author") || null;
    const owner = argVal("--owner") || null;
    const payout = argVal("--payout") || null;
    if (!fs.existsSync(file)) {
      console.error("File not found:", file);
      process.exit(2);
    }
    const res = await createAnchorForFile({
      filePath: file,
      summary,
      author,
      owner,
      payoutAddress: payout,
    });
    console.log("Anchor written:");
    console.log("  sha:", res.sha);
    console.log("  anchor:", res.anchorPath);
    console.log("  signature:", res.sigPath);
    if (res.publicKeyPem) {
      console.log(
        "  signerPublicKeyFingerprint:",
        pubkeyFingerprint(res.publicKeyPem),
      );
    }

    // Print a compact README snippet (safe to paste)
    const snippetLines = [];
    snippetLines.push("<!-- ANCHOR START -->");
    snippetLines.push(`Anchor-SHA256: ${res.sha}`);
    if (owner) snippetLines.push(`Owner: ${owner}`);
    if (payout) snippetLines.push(`Payout: ${payout}`);
    if (res.publicKeyPem)
      snippetLines.push(
        `Signer: sha256:${pubkeyFingerprint(res.publicKeyPem)}`,
      );
    if (summary) snippetLines.push(`Summary: ${summary}`);
    snippetLines.push("<!-- ANCHOR END -->");
    console.log("\nREADME snippet (paste into README.md):\n");
    console.log(snippetLines.join("\n"));

    return;
  }

  if (cmd === "verify" || cmd === "show") {
    const sha = argVal("--sha");
    if (!sha) {
      console.error("Missing --sha");
      return usageAndExit();
    }
    const file = argVal("--file");
    if (cmd === "show") {
      const anchorPath = path.join(LEDGER_DIR, `${sha}.json`);
      const sigPath = path.join(LEDGER_DIR, `${sha}.sig`);
      if (!fs.existsSync(anchorPath)) {
        console.error("Anchor not found:", anchorPath);
        process.exit(2);
      }
      const anchorTxt = await fsPromises.readFile(anchorPath, "utf8");
      console.log("Anchor JSON:");
      console.log(anchorTxt);
      if (fs.existsSync(sigPath)) {
        console.log("\nSignature exists at:", sigPath);
        const sigTxt = (await fsPromises.readFile(sigPath, "utf8")).trim();
        console.log(
          "Signature (base64):",
          sigTxt.slice(0, 80) + (sigTxt.length > 80 ? "..." : ""),
        );
      } else {
        console.log("\nSignature not found at:", sigPath);
      }
      return;
    }

    const v = await verifyAnchorBySha({ sha, filePath: file });
    if (!v.ok) {
      console.error("Verification failed:", v.details);
      process.exit(3);
    } else {
      console.log("Verification OK:", v.details);
      if (v.details.anchorObj) {
        const a = v.details.anchorObj;
        console.log("\nAnchor details (summary):");
        console.log("  summary:", a.summary);
        console.log("  author:", a.author);
        console.log("  owner:", a.owner);
        console.log("  payoutAddress:", a.payoutAddress);
        console.log("  timestamp:", a.timestamp);
      }
      return;
    }
  }

  usageAndExit();
}

/* If invoked directly, run main() */
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("anchor-readme.js")
) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(4);
  });
}
