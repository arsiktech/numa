const PRIVATE_KEY_TOKEN = /(?:^|[^a-fA-F0-9])(?:0x)?[a-fA-F0-9]{64}(?:$|[^a-fA-F0-9])/;

export function walletFreeTextLooksSecret(input: string) {
  const value = input.trim();
  if (!value) return false;
  if (PRIVATE_KEY_TOKEN.test(value)) return true;
  return value.split(/\s+/).filter(Boolean).length >= 12;
}
