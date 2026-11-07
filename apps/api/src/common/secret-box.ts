import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Cifra credenciales de terceros que se guardan en la base (AES-256-GCM).
 * La clave se deriva de JWT_SECRET: si ese secreto cambia, lo cifrado deja de leerse y hay que volver a conectar.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(secret: string, purpose: string) {
    this.key = Buffer.from(hkdfSync('sha256', secret, 'kahal', purpose, 32));
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
  }

  /** null si no se puede descifrar (otro secreto o dato alterado). */
  open(sealed: string): string | null {
    try {
      const [iv, tag, data] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'));
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
}
