export const config = {
  runtime: 'edge',
};

interface FakeEmailCheckResponse {
  isFake: boolean;
  domain: string;
  email?: string;
  error?: string;
}

interface IsFakeMailResponse {
  domain: string;
  isDisposable: boolean;
  isPublicProvider: boolean;
  mx: string[];
  source: string;
}

async function checkEmailWithIsFakeMail(emailOrDomain: string): Promise<FakeEmailCheckResponse> {
  try {
    // Extract domain from email if full email is provided
    const domain = emailOrDomain.includes('@') 
      ? emailOrDomain.split('@')[1] 
      : emailOrDomain;

    if (!domain) {
      return {
        isFake: false,
        domain: emailOrDomain,
        error: 'Invalid email or domain format'
      };
    }

    const response = await fetch(`https://isfakemail.com/api/check?url=${encodeURIComponent(domain)}`);
    
    if (!response.ok) {
      console.error(`IsFakeMail API error: ${response.status} ${response.statusText}`);
      return {
        isFake: false,
        domain,
        error: `API request failed: ${response.status}`
      };
    }

    const data: IsFakeMailResponse = await response.json();
    
    return {
      isFake: data.isDisposable === true,
      domain,
      email: emailOrDomain.includes('@') ? emailOrDomain : undefined
    };
  } catch (error) {
    console.error('Error checking email with IsFakeMail:', error);
    return {
      isFake: false,
      domain: emailOrDomain,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const domain = url.searchParams.get('domain');
    
    const emailOrDomain = email || domain;
    
    if (!emailOrDomain) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required parameter: email or domain' 
        }), 
        { 
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const result = await checkEmailWithIsFakeMail(emailOrDomain);
    
    return new Response(
      JSON.stringify(result), 
      {
        status: 200,
        headers: { 
          'content-type': 'application/json',
          'cache-control': 'public, max-age=300' // Cache for 5 minutes
        }
      }
    );
  } catch (error) {
    console.error('Check email API error:', error);
    
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

// Export the check function for use in other parts of the application
export { checkEmailWithIsFakeMail };
