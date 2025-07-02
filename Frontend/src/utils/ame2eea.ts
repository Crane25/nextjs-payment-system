// Ame2eea utility functions for PIN encryption
// This is a TypeScript version of the ame2eea.js library

import crypto from 'crypto';

// Utility functions - exactly matching the original
export const amUtil = {
  str2bin: function(str: string): number[] {
    const result = [];
    const encoded = unescape(encodeURIComponent(str));
    for (let i = 0; i < encoded.length; i++) {
      result[i] = encoded.charCodeAt(i) & 255;
    }
    return result;
  },

  hexDecode: function(hex: string): number[] {
    const result = [];
    for (let i = 0; i < hex.length; i += 2) {
      result.push(parseInt(hex.substr(i, 2), 16));
    }
    return result;
  },

  hexEncode: function(bytes: number[]): string {
    let result = '';
    for (let i = 0; i < bytes.length; i++) {
      result += this.addHex(bytes[i]);
    }
    return result;
  },

  addHex: function(val: number): string {
    let x = (val >>> 4) & 15;
    if (x > 9) {
      x += 55; // A-F
    } else {
      x += 48; // 0-9
    }
    let s = String.fromCharCode(x);
    x = val & 15;
    if (x > 9) {
      x += 55; // A-F
    } else {
      x += 48; // 0-9
    }
    s = s + String.fromCharCode(x);
    return s;
  },

  zeroPad: function(str: string, length: number): string {
    let result = str;
    while (result.length < length) {
      result = '0' + result;
    }
    return result;
  },

  generateRandom: function(length: number): number[] {
    return Array.from(crypto.randomBytes(length));
  },

  xor: function(a: number[], b: number[]): number[] {
    if (a.length !== b.length) {
      throw new Error('XOR failure: two binaries have different lengths');
    }
    const result = [];
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i] ^ b[i];
    }
    return result;
  },

  parseBigInt: function(str: string, radix: number): any {
    return BigInt('0x' + str);
  },

  // SecureRandom implementation matching original
  SecureRandom: class {
    nextBytes(ba: number[]): void {
      const randomBytes = crypto.randomBytes(ba.length);
      for (let i = 0; i < ba.length; i++) {
        ba[i] = randomBytes[i];
      }
    }
  }
};

// Hash functions using crypto module
export const amHash = {
  sha1: function(data: number[]): number[] {
    const hash = crypto.createHash('sha1');
    hash.update(Buffer.from(data));
    return Array.from(hash.digest());
  },

  sha224: function(data: number[]): number[] {
    const hash = crypto.createHash('sha224');
    hash.update(Buffer.from(data));
    return Array.from(hash.digest());
  },

  sha256: function(data: number[]): number[] {
    const hash = crypto.createHash('sha256');
    hash.update(Buffer.from(data));
    return Array.from(hash.digest());
  },

  sha384: function(data: number[]): number[] {
    const hash = crypto.createHash('sha384');
    hash.update(Buffer.from(data));
    return Array.from(hash.digest());
  },

  sha512: function(data: number[]): number[] {
    const hash = crypto.createHash('sha512');
    hash.update(Buffer.from(data));
    return Array.from(hash.digest());
  }
};

// BigInteger implementation (simplified for our use case)
class BigInteger {
  private value: bigint;

  constructor(data: number[] | string, base?: number) {
    if (Array.isArray(data)) {
      // Convert byte array to hex string then to BigInt
      const hex = amUtil.hexEncode(data);
      this.value = hex.length > 0 ? BigInt('0x' + hex) : BigInt(0);
    } else if (typeof data === 'string') {
      // Handle hex string input
      if (data === '0' || data === '') {
        this.value = BigInt(0);
      } else {
        // Remove any '0x' prefix if present
        const cleanHex = data.startsWith('0x') ? data.slice(2) : data;
        this.value = cleanHex.length > 0 ? BigInt('0x' + cleanHex) : BigInt(0);
      }
    } else {
      this.value = BigInt(0);
    }
  }

