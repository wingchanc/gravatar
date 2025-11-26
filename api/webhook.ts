import { AppStrategy, createClient } from "@wix/sdk";
import { members } from "@wix/members";
import { appInstances } from "@wix/app-management";
import { Redis } from '@upstash/redis';
import { generateGravatarHash, getGravatarUrl } from './gravatar';

export const dynamic = 'force-dynamic';
export const config = {
  runtime: 'edge',
};

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAl3qTwi8xtNBIU3H9E9qG
gZtZzun/GBkaRB59hoQfzIhtEndcWkOVwYTSnUV9VggWyYDdfn00DDXqNyQ2HZ/b
gaGC+ZaOXa5pK0okNO2WdlEHMfkEY3xREnxQKiAsDE6X5VC14sFchvFE9MKvzORu
5qx6PNEajDwXWZgVZHiSy6Dra6VWbDMXhmzy2uGHh9DRy5NRAgCkmIRW802qJY2m
fGxLQVJkDdnJd+rf6ADmmZs88XDFioo38hstCedTV93AlHE2Ix0Y2I2nZyeMtu5O
6dydYhfK8d6S69wvsJIdc/OebYobbKL6pENep09/4hdVwuMCcbkFxSMgXCGZJ/+M
VQIDAQAB
-----END PUBLIC KEY-----`;
const APP_ID = "1b7fc338-869b-4f77-92bb-9de00fe0bb6b";

// Redis client for checking toggle state
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const KEY_PREFIX = 'gravatar-auto-populate-toggle:';

// Helper function to check if Gravatar auto-populate is enabled for an instance
async function isGravatarEnabledForInstance(instanceId: string): Promise<boolean> {
  try {
    const key = `${KEY_PREFIX}${instanceId}`;
    const value = await redis.get(key);
    console.log(`Gravatar toggle state check for instance ${instanceId}: ${value} (type: ${typeof value})`);

    // Handle different possible return types from Redis
    if (value === 'true' || value === true) {
      return true;
    } else if (value === 'false' || value === false) {
      return false;
    } else {
      // Default to false if key doesn't exist (feature disabled by default)
      console.log(`No Gravatar toggle state found for instance ${instanceId}, defaulting to disabled`);
      return false;
    }
  } catch (error) {
    console.error(`Error checking Gravatar toggle state for instance ${instanceId}:`, error);
    // Default to false on error (fail safe)
    return false;
  }
}

const client = createClient({
  auth: AppStrategy({
    appId: APP_ID,
    publicKey: PUBLIC_KEY,
  }),
  modules: { members, appInstances },
});

// Set up the member created event handler
members.onMemberCreated(async (event) => {
  console.log(`onMemberCreated event received with data:`, event);
  console.log(`App instance ID:`, event.metadata.instanceId);
  
  // Add overall timeout to prevent hanging
  const overallTimeout = setTimeout(() => {
    console.error('Member processing timed out after 30 seconds');
  }, 30000);
  
  try {
    const instanceId = event.metadata.instanceId;
    if (!instanceId) {
      console.error('No instance ID found in event metadata');
      return;
    }

    // Check if Gravatar auto-populate is enabled for this instance
    const isEnabled = await isGravatarEnabledForInstance(instanceId);
    if (!isEnabled) {
      console.log(`Gravatar auto-populate is disabled for instance ${instanceId}, skipping...`);
      return;
    }

    // Get member data from event
    const member = event.entity;
    if (!member) {
      console.error('No member data found in event');
      return;
    }

    const memberId = member._id || member.id;
    const email = member.loginEmail || member.contact?.emails?.[0];

    if (!memberId) {
      console.error('No member ID found in event');
      return;
    }

    if (!email) {
      console.log(`No email found for member ${memberId}, skipping Gravatar update`);
      return;
    }

    console.log(`Processing Gravatar for member ${memberId} with email: ${email}`);

    // Check if member already has a profile photo
    const existingPhoto = member.profile?.photo?.url;
    if (existingPhoto && existingPhoto.trim() !== '') {
      console.log(`Member ${memberId} already has a profile photo: ${existingPhoto}, skipping Gravatar update`);
      return;
    }

    // Generate Gravatar URL
    const gravatarUrl = getGravatarUrl(email, {
      size: 200,
      default: 'identicon',
      rating: 'g'
    });

    console.log(`Generated Gravatar URL for ${email}: ${gravatarUrl}`);

    // Create elevated client with app secret to update member profile
    const elevatedClient = createClient({
      auth: AppStrategy({
        appId: APP_ID,
        publicKey: PUBLIC_KEY,
        appSecret: process.env.WIX_APP_SECRET || "bb5ac073-63a9-4178-9ab0-fc36c049fc0a",
        instanceId: instanceId,
      }),
      modules: { members, appInstances },
    });

    // Update member profile with Gravatar URL
    try {
      console.log(`Updating member ${memberId} profile photo with Gravatar URL...`);
      
      // Update member profile photo
      // Note: The profile.photo.url field should be updated via the updateMember API
      // The SDK expects an object with _id and member properties
      const updatedMember = await elevatedClient.members.updateMember({
        _id: memberId,
        member: {
          profile: {
            photo: {
              url: gravatarUrl
            }
          }
        }
      });

      console.log(`Successfully updated member ${memberId} profile photo with Gravatar`);
      console.log(`Updated member:`, updatedMember);
    } catch (updateError: any) {
      console.error(`Error updating member ${memberId} profile photo:`, updateError);
      // Don't throw - log and continue
    }
    
    // Clear the overall timeout since processing completed successfully
    clearTimeout(overallTimeout);
    console.log(`Member processing completed successfully for member: ${memberId}`);
  } catch (error) {
    console.error(`Error processing member created event:`, error);
    // Clear the overall timeout even on error
    clearTimeout(overallTimeout);
  }
});

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // Get the raw body as text for webhook processing
    const body = await req.text();
    console.log('Webhook body received:', body.substring(0, 200)); // Log first 200 chars

    // Process the webhook synchronously before sending response
    // This ensures Vercel doesn't terminate the function before processing completes
    try {
      await client.webhooks.process(body);
      console.log('Webhook processed successfully');
    } catch (webhookError) {
      console.error('Webhook processing error:', webhookError);
      // Continue execution even if webhook processing fails
    }

    // Return 200 OK after processing is complete
    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook handler error:', err);

    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: `Webhook error: ${errorMessage}` }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}
