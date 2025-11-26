# Gravatar: Auto Profile Images

A Wix app that automatically populates profile images for new members using Gravatar based on their email addresses.

## Features

- **Automatic Profile Image Population**: When enabled, the app automatically sets profile images for new members using Gravatar
- **Toggle Control**: Site owners can easily enable or disable the auto-populate feature via a dashboard toggle
- **Smart Detection**: Only updates profile images if the member doesn't already have one
- **Gravatar Integration**: Uses Gravatar's MD5 hash-based email lookup system
- **Default Fallback**: Uses Gravatar's identicon as a default when no Gravatar image exists

## How It Works

1. **Member Signs Up**: When a new member registers on your Wix site, the app detects the signup event via `members.onMemberCreated`
2. **Gravatar Lookup**: The app generates a Gravatar URL based on the member's email address using MD5 hashing
3. **Profile Image Update**: If the member doesn't already have a profile image, it's automatically set to their Gravatar image (or a default identicon if no Gravatar exists)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
   - `KV_REST_API_URL`: Upstash Redis REST API URL
   - `KV_REST_API_TOKEN`: Upstash Redis REST API token
   - `WIX_APP_SECRET`: Your Wix app secret (optional, defaults to hardcoded value)

3. Build the app:
```bash
npm run build
```

## Usage

1. Install the app on your Wix site
2. Navigate to the app settings in your Wix dashboard
3. Toggle "Auto Populate Profile Images" to enable/disable the feature
4. When enabled, new member signups will automatically get Gravatar profile images

## Development

```bash
# Start development server
npm start

# Run tests
npm test

# Build for production
npm run build
```

## API Endpoints

### `/api/toggle-state`
- **GET**: Retrieve the current toggle state for an app instance
- **POST**: Update the toggle state for an app instance

### `/api/webhook`
- **POST**: Handles Wix webhook events, specifically `members.onMemberCreated`

### `/api/health`
- **GET**: Health check endpoint

## Technical Details

- **Runtime**: Vercel Edge Functions
- **Storage**: Upstash Redis for toggle state persistence
- **Gravatar API**: Uses Gravatar's public API with MD5 email hashing
- **Wix SDK**: Uses `@wix/members` for member event handling and profile updates

## License

Private - All rights reserved
