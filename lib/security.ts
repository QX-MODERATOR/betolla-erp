/**
 * End-to-End Payload Encryption & Decryption Utility for Betolla ERP
 * Uses native Web Crypto API (AES-GCM 256-bit) to encrypt client-to-server payloads,
 * preventing network inspectors and MITM proxies from inspecting payload contents.
 */

// Shared application payload secret key (derived into 256-bit AES-GCM key)
const PAYLOAD_SECRET = process.env.NEXT_PUBLIC_PAYLOAD_SECRET || "Betolla_Secure_Key_2026_AES_GCM_Secret_Salt_X99!";

/**
 * Derives an AES-GCM CryptoKey from a secret passphrase using SHA-256
 */
async function getKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest("SHA-256", enc.encode(PAYLOAD_SECRET));
  return crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(u8)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export interface EncryptedPackage {
  ciphertext: string;
  iv: string;
  ts: number;
}

/**
 * Encrypts any JSON object into an opaque hex ciphertext package
 */
export async function encryptPayload(data: any): Promise<EncryptedPackage> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit standard AES-GCM IV
  const enc = new TextEncoder();
  const jsonString = JSON.stringify(data);
  const encodedData = enc.encode(jsonString);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedData
  );

  return {
    ciphertext: bufferToHex(encryptedBuffer),
    iv: bufferToHex(iv),
    ts: Date.now(),
  };
}

/**
 * Decrypts an encrypted payload package back into the original object.
 * Throws an error if tampered with or if timestamp is older than 2 minutes (replay prevention).
 */
export async function decryptPayload(pkg: EncryptedPackage): Promise<any> {
  // 1. Replay attack prevention: must be within 120 seconds
  const now = Date.now();
  if (Math.abs(now - pkg.ts) > 120000) {
    throw new Error("Expired request timestamp (replay attack prevention triggered).");
  }

  const key = await getKey();
  const iv = hexToBuffer(pkg.iv);
  const cipherBuffer = hexToBuffer(pkg.ciphertext);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    cipherBuffer as BufferSource
  );

  const dec = new TextDecoder();
  const jsonString = dec.decode(decryptedBuffer);
  return JSON.parse(jsonString);
}
