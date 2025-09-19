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
  CopyClipboard,
} from "@wix/design-system";
import "@wix/design-system/styles.global.css";
import { dashboard } from "@wix/dashboard";
import { createClient } from "@wix/sdk";
import TagManager from "react-gtm-module";
import { embeddedScripts, appInstances } from "@wix/app-management";

// KV Storage Toggle Component
// This component manages the state of the "Get Alert on Spam Messages?" toggle using KV storage
const KVStorageToggle = () => {
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
        <Text size="small">Loading toggle settings...</Text>
        <Loader size="tiny" />
      </Box>
    );
  }

  return (
    <Box direction="vertical" gap="SP2">
      <FormField
        label="Get Alert on Spam Messages?"
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
          ? "You will receive an alert when a spam message is detected."
          : "You will not receive an alert when a spam message is detected."
        }
      </Text>
    </Box>
  );
};

// Testing Component with sample messages and quick actions
const TestingSection = ({ siteUrl, siteId }: { siteUrl?: string; siteId?: string }) => {
  const sampleMessages = [
    "Your solution doesn't work! I can't do [process №1, process № 2, process №3]. Jesus Christ, how much of a jerk can you be? WTF is your gain from there? I've fu###g paid you $$$!",
    "This is Wix support. There is an issue on your website."
  ];

  const liveSiteUrl = siteUrl || '#';
  const adminChatUrl = siteId ? `https://manage.wix.com/dashboard/${siteId}/inbox` : '#';

  return (
    <Box direction="vertical" gap="SP3">
      <SectionHelper
        title="How to Test"
        actionText=""
        onAction={() => {}}
        onClose={() => {}}
      >
        <Box direction="vertical" gap="SP2">
          <Text size="small">
            Copy these sample messages to test the spam detection:
          </Text>
          
          {sampleMessages.map((message, index) => (
            <Box key={index} direction="vertical" gap="SP1">
              <Text size="small" weight="bold">
                Sample {index + 1}:
              </Text>
              <CopyClipboard value={message} resetTimeout={1500}>
                {({ isCopied, copyToClipboard }) => (
                  <Input
                    readOnly
                    value={message}
                    suffix={
                      <Box verticalAlign="middle" marginRight="SP1">
                        <TextButton
                          onClick={() => copyToClipboard()}
                          size="small"
                          prefixIcon={<Icons.DuplicateSmall />}
                        >
                          {!isCopied ? 'Copy' : 'Copied!'}
                        </TextButton>
                      </Box>
                    }
                  />
                )}
              </CopyClipboard>
            </Box>
          ))}
          
          <Box gap="SP2" direction="horizontal">
            <Button
              as="a"
              href={liveSiteUrl}
              target="_blank"
              disabled={!siteUrl}
              prefixIcon={<Icons.ExternalLink />}
            >
              Open Live Site
            </Button>
            <Button
              as="a"
              href={adminChatUrl}
              target="_blank"
              disabled={!siteId}
              prefixIcon={<Icons.Chat />}
            >
              Open Admin Chat
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

const tagManagerArgs = {
  gtmId: "GTM-WZQPMC7",
};

function App() {
  TagManager.initialize(tagManagerArgs);
  const appId = "1b7fc338-869b-4f77-92bb-9de00fe0bb6b"
  const [client, setClient] = React.useState(null as any);
  // Hard code the message content for black and white site functionality
  const [message, setMessage] = React.useState({
    _id: "chat-spam-alert",
    title: "Chat Spam Alert",
    description: "Block spam messages like sales, marketing, and unsolicited messages.",
    image: "https://static.wixstatic.com/media/bec40d_eeeb3626d1314775af5dded27f01fbff~mv2.png",
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
                      <KVStorageToggle />
                      <TestingSection siteUrl={instanceData?.site?.url} siteId={instanceData?.site?.siteId} />
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
