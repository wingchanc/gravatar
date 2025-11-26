import { Redis } from '@upstash/redis';

export const config = {
  runtime: 'edge',
};

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const KEY_PREFIX = 'gravatar-auto-populate-toggle:';

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
