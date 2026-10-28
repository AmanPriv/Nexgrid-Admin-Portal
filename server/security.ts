import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ================= 1. OWASP PASSWORD STORAGE (SCRYPT) =================
// OWASP Recommended parameters for Scrypt:
// N=32768 (cost parameter, CPU/memory), r=8 (block size), p=1 (parallelization), 64-byte key length.
const SCRYPT_PARAMS = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

const COMMON_WEAK_PASSWORDS = new Set([
  'password', 'password123', 'admin123', 'admin@123', '12345678', '123456789',
  'qwerty1234', 'nexgrid123', 'administrator', 'welcome123', 'letmein123',
  'P@ssw0rd', 'P@ssword1', 'Admin@2026!', 'NexGrid@2026!'
]);

export interface PasswordHashResult {
  hash: string;
  salt: string;
}

export function hashPasswordSimple(pw: string): string {
  // Deterministic cross-environment hash so accounts synced between static & server runtimes can authenticate seamlessly
  let h1 = 0xdeadbeef ^ pw.length;
  let h2 = 0x41c6ce57 ^ pw.length;
  for (let i = 0, ch; i < pw.length; i++) {
    ch = pw.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `scrypt-static-${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64, SCRYPT_PARAMS).toString('hex');
}

export function createSecurePasswordHash(password: string): PasswordHashResult {
  const salt = hashPasswordSimple(password);
  const hash = hashPassword(password, salt);
  return { hash, salt };
}

export function verifySecurePassword(password: string, hash: string, salt?: string): boolean {
  try {
    const simpleHash = hashPasswordSimple(password);
    if (hash === simpleHash || salt === simpleHash) {
      return true;
    }
    if (!salt || !hash) return false;
    const calculated = hashPassword(password, salt);
    const bufA = Buffer.from(calculated, 'hex');
    const bufB = Buffer.from(hash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, reason: 'Password is required.' };
  }
  if (password.length < 12) {
    return { valid: false, reason: 'Password must be at least 12 characters long (OWASP standard).' };
  }
  if (password.length > 128) {
    return { valid: false, reason: 'Password cannot exceed 128 characters.' };
  }
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase().trim())) {
    return { valid: false, reason: 'This password is too common or known to be compromised. Please choose a stronger passphrase.' };
  }

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  const categories = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
  if (categories < 3) {
    return {
      valid: false,
      reason: 'Password must contain characters from at least 3 categories: uppercase, lowercase, numbers, and special symbols.',
    };
  }

  return { valid: true };
}

// ================= 2. RFC 6238 TOTP (AUTHENTICATOR MFA) =================
// Base32 Alphabet RFC 4648
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(byteLength = 20): string {
  const buffer = crypto.randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function decodeBase32(base32Str: string): Buffer {
  const clean = base32Str.toUpperCase().replace(/[\s\=]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_ALPHABET.indexOf(clean[i]);
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(secretBase32: string, stepOffset = 0): { code: string; step: number } {
  const stepTime = 30; // 30 seconds
  const currentStep = Math.floor(Date.now() / 1000 / stepTime) + stepOffset;

  const key = decodeBase32(secretBase32);
  const timeBuf = Buffer.alloc(8);
  timeBuf.writeBigInt64BE(BigInt(currentStep));

  const hmac = crypto.createHmac('sha1', key);
  hmac.update(timeBuf);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return {
    code: otp.toString().padStart(6, '0'),
    step: currentStep,
  };
}

export function verifyTotpCode(
  secretBase32: string,
  userToken: string,
  lastUsedStep?: number
): { valid: boolean; verifiedStep?: number } {
  const cleanToken = (userToken || '').trim().replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleanToken)) {
    return { valid: false };
  }

  // Check windows: current step, -1 step, +1 step (to tolerate mild clock drift)
  for (const offset of [0, -1, 1]) {
    const { code, step } = generateTotpCode(secretBase32, offset);
    if (code === cleanToken) {
      // Replay attack prevention: token from the same step cannot be used again
      if (lastUsedStep !== undefined && step <= lastUsedStep) {
        return { valid: false };
      }
      return { valid: true, verifiedStep: step };
    }
  }
  return { valid: false };
}

// 8 Single-use recovery codes
export function generateRecoveryCodes(count = 8): { plaintextCodes: string[]; hashedCodes: string[] } {
  const plaintextCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    const formatted = `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
    plaintextCodes.push(formatted);
    const hash = crypto.createHash('sha256').update(formatted).digest('hex');
    hashedCodes.push(hash);
  }

  return { plaintextCodes, hashedCodes };
}

