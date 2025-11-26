import React, { useEffect } from "react";
import * as Icons from "@wix/wix-ui-icons-common";
import {
  Box,
  Image,
  Card,
  WixDesignSystemProvider,
  MarketingPageLayout,
  MarketingPageLayoutContent,
  Page,
  Loader,
  SkeletonGroup,
  SkeletonRectangle,
  ToggleSwitch,
  FormField,
  Text,
  Button,
  SectionHelper,
  Input,
  TextButton,
} from "@wix/design-system";
import "@wix/design-system/styles.global.css";
import { dashboard } from "@wix/dashboard";
import { createClient } from "@wix/sdk";
import { embeddedScripts, appInstances } from "@wix/app-management";
import MembersList from "./MembersList";

// Gravatar Toggle Component
// This component manages the state of the "Auto Populate Profile Images" toggle using KV storage
const GravatarToggle = () => {
  const [isEnabled, setIsEnabled] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const API_BASE_URL = '/api';

  // Get the current toggle state from KV storage
  const getToggleState = async () => {
    try {
      const instance = new URLSearchParams(window.location.search).get('instance');
      const url = instance
        ? `${API_BASE_URL}/toggle-state?instance=${encodeURIComponent(instance)}`
        : `${API_BASE_URL}/toggle-state`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setIsEnabled(data.isEnabled);
      setIsLoading(false);
    } catch (err: any) {
      console.error('Error fetching toggle state:', err);
      setError(err.message || "Failed to get toggle state");
      setIsLoading(false);
    }
  };

  // Update toggle state in KV storage
  const updateToggleState = async (enabled: boolean) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const instance = new URLSearchParams(window.location.search).get('instance');
      const url = instance
        ? `${API_BASE_URL}/toggle-state?instance=${encodeURIComponent(instance)}`
        : `${API_BASE_URL}/toggle-state`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isEnabled: enabled }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setIsEnabled(data.isEnabled);
      setIsLoading(false);
    } catch (err: any) {
      console.error('Error updating toggle state:', err);
      setError(err.message || "Failed to update toggle state");
      setIsLoading(false);
    }
  };

  // Handle toggle change
  const handleToggleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateToggleState(event.target.checked);
  };

  // Load initial state
  React.useEffect(() => {
    getToggleState();
  }, []);

  if (isLoading) {
    return (
      <Box direction="vertical" gap="SP2">
        <Text size="small">Loading settings...</Text>
        <Loader size="tiny" />
      </Box>
    );
  }

  return (
    <Box direction="vertical" gap="SP2">
      <FormField
        label="Auto Populate Profile Images?"
        labelPlacement="left"
        stretchContent={false}
      >
        <ToggleSwitch
          checked={isEnabled}
          onChange={handleToggleChange}
          disabled={isLoading}
        />
      </FormField>
      {error && (
        <Text size="small" color="destructive">
          {error}
        </Text>
      )}
      <Text size="small" secondary>
        {isEnabled 
          ? "Profile images will be automatically populated from Gravatar when members sign up."
          : "Profile images will not be automatically populated. Members can set their own images."
        }
      </Text>
    </Box>
  );
};

// Information Component explaining how Gravatar works
const InfoSection = ({ siteUrl, siteId }: { siteUrl?: string; siteId?: string }) => {
  const liveSiteUrl = siteUrl || '#';

  return (
    <Box direction="vertical" gap="SP3">
      <SectionHelper
        title="How It Works"
        actionText=""
        onAction={() => {}}
        onClose={() => {}}
      >
        <Box direction="vertical" gap="SP2">
          <Text size="small">
            When enabled, this app automatically populates profile images for new members using Gravatar:
          </Text>
          <Box direction="vertical" gap="SP1">
            <Text size="small" weight="bold">
              1. Member Signs Up
            </Text>
            <Text size="small" secondary>
              When a new member registers on your site, the app detects the signup event.
            </Text>
          </Box>
          <Box direction="vertical" gap="SP1">
            <Text size="small" weight="bold">
              2. Gravatar Lookup
            </Text>
            <Text size="small" secondary>
              The app generates a Gravatar URL based on the member's email address using MD5 hashing.
            </Text>
          </Box>
          <Box direction="vertical" gap="SP1">
            <Text size="small" weight="bold">
              3. Profile Image Update
            </Text>
            <Text size="small" secondary>
              If the member doesn't already have a profile image, it's automatically set to their Gravatar image (or a default identicon if no Gravatar exists).
            </Text>
          </Box>
          
          <Box gap="SP2" direction="horizontal" marginTop="SP2">
            <Button
              as="a"
              href={liveSiteUrl}
              target="_blank"
              disabled={!siteUrl}
              prefixIcon={<Icons.ExternalLink />}
            >
              Open Live Site
            </Button>
          </Box>
        </Box>
      </SectionHelper>
    </Box>
  );
};

function inIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

