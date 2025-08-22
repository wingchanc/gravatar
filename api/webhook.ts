import { AppStrategy, createClient } from "@wix/sdk";
import { members } from "@wix/members";
import { appInstances } from "@wix/app-management";
import { messages } from '@wix/inbox';
import { Redis } from '@upstash/redis';
import OpenAI from 'openai';

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

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

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

// Enhanced spam detection using OpenAI Moderation API
async function checkSpamWithOpenAI(content: string): Promise<{ isSpam: boolean; reason?: string; confidence?: number }> {
  try {
    if (!content || content.trim().length === 0) {
      return { isSpam: false };
    }

    console.log(`Checking content with OpenAI: "${content}"`);
    
    const moderation = await openai.moderations.create({
      input: content,
    });
    
    const result = moderation.results[0];
    console.log(`OpenAI moderation result:`, JSON.stringify(result, null, 2));
    
    // Check various harmful content indicators
    const isGenerallyFlagged = result.flagged;
    const isHarassment = result.categories.harassment;
    const isHarassmentThreatening = result.categories['harassment/threatening'];
    const isHate = result.categories.hate;
    const isHateThreatening = result.categories['hate/threatening'];
    const isIllicit = result.categories.illicit;
    const isViolence = result.categories.violence;
    
    // Check confidence scores (adjust thresholds as needed)
    const harassmentScore = result.category_scores.harassment;
    const harassmentThreateningScore = result.category_scores['harassment/threatening'];
    const hateScore = result.category_scores.hate;
    const illicitScore = result.category_scores.illicit;
    const violenceScore = result.category_scores.violence;
    
    // Define thresholds for spam/harmful content detection
    const HARASSMENT_THRESHOLD = 0.7;  // Adjustable threshold
    const HATE_THRESHOLD = 0.6;
    const ILLICIT_THRESHOLD = 0.5;
    const VIOLENCE_THRESHOLD = 0.8;
    
    const isHighHarassmentScore = harassmentScore > HARASSMENT_THRESHOLD;
    const isHighHateScore = hateScore > HATE_THRESHOLD;
    const isHighIllicitScore = illicitScore > ILLICIT_THRESHOLD;
    const isHighViolenceScore = violenceScore > VIOLENCE_THRESHOLD;
    
    const isSpam = isGenerallyFlagged || isHarassment || isHarassmentThreatening || 
                   isHate || isHateThreatening || isIllicit || isViolence ||
                   isHighHarassmentScore || isHighHateScore || isHighIllicitScore || isHighViolenceScore;
    
    let reason = '';
    if (isSpam) {
      const reasons: string[] = [];
      if (isHarassment) reasons.push('harassment');
      if (isHarassmentThreatening) reasons.push('harassment/threatening');
      if (isHate) reasons.push('hate speech');
      if (isHateThreatening) reasons.push('hate/threatening');
      if (isIllicit) reasons.push('illicit content');
      if (isViolence) reasons.push('violence');
      if (isHighHarassmentScore) reasons.push(`high harassment score (${harassmentScore.toFixed(2)})`);
      if (isHighHateScore) reasons.push(`high hate score (${hateScore.toFixed(2)})`);
      if (isHighIllicitScore) reasons.push(`high illicit score (${illicitScore.toFixed(2)})`);
      if (isHighViolenceScore) reasons.push(`high violence score (${violenceScore.toFixed(2)})`);
      reason = reasons.join(', ');
    }
    
    const maxConfidence = Math.max(harassmentScore, harassmentThreateningScore, hateScore, illicitScore, violenceScore);
    
    return { 
      isSpam, 
      reason,
      confidence: maxConfidence
    };
  } catch (error) {
    console.error('OpenAI moderation error:', error);
    // Fallback to simple keyword check if OpenAI fails
    const containsWix = content.toLowerCase().includes("wix");
    return { 
      isSpam: containsWix, 
      reason: containsWix ? 'fallback: contains "wix"' : undefined 
    };
  }
}

// Legacy spam check (as fallback)
function legacySpamCheck(content: string): boolean {
  if (!content) return false;
  return content.toLowerCase().includes("wix");
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

    console.log(`Message content: ${messageContent}`);
    
    // PRIORITY 1: Check for Wix keyword first (highest priority)
    const legacySpamResult = legacySpamCheck(messageContent || '');
    console.log(`Legacy spam check (contains "wix"): ${legacySpamResult}`);
    
    let isSpam = false;
    let alertMessage = "";
    let spamReason = "";
    
    if (legacySpamResult) {
      // Wix keyword detected - highest priority, skip OpenAI check
      isSpam = true;
      alertMessage = "🚨 Scammer likes to pretend to be Wix Support or Wix Sales to get your money. Don't fall for it!";
      spamReason = "Wix keyword detected";
      console.log(`Message flagged as spam: ${spamReason}`);
    } else {
      // PRIORITY 2: Only run OpenAI check if Wix keyword not found
      console.log(`No Wix keyword found, running OpenAI moderation check...`);
      const spamCheck = await checkSpamWithOpenAI(messageContent || '');
      console.log(`OpenAI spam check result:`, spamCheck);
      
      if (spamCheck.isSpam) {
        isSpam = true;
        alertMessage = `🚨 Spam detected: ${spamCheck.reason}. Please review this message carefully.`;
        spamReason = `OpenAI: ${spamCheck.reason}`;
        console.log(`Message flagged as spam: ${spamReason}`);
      }
    }
    
    if (isSpam) {
      
      try {
        console.log(`Attempting to send spam alert to conversation ${event.data.conversationId}`);
        const result = await elevatedClient.messages.sendMessage(event.data.conversationId!, {
          badges: [{
            text: "Chat Spam Alert",
            badgeVisibility: "BUSINESS",
            iconUrl: "https://static.wixstatic.com/shapes/bec40d_8dc570e465714337a93f5f9c691c209b.svg"
          }],
          content: {
            previewText: alertMessage,
            "basic": {
              "items": [{
                "text": alertMessage
              }]
            }
          },
          sourceChannel: "CHAT",
          visibility: "BUSINESS",
          direction: "PARTICIPANT_TO_BUSINESS",
        }, {
          sendAs: "CALLER",
          sendNotifications: false,
        });
        console.log(`Successfully sent spam alert to conversation ${event.data.conversationId}. Result:`, result);
      } catch (sendError) {
        console.error(`Error sending spam alert to conversation ${event.data.conversationId}:`, sendError);
        throw sendError;
      }
    } else {
      console.log(`Message passed all spam checks: ${messageContent}`);
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
