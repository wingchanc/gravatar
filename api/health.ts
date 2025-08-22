export const config = { runtime: 'edge' };

export default async function handler(): Promise<Response> {
  return new Response(
    JSON.stringify({ status: 'OK', timestamp: new Date().toISOString() }),
    { headers: { 'content-type': 'application/json' } }
  );
}