function App() {
  const appId = "655104d6-d14c-42d8-8197-38384e647359"
  const [client, setClient] = React.useState(null as any);
  const [showMembersList, setShowMembersList] = React.useState(false);
  // Hard code the message content for Gravatar app
  const [message, setMessage] = React.useState({
    _id: "gravatar-auto-profile-images",
    title: "Gravatar: Auto Profile Images",
    description: "Automatically populate profile images for new members using Gravatar based on their email addresses.",
    image: "https://secure.gravatar.com/avatar/00000000000000000000000000000000?d=identicon&f=y",
    redirectUrl: "https://www.wix.com"
  } as any);
  const token = new URLSearchParams(window.location.search).get("token");
  const [isUpgraded] = React.useState(false);
  const [instanceData, setInstanceData] = React.useState({
    instance: {
      isFree: true,
      availablePlans: [],
      instanceId: "",
    },
  } as any);

  const URLS = {
    editorUrl: `https://www.wix.com/editor/${instanceData?.site?.siteId}`,
    upgradeUrl: `https://www.wix.com/apps/upgrade/${appId}?appInstanceId=${instanceData?.instanceId}`,
  };

  useEffect(() => {
    try {
      if (inIframe()) {
        var c = createClient({
          host: dashboard.host(),
          auth: dashboard.auth(),
          modules: {
            dashboard,
            embeddedScripts,
            appInstances,
          },
        });
        setClient(c);
      }
    } catch (error) {
      throw error;
    }
  }, []);

  useEffect(() => {
    // Get app instance data using Wix API
    if (client) {
      client.appInstances.getAppInstance()
        .then((data: any) => {
          setInstanceData(data);
        })
        .catch((error: any) => {
          console.error("Error getting app instance:", error);
        });
    }
  }, [client]);

  useEffect(() => {
    if (token && message?.redirectUrl) {
      window.location.href = `https://www.wix.com/installer/install?token=${token}&appId=${appId}&redirectUrl=${message.redirectUrl}`;
    }
  }, [token, message]);

  if (token) {
    return (
      <WixDesignSystemProvider features={{ newColorsBranding: true }}>
        <Page height="100vh">
          <Page.Content>
            <Box height={"90vh"} direction="vertical" verticalAlign="middle">
              <Loader text="Loading" />
            </Box>
          </Page.Content>
        </Page>
      </WixDesignSystemProvider>
    );
  }

  // Show members list page
  if (showMembersList) {
    return (
      <WixDesignSystemProvider features={{ newColorsBranding: true }}>
        <Page height="100vh">
          <Page.Content>
            <Box padding="SP6">
              <MembersList onBack={() => setShowMembersList(false)} />
            </Box>
          </Page.Content>
        </Page>
      </WixDesignSystemProvider>
    );
  }

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Card>
        <MarketingPageLayout
          removeImageHorizontalPadding
          removeImageVerticalPadding
          content={
            <Box height="840px" verticalAlign="middle">
              {message._id ? (
                <MarketingPageLayoutContent
                  title={message.title}
                  content={message.description}
                  actions={
                    <Box gap="SP2" direction="vertical">
                      {/* <Box gap="SP2">
                        <Button
                          suffixIcon={<Icons.Edit />}
                          disabled={!instanceData?.site?.siteId}
                          as="a"
                          href={URLS.editorUrl}
                          target="_blank"
                        >
                          {"Edit Site"}
                        </Button>
                        <Button
                          suffixIcon={<Icons.PremiumFilled />}
                          disabled={!instanceData?.instanceId}
                          skin={isUpgraded ? "premium-light" : "premium"}
                          as="a"
                          href={URLS.upgradeUrl}
                          target="_blank"
                        >
                          {isUpgraded ? "Manage Plan" : "Upgrade to set live"}
                        </Button>
                      </Box> */}
                      <GravatarToggle />
                      <Box gap="SP2" direction="horizontal" marginTop="SP2">
                        <Button
                          prefixIcon={<Icons.Add />}
                          onClick={() => setShowMembersList(true)}
                        >
                          Add avatar to existing members
                        </Button>
                      </Box>
                      <InfoSection siteUrl={instanceData?.site?.url} siteId={instanceData?.site?.siteId} />
                    </Box>
                  }
                />
              ) : (
                <MarketingPageLayoutContent
                  title={
                    <SkeletonGroup skin="light">
                      <Box gap="SP2" direction="vertical">
                        <SkeletonRectangle height={"72px"} width={"396px"} />
                      </Box>
                    </SkeletonGroup>
                  }
                  content={
                    <SkeletonGroup skin="light">
                      <Box gap="SP2" direction="vertical">
                        <SkeletonRectangle height={"48px"} width={"396px"} />
                      </Box>
                    </SkeletonGroup>
                  }
                  actions={
                    <Box gap="SP2">
                      <SkeletonGroup skin="light">
                        <SkeletonRectangle height={"36px"} width={"129px"} />
                      </SkeletonGroup>
                      <SkeletonGroup skin="light">
                        <SkeletonRectangle height={"36px"} width={"207px"} />
                      </SkeletonGroup>
                    </Box>
                  }
                />
              )}
            </Box>
          }
          image={
            <Image src={message.image} />
          }
        />
      </Card>
    </WixDesignSystemProvider>
  );
}

export default App;
