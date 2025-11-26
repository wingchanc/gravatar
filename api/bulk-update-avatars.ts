import { AppStrategy, createClient } from "@wix/sdk";
import { members } from "@wix/members";
import { appInstances } from "@wix/app-management";
import { files } from "@wix/media";
import { getGravatarUrl } from "./gravatar";

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
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const instanceId = await getInstanceIdFromRequest(req);
    const body = await req.json();
    const { memberIds } = body;

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "memberIds must be a non-empty array" }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );
    }

    // Create elevated client with app secret to update members
    const client = createClient({
      auth: AppStrategy({
        appId: APP_ID,
        publicKey: PUBLIC_KEY,
        appSecret:
          process.env.WIX_APP_SECRET || "2a330c94-b3b1-4c5c-bb83-d740d788c9fc",
        instanceId: instanceId,
      }),
      modules: { members, appInstances, files },
    });

    const results = {
      success: [] as string[],
      failed: [] as { memberId: string; error: string }[],
    };

    // Process each member
    for (const memberId of memberIds) {
      try {
        // Get member details
        const member = await client.members.getMember(memberId, {
          fieldsets: [client.members.Set.FULL]
        });
        const email = member.loginEmail || member.contact?.emails?.[0];

        if (!email) {
          results.failed.push({
            memberId,
            error: "No email found for member",
          });
          continue;
        }

        // Check if member already has a profile photo
        const existingPhoto = member.profile?.photo?.url;
        if (existingPhoto && existingPhoto.trim() !== "") {
          results.failed.push({
            memberId,
            error: "Member already has a profile photo",
          });
          continue;
        }

        // Generate Gravatar URL
        const gravatarUrl = getGravatarUrl(email, {
          size: 200,
          default: "identicon",
          rating: "g",
        });

        // Import Gravatar image
        const { file } = await client.files.importFile(gravatarUrl, {
          mediaType: "IMAGE",
          mimeType: "image/jpeg",
        });

        // Update member profile with Gravatar URL
        await client.members.updateMember(memberId, {
          profile: {
            photo: {
              _id: file?._id,
              url: file?.url,
              height: 200,
              width: 200,
              offsetX: 0,
              offsetY: 0,
            },
          },
        });

        results.success.push(memberId);
      } catch (error: any) {
        console.error(`Error updating member ${memberId}:`, error);
        results.failed.push({
          memberId,
          error: error?.message || "Unknown error",
        });
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { "content-type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in bulk update avatars:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to update avatars" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
}

