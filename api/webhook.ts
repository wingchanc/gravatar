import { AppStrategy, createClient } from "@wix/sdk";
import { members } from "@wix/members";
import { appInstances } from "@wix/app-management";
import { checkEmailWithIsFakeMail } from "./check-email";
import { sendFakeMemberAlert } from "./sendpulse-email";
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
  modules: { members, appInstances },
});

// Set up the member created event handler
client.members.onMemberCreated(async (event) => {
  console.log(`onMemberCreated invoked with data:`, event);
  console.log(`App instance ID:`, event.metadata.instanceId);
  const elevatedClient = createClient({
    auth: AppStrategy({
      appId: APP_ID,
      publicKey: PUBLIC_KEY,
      appSecret: "bb5ac073-63a9-4178-9ab0-fc36c049fc0a",
      instanceId: event.metadata.instanceId!,
    }),
    modules: { members, appInstances },
  });
  try {
    // Extract member information from the event
    const member = event.entity;
    const email = member?.loginEmail || member?.contact?.emails?.[0];
    
    if (email) {
      console.log(`New member created with email: ${email}`);
      
      // First check if fake email blocking is enabled for this instance
      const isBlockingEnabled = await isBlockingEnabledForInstance(event.metadata.instanceId!);
      
      if (!isBlockingEnabled) {
        console.log(`🔓 Fake email blocking is disabled for instance ${event.metadata.instanceId}. Skipping email check.`);
        return; // Exit early if blocking is disabled
      }
      
      console.log(`🔒 Fake email blocking is enabled for instance ${event.metadata.instanceId}. Proceeding with email check.`);
      
      // Check if email is fake using the isfakemail.com API
      const emailCheckResult = await checkEmailWithIsFakeMail(email);
      
      if (emailCheckResult.isFake) {
        console.log(`🚨 Detected fake email: ${email} (domain: ${emailCheckResult.domain}) for member ${event.metadata.entityId}`);
        
        // Implement actions for fake emails:
        
        try {
          // 1. Block the member immediately
          await elevatedClient.members.blockMember(
            event.metadata.entityId!
          );
          console.log(`🚫 Successfully blocked member ${event.metadata.entityId}`);
          
          // 2. Get admin email from app instance and send alert
          try {
            const appInstance = await elevatedClient.appInstances.getAppInstance();
            const adminEmail = appInstance.site?.ownerInfo?.email;
            
            const emailSent = await sendFakeMemberAlert(email, adminEmail!);
            
            if (emailSent) {
              console.log(`📧 Admin alert email sent to ${adminEmail} for fake member: ${email}`);
            } else {
              console.warn(`⚠️ Failed to send admin alert email for: ${email}`);
            }
          } catch (emailError) {
            console.error(`❌ Error getting admin email or sending alert:`, emailError);
          }
          
        } catch (blockError) {
          console.error(`❌ Error blocking member ${event.metadata.entityId}:`, blockError);
        }
        
      } else {
        console.log(`✅ Email verified as legitimate: ${email}`);
      }
      
      if (emailCheckResult.error) {
        console.warn(`⚠️ Email check service error: ${emailCheckResult.error}`);
      }
    } else {
      console.log('No email found in member data');
    }
  } catch (error) {
    console.error('Error processing member created event:', error);
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
    await client.webhooks.process(body);
    
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
