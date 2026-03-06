const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

/**
 * Derives a 32-byte key from the env variable.
 * Set FIELD_ENCRYPTION_KEY to exactly 64 hex characters (32 bytes).
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
function getKey() {
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('FIELD_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts a plaintext string.
 * Returns a string in the format: iv:authTag:ciphertext (all hex)
 */
function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a value previously encrypted with encrypt().
 * Returns the original plaintext, or null on failure.
 */
function decrypt(ciphertext) {
  if (!ciphertext) return ciphertext;
  // If it doesn't look like an encrypted value, return as-is (migration safety)
  if (!ciphertext.includes(':')) return ciphertext;
  try {
    const key = getKey();
    const [ivHex, authTagHex, dataHex] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
  } catch {
    return null; // Decryption failure — tampered or wrong key
  }
}

module.exports = { encrypt, decrypt };