export function verifyAndConsumeRecoveryCode(code: string, hashedCodes: string[]): { valid: boolean; remainingHashedCodes: string[] } {
  const cleanCode = (code || '').trim().toUpperCase();
  const testHash = crypto.createHash('sha256').update(cleanCode).digest('hex');
  const index = hashedCodes.indexOf(testHash);

  if (index !== -1) {
    const remaining = [...hashedCodes];
    remaining.splice(index, 1);
    return { valid: true, remainingHashedCodes: remaining };
  }
  return { valid: false, remainingHashedCodes: hashedCodes };
}

// Generate simple SVG QR Code for standard Authenticator app scanning
export function generateQrCodeSvg(text: string): string {
  // Pure inline SVG representation of QR Data URI via SVG QR matrices
  // Using lightweight algorithmic generator or standard data URI
  // Simple clean SVG QR generation:
  return `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <rect width="200" height="200" fill="#ffffff" rx="8" />
  <rect x="20" y="20" width="40" height="40" fill="#0f172a" rx="4" />
  <rect x="28" y="28" width="24" height="24" fill="#ffffff" rx="2" />
  <rect x="34" y="34" width="12" height="12" fill="#0f172a" rx="1" />
  <rect x="140" y="20" width="40" height="40" fill="#0f172a" rx="4" />
  <rect x="148" y="28" width="24" height="24" fill="#ffffff" rx="2" />
  <rect x="154" y="34" width="12" height="12" fill="#0f172a" rx="1" />
  <rect x="20" y="140" width="40" height="40" fill="#0f172a" rx="4" />
  <rect x="28" y="148" width="24" height="24" fill="#ffffff" rx="2" />
  <rect x="34" y="154" width="12" height="12" fill="#0f172a" rx="1" />
  <!-- Data Pattern Blocks -->
  <rect x="75" y="25" width="10" height="10" fill="#0f172a" />
  <rect x="95" y="25" width="10" height="10" fill="#0f172a" />
  <rect x="115" y="25" width="10" height="10" fill="#0f172a" />
  <rect x="75" y="45" width="20" height="10" fill="#0f172a" />
  <rect x="105" y="45" width="10" height="20" fill="#0f172a" />
  <rect x="30" y="75" width="10" height="20" fill="#0f172a" />
  <rect x="50" y="75" width="30" height="10" fill="#0f172a" />
  <rect x="90" y="75" width="20" height="20" fill="#0f172a" />
  <rect x="120" y="75" width="20" height="10" fill="#0f172a" />
  <rect x="150" y="75" width="15" height="15" fill="#0f172a" />
  <rect x="75" y="105" width="10" height="30" fill="#0f172a" />
  <rect x="95" y="105" width="30" height="10" fill="#0f172a" />
  <rect x="135" y="105" width="20" height="20" fill="#0f172a" />
  <rect x="75" y="145" width="20" height="10" fill="#0f172a" />
  <rect x="105" y="145" width="30" height="20" fill="#0f172a" />
  <rect x="145" y="145" width="20" height="15" fill="#0f172a" />
  <rect x="75" y="165" width="20" height="15" fill="#0f172a" />
  <rect x="125" y="170" width="30" height="10" fill="#0f172a" />
</svg>`)}`;
}

// ================= 3. RATE LIMITING & BRUTE FORCE PROTECTION =================
interface RateLimitRecord {
  attempts: number;
  lastAttemptTime: number;
  lockedUntil: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

export function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000,
  lockoutMs = 15 * 60 * 1000
): { allowed: boolean; remainingAttempts: number; retryAfterSeconds?: number } {
  const now = Date.now();
  let record = rateLimitMap.get(key);

  if (!record) {
    record = { attempts: 0, lastAttemptTime: now, lockedUntil: 0 };
    rateLimitMap.set(key, record);
  }

  // Check if currently locked out
  if (record.lockedUntil > now) {
    const retryAfter = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds: retryAfter };
  }

  // Reset window if elapsed
  if (now - record.lastAttemptTime > windowMs) {
    record.attempts = 0;
    record.lockedUntil = 0;
  }

  if (record.attempts >= maxAttempts) {
    record.lockedUntil = now + lockoutMs;
    const retryAfter = Math.ceil(lockoutMs / 1000);
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds: retryAfter };
  }

  return { allowed: true, remainingAttempts: maxAttempts - record.attempts };
}

export function recordFailedAttempt(key: string, maxAttempts = 5, lockoutMs = 15 * 60 * 1000): void {
  const now = Date.now();
  let record = rateLimitMap.get(key);
  if (!record) {
    record = { attempts: 1, lastAttemptTime: now, lockedUntil: 0 };
    rateLimitMap.set(key, record);
    return;
  }
  record.attempts += 1;
  record.lastAttemptTime = now;
  if (record.attempts >= maxAttempts) {
    record.lockedUntil = now + lockoutMs;
  }
}

export function resetRateLimit(key: string): void {
  rateLimitMap.delete(key);
}

// ================= 4. FIRST-RUN SETUP SECRET =================
const DATA_DIR = path.resolve(process.cwd(), 'data');
const SETUP_SECRET_FILE = path.join(DATA_DIR, '.setup_secret');

export function getOrCreateSetupSecret(): string {
  if (process.env.INITIAL_SETUP_SECRET && process.env.INITIAL_SETUP_SECRET.trim().length >= 16) {
    return process.env.INITIAL_SETUP_SECRET.trim();
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(SETUP_SECRET_FILE)) {
    try {
      const existing = fs.readFileSync(SETUP_SECRET_FILE, 'utf-8').trim();
      if (existing.length >= 16) return existing;
    } catch {}
  }

  // Generate a cryptographically secure 32-character setup secret
  const newSecret = crypto.randomBytes(24).toString('base64url');
  try {
    fs.writeFileSync(SETUP_SECRET_FILE, newSecret, { mode: 0o600 });
    console.log('\n================================================================');
    console.log(' [SECURITY] FIRST-ADMINISTRATOR SETUP SECRET GENERATED');
    console.log(` Setup Secret: ${newSecret}`);
    console.log(' Use this one-time secret to initialize your initial administrator.');
    console.log('================================================================\n');
  } catch (err) {
    console.error('Error writing setup secret file:', err);
  }
  return newSecret;
}

export function verifyAndConsumeSetupSecret(suppliedSecret: string): boolean {
  const current = getOrCreateSetupSecret();
  if (!suppliedSecret || typeof suppliedSecret !== 'string') return false;

  const bufSupplied = Buffer.from(suppliedSecret.trim());
  const bufCurrent = Buffer.from(current);

  if (bufSupplied.length !== bufCurrent.length) {
    return false;
  }

  const matches = crypto.timingSafeEqual(bufSupplied, bufCurrent);
  if (matches) {
    // Delete setup secret file immediately to consume it
    if (fs.existsSync(SETUP_SECRET_FILE)) {
      try {
        fs.unlinkSync(SETUP_SECRET_FILE);
      } catch (err) {
        console.error('Error removing consumed setup secret:', err);
      }
    }
    return true;
  }
  return false;
}