  modPowInt(exp: number, mod: BigInteger): BigInteger {
    const result = new BigInteger('0');
    // Use modular exponentiation instead of ** operator
    let base = this.value;
    let exponent = BigInt(exp);
    let modulus = mod.value;
    let res = BigInt(1);
    
    base = base % modulus;
    while (exponent > 0) {
      if (exponent % BigInt(2) === BigInt(1)) {
        res = (res * base) % modulus;
      }
      exponent = exponent >> BigInt(1);
      base = (base * base) % modulus;
    }
    
    result.value = res;
    return result;
  }

  toString(base: number): string {
    if (base === 16) {
      return this.value.toString(16);
    }
    return this.value.toString();
  }
}

// RSA Key implementation matching original
class RSAKey {
  private n: BigInteger | null = null;
  private e: number = 0;

  setPublic(N: string, E: string): void {
    if (N && E && N.length > 0 && E.length > 0) {
      this.n = new BigInteger(N, 16);
      this.e = parseInt(E, 16);
    } else {
      throw new Error('Invalid RSA public key');
    }
  }

  doPublic(x: BigInteger): BigInteger | null {
    if (!this.n) return null;
    return x.modPowInt(this.e, this.n);
  }

  encrypt(m: BigInteger): string | null {
    if (!m) return null;
    const c = this.doPublic(m);
    if (!c) return null;
    const h = c.toString(16);
    return (h.length & 1) === 0 ? h : '0' + h;
  }
}

// RSA functions with proper OAEP implementation matching original
export const amRsa = {
  RSAKey: RSAKey,

  _MGF1: function(Z: number[], l: number, hashAlgo: string): number[] {
    const cnt: number[] = [];
    const result: number[] = [];
    let pos = 0;
    let hashFunc: (data: number[]) => number[];
    
    if (hashAlgo === 'SHA-1') {
      hashFunc = amHash.sha1;
    } else if (hashAlgo === 'SHA-224') {
      hashFunc = amHash.sha224;
    } else if (hashAlgo === 'SHA-256') {
      hashFunc = amHash.sha256;
    } else if (hashAlgo === 'SHA-384') {
      hashFunc = amHash.sha384;
    } else if (hashAlgo === 'SHA-512') {
      hashFunc = amHash.sha512;
    } else {
      throw new Error(`MGF: HASH algorithm is not recognized, hashAlgo=${hashAlgo}`);
    }
    
    for (let i = 0; pos < l; i++) {
      cnt[0] = (i >> 24) & 255;
      cnt[1] = (i >> 16) & 255;
      cnt[2] = (i >> 8) & 255;
      cnt[3] = i & 255;
      const hashInput = Z.concat(cnt);
      const hashOutput = hashFunc(hashInput);
      for (let j = 0; j < hashOutput.length && pos < l; j++, pos++) {
        result[pos] = hashOutput[j];
      }
    }
    return result;
  },

  oaepEncode: function(k: number, label: number[], message: number[], hashAlgo: string): number[] {
    let hashLen: number;
    let hashFunc: (data: number[]) => number[];

    if (hashAlgo === 'SHA-1') {
      hashLen = 20;
      hashFunc = amHash.sha1;
    } else if (hashAlgo === 'SHA-224') {
      hashLen = 28;
      hashFunc = amHash.sha224;
    } else if (hashAlgo === 'SHA-256') {
      hashLen = 32;
      hashFunc = amHash.sha256;
    } else if (hashAlgo === 'SHA-384') {
      hashLen = 48;
      hashFunc = amHash.sha384;
    } else if (hashAlgo === 'SHA-512') {
      hashLen = 64;
      hashFunc = amHash.sha512;
    } else {
      throw new Error(`OAEP: HASH algorithm is not recognized, hashAlgo=${hashAlgo}`);
    }

    if (message.length > k - 2 * hashLen - 2) {
      throw new Error('The message to be encrypted is too long');
    }

    const ps = new Array(k - message.length - 2 * hashLen - 2).fill(0);
    const hashLabel = hashFunc(label);
    const db = hashLabel.concat(ps, [1], message);
    const seed = amUtil.generateRandom(hashLen);
    const dbMask = this._MGF1(seed, k - hashLen - 1, hashAlgo);
    const maskedDb = amUtil.xor(db, dbMask);
    const seedMask = this._MGF1(maskedDb, hashLen, hashAlgo);
    const maskedSeed = amUtil.xor(seed, seedMask);

    return [0].concat(maskedSeed, maskedDb);
  },

  oaep: {
    encryptAndGenLabel: function(n: string, e: string, message: number[], hashAlgo: string): string {
      // Generate 16-byte random label exactly like original
      const labelLength = 16;
      const labelBytes = new Array(labelLength);
      const rnd = new amUtil.SecureRandom();
      rnd.nextBytes(labelBytes);
      
      const sLabel = amUtil.hexEncode(labelBytes);
      const paddedLabel = amUtil.zeroPad(sLabel, labelLength * 2);
      
      // Encrypt the message
      const encrypted = this.encrypt(n, e, labelBytes, message, hashAlgo);
      
      // Return label:encrypted format exactly like original
      return paddedLabel + ':' + encrypted;
    },

    encrypt: function(n: string, e: string, label: number[], message: number[], hashAlgo: string): string {
      // Use RSA encryption exactly like original
      const rsaKey = new amRsa.RSAKey();
      rsaKey.setPublic(n, e);
      
      const encoded = amRsa.oaepEncode(n.length / 2, label, message, hashAlgo);
      const encrypted = rsaKey.encrypt(new BigInteger(encoded));
      
      if (!encrypted) {
        throw new Error('RSA encryption failed');
      }
      
      const padded = amUtil.zeroPad(encrypted, n.length);
      return padded.toUpperCase();
    }
  }
};

