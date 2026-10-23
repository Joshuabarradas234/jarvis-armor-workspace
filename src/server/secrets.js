/**
 * JARVIS Server's lock for passwords and keys, standing in for the app's own (Electron's safeStorage).
 * Secrets are sealed with AES-256-GCM. The key is kept in the Mac's Keychain (login keychain, "JARVIS Server");
 * where there is no Keychain, or it can't be reached, it is a file only this user can read.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const SERVICE = 'JARVIS Server', ACCOUNT = 'data-key';

/** The 32-byte key: from the Keychain on a Mac, else from <dir>/data-key (mode 600). Made the first time. */
export function dataKey({dir, platform = process.platform, exec = execFileSync, fsImpl = fs, log = () => {}}) {
  const make = () => crypto.randomBytes(32).toString('base64');
  if (platform === 'darwin') {
    try { const k = String(exec('security', ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w'], {stdio: ['ignore', 'pipe', 'ignore']})).trim(); if (k) return Buffer.from(k, 'base64'); } catch {}
    try { const k = make(); exec('security', ['add-generic-password', '-U', '-s', SERVICE, '-a', ACCOUNT, '-w', k], {stdio: 'ignore'}); return Buffer.from(k, 'base64'); }
    catch (e) { log('server', `The Keychain could not be used (${e.message}); keeping the key in a private file instead.`); }
  }
  const file = path.join(dir, 'data-key');
  try { const k = fsImpl.readFileSync(file, 'utf8').trim(); if (k) return Buffer.from(k, 'base64'); } catch {}
  const k = make(); fsImpl.mkdirSync(dir, {recursive: true}); fsImpl.writeFileSync(file, k, {mode: 0o600}); return Buffer.from(k, 'base64');
}

/** The same shape JARVIS Core expects from the app: available(), encrypt(text) → Buffer, decrypt(Buffer) → text. */
export function makeCrypt(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw Error('The data key must be 32 bytes.');
  return {
    available: () => true,
    encrypt(text) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv), body = Buffer.concat([c.update(String(text), 'utf8'), c.final()]); return Buffer.concat([Buffer.from('JS1'), iv, c.getAuthTag(), body]); },
    decrypt(buf) {
      const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
      if (b.length < 31 || b.subarray(0, 3).toString() !== 'JS1') throw Error('Not sealed by JARVIS Server.');
      const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(3, 15)); d.setAuthTag(b.subarray(15, 31));
      return Buffer.concat([d.update(b.subarray(31)), d.final()]).toString('utf8');
    },
  };
}
