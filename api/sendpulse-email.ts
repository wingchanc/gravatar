export const config = {
  runtime: 'edge',
};

interface SendPulseAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SendPulseEmailRequest {
  subject: string;
  template: {
    id: number;
    variables: Record<string, string>;
  };
  from: {
    name: string;
    email: string;
  };
  to: Array<{
    email: string;
    name: string;
  }>;
}

interface SendPulseEmailResponse {
  result: boolean;
  message?: string;
  error?: string;
}

class SendPulseEmailService {
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.clientId = '21b796d386d9ce802feae049bbcba400';
    this.clientSecret = 'f008f5ecfc89a17544fd30820af56c6d';
    
    if (!this.clientId || !this.clientSecret) {
      console.warn('SendPulse credentials not configured. Set SENDPULSE_CLIENT_ID and SENDPULSE_CLIENT_SECRET environment variables.');
    }
  }

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await fetch('https://api.sendpulse.com/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      });

      if (!response.ok) {
        throw new Error(`SendPulse auth failed: ${response.status} ${response.statusText}`);
      }

      const data: SendPulseAuthResponse = await response.json();
      
      this.accessToken = data.access_token;
      // Set expiry to 90% of the actual expiry time for safety
      this.tokenExpiry = Date.now() + (data.expires_in * 1000 * 0.9);
      
      return this.accessToken;
    } catch (error) {
      console.error('Error getting SendPulse access token:', error);
      throw error;
    }
  }

  async sendEmail(emailData: SendPulseEmailRequest): Promise<SendPulseEmailResponse> {
    try {
      const accessToken = await this.getAccessToken();

      // Wrap the email data in an 'email' object as required by SendPulse API
      const payload = {
        email: emailData
      };

      console.log('SendPulse API payload:', JSON.stringify(payload, null, 2));

      const response = await fetch('https://api.sendpulse.com/smtp/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SendPulse email API failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result: SendPulseEmailResponse = await response.json();
      return result;
    } catch (error) {
      console.error('Error sending email via SendPulse:', error);
      throw error;
    }
  }
}

// Create a singleton instance
const sendPulseService = new SendPulseEmailService();

// Function to send fake member alert email
export async function sendFakeMemberAlert(memberEmail: string, adminEmail: string): Promise<boolean> {
  try {
    const targetAdminEmail = adminEmail
    const adminName = ''
    const fromEmail = 'team@certifiedcode.us'
    const fromName = 'Block Fake Email Members by Certified Code'

    const emailData: SendPulseEmailRequest = {
      subject: '🚨 Fake Email Member Detected',
      template: {
        id: 246649, // Template ID provided by user
        variables: {
          member_email: memberEmail
        }
      },
      from: {
        name: fromName,
        email: fromEmail
      },
      to: [
        {
          email: targetAdminEmail,
          name: adminName
        }
      ]
    };

    console.log(`Sending fake member alert email for: ${memberEmail}`);
    const result = await sendPulseService.sendEmail(emailData);
    
    if (result.result) {
      console.log(`✅ Successfully sent fake member alert email for: ${memberEmail}`);
      return true;
    } else {
      console.error(`❌ Failed to send fake member alert email: ${result.message || result.error}`);
      return false;
    }
  } catch (error) {
    console.error('Error in sendFakeMemberAlert:', error);
    return false;
  }
}

// API endpoint for manual email sending (for testing)
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    const { memberEmail, adminEmail } = body;

    if (!memberEmail) {
      return new Response(
        JSON.stringify({ error: 'memberEmail is required' }),
        { 
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const success = await sendFakeMemberAlert(memberEmail, adminEmail);

    return new Response(
      JSON.stringify({ 
        success,
        message: success ? 'Email sent successfully' : 'Failed to send email'
      }),
      {
        status: success ? 200 : 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('SendPulse email API error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }),
      { 
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}

export { SendPulseEmailService };