// Main ame2eea object
export const ame2eea = {
  _hashStandard: function(hashAlgo: string): string {
    if (!hashAlgo || hashAlgo === '') {
      return 'SHA-1';
    }
    if (hashAlgo === 'SHA1') {
      return 'SHA-1';
    }
    if (hashAlgo === 'SHA2-224' || hashAlgo === 'SHA224') {
      return 'SHA-224';
    }
    if (hashAlgo === 'SHA2-256' || hashAlgo === 'SHA256') {
      return 'SHA-256';
    }
    if (hashAlgo === 'SHA2-384' || hashAlgo === 'SHA384') {
      return 'SHA-384';
    }
    if (hashAlgo === 'SHA2-512' || hashAlgo === 'SHA512') {
      return 'SHA-512';
    }
    return hashAlgo;
  },

  _formatPINMessage: function(pin: string, serverRandom: string): number[] {
    const result = [1];
    const pinBytes = amUtil.str2bin(pin);
    const pinBlock = this._createPINBlock(pinBytes);
    const serverRandomBytes = amUtil.hexDecode(serverRandom);
    return result.concat(pinBlock, serverRandomBytes);
  },

  _createPINBlock: function(pin: number[]): number[] {
    const result = [193, pin.length];
    for (let i = 0; i < pin.length; i++) {
      result.push(pin[i]);
    }
    while (result.length % 8 !== 0) {
      result.push(255);
    }
    return result;
  },

  encryptPin: function(e2eeSid: string, serverRandom: string, pin: string, oaepHashAlgo: string): string {
    oaepHashAlgo = this._hashStandard(oaepHashAlgo);
    const parts = e2eeSid.split(',', 2);
    const message = this._formatPINMessage(pin, serverRandom);
    
    try {
      const encrypted = amRsa.oaep.encryptAndGenLabel(parts[0], parts[1], message, oaepHashAlgo);
      return encrypted;
    } catch (err) {
      console.error('Exception when encrypting using RSA-OAEP:', err);
      throw err;
    }
  },

  formatEncryptionResult: function(e2eeSid: string, encryptedPin: string, encryptedChangePin: string): string {
    let result = e2eeSid + ',' + encryptedPin;
    if (encryptedChangePin && encryptedChangePin.length > 0) {
      result = result + ',' + encryptedChangePin;
    }
    return result;
  },

  encryptPinForAM: function(e2eeSid: string, pubKey: string, serverRandom: string, pin: string, oaepHashAlgo: string): string {
    const encryptedPin = this.encryptPin(pubKey, serverRandom, pin, oaepHashAlgo);
    return this.formatEncryptionResult(e2eeSid, encryptedPin, '');
  },

  log: function(log: string) {
    try {
      if (log) {
        console.log(log);
      }
    } catch (err) {
      // Ignore logging errors
    }
  }
}; 