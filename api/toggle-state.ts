import { Redis } from '@upstash/redis';

export const config = {
  runtime: 'edge',
};

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const KEY_PREFIX = 'gravatar-auto-populate-toggle:';

// Base64url helpers compatible with Edge runtime
function base64UrlToBase64(input: string): string {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  return input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlDecodeToBytes(input: string): Uint8Array {
  return base64ToUint8Array(base64UrlToBase64(input));
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hmacSha256(keyBytes: Uint8Array, dataBytes: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBytes);
  return new Uint8Array(signature);
}

async function getInstanceIdFromRequest(req: Request): Promise<string> {
  const fullUrl = new URL(req.url);
  const authHeader = fullUrl.searchParams.get('instance');
  if (authHeader) {
    try {
      const rawToken = authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length)
        : authHeader;
      const resp = await fetch('https://www.wixapis.com/oauth2/token-info', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: rawToken }),
      });
      if (resp.ok) {
        const data: any = await resp.json();
        if (data?.instanceId) {
          return String(data.instanceId);
        }
      }
    } catch (e) {
      // Ignore and fallback to instance param verification
    }
  }
  throw new Error('Missing required instance context: provide Authorization header or instance query param');
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const instanceId = await getInstanceIdFromRequest(req);
    const KEY = `${KEY_PREFIX}${instanceId}`;

    if (req.method === 'GET') {
      const value = await redis.get(KEY);
      console.log('Redis GET - Raw value:', value, 'Type:', typeof value);
      
      // Handle different possible return types from Redis
      let isEnabled = false;
      if (value === 'true' || value === true) {
        isEnabled = true;
      } else if (value === 'false' || value === false) {
        isEnabled = false;
      } else if (value === null || value === undefined) {
        // Default to false if key doesn't exist
        isEnabled = false;
      }
      
      console.log('Processed isEnabled:', isEnabled);
      return new Response(JSON.stringify({ isEnabled }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const isEnabled = body?.isEnabled;
      if (typeof isEnabled !== 'boolean') {
        return new Response(JSON.stringify({ error: 'isEnabled must be a boolean' }), { status: 400, headers: { 'content-type': 'application/json' } });
      }
      
      const valueToStore = String(isEnabled);
      console.log('Redis SET - Storing value:', valueToStore, 'Original:', isEnabled);
      await redis.set(KEY, valueToStore);
      
      // Verify the stored value immediately
      const storedValue = await redis.get(KEY);
      console.log('Redis SET - Verification read:', storedValue, 'Type:', typeof storedValue);
      
      return new Response(JSON.stringify({ success: true, isEnabled }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Internal Error' }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}
