import { webcrypto as crypto } from 'crypto';

const CRYPTO_CONFIG = {
  IV_LENGTH: 12,
  SALT_LENGTH: 16,
  PBKDF2_ITERATIONS: 100000,
  AES_KEY_LENGTH: 256,
  HMAC_SUFFIX: 'HMAC',
};

const generateAesKeyFromPassword = async (secretKey, salt) => {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretKey),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: CRYPTO_CONFIG.PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: CRYPTO_CONFIG.AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
};

const generateHmacKey = async (secretKey) => {
  const hmacKeyBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secretKey + CRYPTO_CONFIG.HMAC_SUFFIX)
  );

  return crypto.subtle.importKey(
    'raw',
    hmacKeyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
};

export const encryptData = async (value, secretKey) => {
  const dataBuffer = new TextEncoder().encode(value);
  const iv = crypto.getRandomValues(new Uint8Array(CRYPTO_CONFIG.IV_LENGTH));
  const salt = crypto.getRandomValues(new Uint8Array(CRYPTO_CONFIG.SALT_LENGTH));

  const key = await generateAesKeyFromPassword(secretKey, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, dataBuffer);

  const hmacKey = await generateHmacKey(secretKey);
  const hmac = await crypto.subtle.sign('HMAC', hmacKey, encrypted);

  // Concatenate all parts: IV + SALT + HMAC + ENCRYPTED_DATA
  const result = Buffer.concat([
    Buffer.from(iv),
    Buffer.from(salt),
    Buffer.from(hmac),
    Buffer.from(encrypted),
  ]);

  console.log(result.toString('base64'))
  return result.toString('base64');
};

export const decryptData = async (encryptedBase64, secretKey) => {
  const data = Buffer.from(encryptedBase64, 'base64');
  const iv = new Uint8Array(data.subarray(0, CRYPTO_CONFIG.IV_LENGTH));
  const salt = new Uint8Array(data.subarray(CRYPTO_CONFIG.IV_LENGTH, CRYPTO_CONFIG.IV_LENGTH + CRYPTO_CONFIG.SALT_LENGTH));
  const hmac = new Uint8Array(data.subarray(CRYPTO_CONFIG.IV_LENGTH + CRYPTO_CONFIG.SALT_LENGTH, CRYPTO_CONFIG.IV_LENGTH + CRYPTO_CONFIG.SALT_LENGTH + 32));
  const encryptedBuffer = new Uint8Array(data.subarray(CRYPTO_CONFIG.IV_LENGTH + CRYPTO_CONFIG.SALT_LENGTH + 32));

  const key = await generateAesKeyFromPassword(secretKey, salt);
  const hmacKey = await generateHmacKey(secretKey);

  const isValid = await crypto.subtle.verify('HMAC', hmacKey, hmac, encryptedBuffer);
  if (!isValid) {
    throw new Error('HMAC verification failed. Data may have been tampered with.');
  }

  const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encryptedBuffer);
  console.log(new TextDecoder().decode(decryptedBuffer))
  return new TextDecoder().decode(decryptedBuffer);
};
