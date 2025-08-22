import { AppStrategy, createClient } from "@wix/sdk";
import { members } from "@wix/members";
import { appInstances } from "@wix/app-management";
import { messages } from '@wix/inbox';
import { Redis } from '@upstash/redis';

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

const KEY_PREFIX = 'block-fake-email-toggle:';

// Helper function to check if fake email blocking is enabled for an instance
async function isBlockingEnabledForInstance(instanceId: string): Promise<boolean> {
  try {
    const key = `${KEY_PREFIX}${instanceId}`;
    const value = await redis.get(key);
    console.log(`Toggle state check for instance ${instanceId}: ${value} (type: ${typeof value})`);

    // Handle different possible return types from Redis
    if (value === 'true' || value === true) {
      return true;
    } else if (value === 'false' || value === false) {
      return false;
    } else {
      // Default to false if key doesn't exist (feature disabled by default)
      console.log(`No toggle state found for instance ${instanceId}, defaulting to disabled`);
      return false;
    }
  } catch (error) {
    console.error(`Error checking toggle state for instance ${instanceId}:`, error);
    // Default to false on error (fail safe)
    return false;
  }
}

const client = createClient({
  auth: AppStrategy({
    appId: APP_ID,
    publicKey: PUBLIC_KEY,
  }),
  modules: { messages, appInstances },
});

// Set up the member created event handler
client.messages.onMessageSentToBusiness(async (event) => {
  console.log(`onMessageSentToBusiness invoked with data:`, event);
  console.log(`App instance ID:`, event.metadata.instanceId);
  const elevatedClient = createClient({
    auth: AppStrategy({
      appId: APP_ID,
      publicKey: PUBLIC_KEY,
      appSecret: "bb5ac073-63a9-4178-9ab0-fc36c049fc0a",
      instanceId: event.metadata.instanceId!,
    }),
    modules: { messages, appInstances },
  });
  try {
    if (event.data.message?.direction === "BUSINESS_TO_PARTICIPANT" || 
      event.data.message?.visibility === "BUSINESS"
    ) {
      console.log(`Message is from business to participant or is not visible to business, skipping...`);
      return;
    }

    let messageContent = event.data.message?.content?.previewText

    if (event.data.message?.content?.basic?.items) {
      messageContent = event.data.message?.content?.basic?.items.map((item: any) => item.text).join("\n")
    }

    if (event.data.message?.content?.form) {
      messageContent = event.data.message?.content?.form?.fields?.map((field: any) => field.value).join("\n")
    }

    if (messageContent?.toLowerCase().includes("wix")) {
      const message = "🚨 Scammer likes to pretend to be Wix Support or Wix Sales to get your money. Don't fall for it!"
      await elevatedClient.messages.sendMessage(event.data.conversationId!, {
        badges: [{
          text: "Chat Spam Alert",
          badgeVisibility: "BUSINESS",
          iconUrl: "https://static.wixstatic.com/shapes/bec40d_8dc570e465714337a93f5f9c691c209b.svg"
        }],
        content: {
          previewText: message,
          "basic": {
            "items": [{
              "text": message
            }]
          }
        },
        sourceChannel: "CHAT",
        visibility: "BUSINESS",
        direction: "PARTICIPANT_TO_BUSINESS",
        silent: true
      }, {
        sendAs: "CALLER",
        sendNotifications: false,
      })
      console.log(`Sent message to conversation ${event.data.conversationId}`);
    } else {
      console.log(`Message content does not include Wix: ${messageContent}`);
    }
  } catch (error) {
    console.error(`Error processing message sent to business event:`, error);
  }
});

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // Get the raw body as text for webhook processing
    const body = await req.text();

    // Process the webhook using the Wix SDK
    client.webhooks.process(body);

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook processing error:', err);

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
