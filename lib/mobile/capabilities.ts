export type MobileCapabilities = {
  isNative: boolean;
  canPush: boolean;
  canCamera: boolean;
  canShare: boolean;
  canBiometric: boolean;
  canSecureStorage: boolean;
};

export const webMobileCapabilities: MobileCapabilities = {
  isNative: false,
  canPush: false,
  canCamera: true,
  canShare: true,
  canBiometric: false,
  canSecureStorage: false
};

export function capabilityLabel(capability: keyof MobileCapabilities, enabled: boolean) {
  return `${capability}: ${enabled ? "available" : "future"}`;
}

export function safeSharePayload(input: { title: string; text?: string; url: string }) {
  return {
    title: input.title.slice(0, 80),
    text: input.text?.slice(0, 160),
    url: input.url
  };
}
