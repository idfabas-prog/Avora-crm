type TwilioModule = {
  default?: (accountSid: string, authToken: string) => {
    messages: {
      create(input: {
        body: string;
        to: string;
        from?: string;
        messagingServiceSid?: string;
        statusCallback?: string;
      }): Promise<{ sid: string; status: string }>;
    };
  };
  validateRequest?: (
    authToken: string,
    twilioHeader: string,
    url: string,
    params: Record<string, string>
  ) => boolean;
};

async function loadTwilio() {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string
  ) => Promise<TwilioModule>;

  return dynamicImport("twilio");
}

export function communicationsMode() {
  return process.env.COMMUNICATIONS_MODE ?? "development";
}

export function liveSmsEnabled() {
  return (
    communicationsMode() === "production" &&
    process.env.COMMUNICATIONS_ALLOW_LIVE_SEND === "true"
  );
}

export async function sendTwilioSms({
  to,
  from,
  body
}: {
  to: string;
  from: string;
  body: string;
}) {
  if (!liveSmsEnabled()) {
    return {
      provider: "development",
      providerMessageId: `sim_${crypto.randomUUID()}`,
      status: "sent",
      simulated: true
    };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken) {
    throw new Error("Twilio is not configured");
  }

  const twilio = await loadTwilio();
  const createClient = twilio.default;

  if (!createClient) {
    throw new Error("Twilio helper library is unavailable");
  }

  const client = createClient(accountSid, authToken);
  const message = await client.messages.create({
    body,
    to,
    from: messagingServiceSid ? undefined : from,
    messagingServiceSid,
    statusCallback: process.env.TWILIO_WEBHOOK_BASE_URL
      ? `${process.env.TWILIO_WEBHOOK_BASE_URL}/api/webhooks/twilio/status`
      : undefined
  });

  return {
    provider: "twilio",
    providerMessageId: message.sid,
    status: message.status,
    simulated: false
  };
}

export async function validateTwilioRequest({
  signature,
  url,
  params
}: {
  signature: string | null;
  url: string;
  params: Record<string, string>;
}) {
  if (communicationsMode() === "development" && !process.env.TWILIO_AUTH_TOKEN) {
    return true;
  }

  if (!signature || !process.env.TWILIO_AUTH_TOKEN) {
    return false;
  }

  const twilio = await loadTwilio();
  return Boolean(twilio.validateRequest?.(process.env.TWILIO_AUTH_TOKEN, signature, url, params));
}
