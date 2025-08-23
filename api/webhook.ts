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

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI API timeout after 10 seconds')), 10000);
    });

    const moderationPromise = openai.moderations.create({
      input: content,
    });

    const moderation = await Promise.race([moderationPromise, timeoutPromise]) as any;
    console.log(`OpenAI moderation API call completed successfully`);

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

// Generate suggested response for agents using OpenAI
async function generateSuggestedResponse(content: string, spamReason: string): Promise<string> {
  try {
    const prompt = `You are a helpful customer service agent. A customer has sent a message that was flagged as potential spam due to: ${spamReason}.

The customer's message was: "${content}"

Please provide a professional, helpful, and courteous response that:
1. Acknowledges their message briefly
2. Politely explains that you need to verify their request
3. Asks for additional information or clarification
4. Maintains a professional and helpful tone
5. Is VERY concise (1-2 short sentences maximum, aim for under 100 characters)

Your response should be helpful while being cautious about potential spam. Keep it brief and professional.`;

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI chat completion timeout after 15 seconds')), 15000);
    });

    const completionPromise = openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a professional customer service agent who helps customers while being cautious about spam. Keep responses brief and under 100 characters."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 80,
      temperature: 0.7,
    });

    const completion = await Promise.race([completionPromise, timeoutPromise]) as any;

    let suggestedResponse = completion.choices[0]?.message?.content?.trim();
    console.log(`Generated suggested response: ${suggestedResponse}`);
    
    // If no response generated or it's too long, use a very short fallback
    if (!suggestedResponse || suggestedResponse.length > 100) {
      suggestedResponse = "Thank you for your message. Please provide more details so I can assist you better.";
    }
    
    return suggestedResponse;
  } catch (error) {
    console.error('Error generating suggested response:', error);
    // Fallback response if OpenAI fails
    return "Thank you for your message. Please provide more details so I can assist you better.";
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
  
  // Add overall timeout to prevent hanging
  const overallTimeout = setTimeout(() => {
    console.error('Message processing timed out after 30 seconds');
  }, 30000);
  
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
    
    console.log(`Starting spam detection process for message: "${messageContent}"`);

      if (legacySpamResult) {
        // Wix keyword detected - highest priority, skip OpenAI check
        isSpam = true;
        alertMessage = "🚨 Scammer likes to pretend to be Wix Support or Wix Sales to get your money. Don't fall for it!";
        spamReason = "Wix keyword detected";
        console.log(`Message flagged as spam: ${spamReason}`);
        console.log(`Alert message length: ${alertMessage.length} characters`);
      } else {
        // PRIORITY 2: Only run OpenAI check if Wix keyword not found
        console.log(`No Wix keyword found, running OpenAI moderation check...`);
        
        try {
          console.log(`Starting OpenAI moderation check...`);
          const spamCheck = await checkSpamWithOpenAI(messageContent || '');
          console.log(`OpenAI spam check result:`, spamCheck);

          if (spamCheck.isSpam) {
            isSpam = true;
            alertMessage = `🚨 Spam detected: ${spamCheck.reason}. Please review this message carefully.`;
            spamReason = `OpenAI: ${spamCheck.reason}`;
            console.log(`Message flagged as spam: ${spamReason}`);
            console.log(`Alert message length: ${alertMessage.length} characters`);
          }
        } catch (openAIError) {
          console.error('OpenAI moderation check failed, falling back to basic content analysis:', openAIError);
          
          // Fallback: Check for obvious problematic content patterns
          const lowerContent = (messageContent || '').toLowerCase();
          const hasProfanity = /\b(fuck|shit|damn|bitch|asshole|jerk|wtf)\b/.test(lowerContent);
          const hasAggressiveLanguage = /\b(your solution doesn't work|can't do|how much of a jerk|what the fuck|paid you)\b/.test(lowerContent);
          
          if (hasProfanity || hasAggressiveLanguage) {
            isSpam = true;
            alertMessage = "🚨 Potentially problematic message detected. Please review this message carefully.";
            spamReason = "Fallback: aggressive language or profanity detected";
            console.log(`Message flagged as spam using fallback: ${spamReason}`);
            console.log(`Alert message length: ${alertMessage.length} characters`);
          }
        }
      }

    // Generate suggested response for agents if spam is detected
    let suggestedResponse = "";
    if (isSpam) {
      try {
        console.log(`Starting to generate suggested response for spam reason: ${spamReason}`);
        suggestedResponse = await generateSuggestedResponse(messageContent || '', spamReason);
        console.log(`Generated suggested response for agent: ${suggestedResponse}`);
        console.log(`Suggested response length: ${suggestedResponse.length} characters`);
      } catch (error) {
        console.error('Error generating suggested response:', error);
        suggestedResponse = "Thank you for your message. I'd be happy to help you. Could you please provide more details about your request so I can assist you better?";
      }
    }

    if (isSpam) {

      try {
        console.log(`Starting to send spam alert to conversation ${event.data.conversationId}`);
        // Truncate the suggested response to fit within the 256 character limit
        const maxPreviewLength = 256;
        const alertPrefix = `${alertMessage}\n\n💡 Suggested Response: `;
        const availableLength = maxPreviewLength - alertPrefix.length;
        
        let truncatedResponse = suggestedResponse;
        if (suggestedResponse.length > availableLength) {
          truncatedResponse = suggestedResponse.substring(0, availableLength - 3) + '...';
        }
        
        const finalPreviewText = alertPrefix + truncatedResponse;
        const fullMessageText = `${alertMessage}\n\n💡 Suggested Response for Agent:\n${suggestedResponse}`;
        
        console.log(`Final preview text length: ${finalPreviewText.length}/${maxPreviewLength} characters`);
        console.log(`Full message text length: ${fullMessageText.length} characters`);
        console.log(`Preview text (truncated): "${finalPreviewText}"`);
        console.log(`Full message text: "${fullMessageText}"`);
        
        // Send spam alert with:
        // - previewText: Truncated to 256 chars for display compliance
        // - basic.text: Full content for agents to see complete context
        const result = await elevatedClient.messages.sendMessage(event.data.conversationId!, {
          badges: [{
            text: "Chat Spam Alert",
            badgeVisibility: "BUSINESS",
            iconUrl: "https://static.wixstatic.com/shapes/bec40d_8dc570e465714337a93f5f9c691c209b.svg"
          }],
          content: {
            // previewText: Limited to 256 characters for display purposes
            previewText: finalPreviewText,
            "basic": {
              "items": [{
                // text: Full content without truncation for agents to see complete context
                "text": fullMessageText
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
    
    // Clear the overall timeout since processing completed successfully
    clearTimeout(overallTimeout);
    console.log(`Message processing completed successfully for conversation: ${event.data.conversationId}`);
  } catch (error) {
    console.error(`Error processing message sent to business event:`, error);
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
