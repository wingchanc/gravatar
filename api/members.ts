import { AppStrategy, createClient } from "@wix/sdk";
import { members } from "@wix/members";
import { appInstances } from "@wix/app-management";

export const dynamic = "force-dynamic";
export const config = {
  runtime: "edge",
};

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuJl8S8fFG7/bXOwaOmhP
k1eu1PYpcmklt9A32vPzg61DXj3mxyhBlwHyZwLBwyTSfOkUtM3ai4IigeSNg6K1
xV0UcjnDvsu7zhyIO7U6QVf+UDkPmCBgj4lNCwpDdIJm4dBdLhW77mbyYeldiqy7
HTROblkw5TG4/8fLrl4mOrtDs4VZvY18a3VVAJRll+YQu25ILzZd2MwL5/+Dgb1a
n8h+OF9dJ4d4TWJRxIJ36gIBZl72ofVvj/dvanzMm5AYpurXF6tU7p2ojVJPz6Dg
rA+Zl1Ez7ac76BQzADe728iNRtWzLoWB4zQ6uHvH+11psaesOb8b3tI+CC/DG+vB
GwIDAQAB
-----END PUBLIC KEY-----`;
const APP_ID = "655104d6-d14c-42d8-8197-38384e647359";

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
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const instanceId = await getInstanceIdFromRequest(req);

    console.log(`Instance ID:`, instanceId);

    // Create elevated client with app secret to fetch members
    const client = createClient({
      auth: AppStrategy({
        appId: APP_ID,
        publicKey: PUBLIC_KEY,
        appSecret:
          process.env.WIX_APP_SECRET || "2a330c94-b3b1-4c5c-bb83-d740d788c9fc",
        instanceId: instanceId,
      }),
      modules: { members, appInstances },
    });

    // Query all members with pagination
    const allMembers: any[] = [];
    let offset = 0;
    const limit = 1000; // Fetch in batches of 1000
    let hasMore = true;

    while (hasMore) {
      const response = await client.members.listMembers({
        paging: {
          limit,
          offset,
        },
        fieldsets: [client.members.Set.FULL],
      });

      if (response.members && response.members.length > 0) {
        allMembers.push(...response.members);
      }

      // Check if there are more pages
      // If we got fewer results than the limit, we've reached the end
      if (!response.members || response.members.length < limit) {
        hasMore = false;
      } else {
        // Continue to next page
        offset += limit;
      }

      // Safety check to prevent infinite loops
      if (offset > 100000) {
        console.warn("Reached safety limit for pagination, stopping");
        hasMore = false;
      }
    }

    console.log(`Fetched ${allMembers.length} total members`);

    console.log(allMembers)

    // Format members for frontend
    const formattedMembers = allMembers.map((member: any) => ({
      id: member._id || member.id,
      name:
        member?.profile?.nickname || member?.slug || "",
      email: member.loginEmail || member.contact?.emails?.[0] || "",
      hasAvatar: !!(
        member.profile?.photo?.url && member.profile.photo.url.trim() !== ""
      ),
      avatarUrl: member.profile?.photo?.url || "",
    }));

    return new Response(JSON.stringify({ members: formattedMembers }), {
      headers: { "content-type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error fetching members:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to fetch members" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
}
