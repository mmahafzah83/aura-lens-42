// Single source of truth for the Aura WhatsApp number.
// E.164 digits only — no "+", no spaces. Empty until the Meta number is provisioned.
export const AURA_WHATSAPP_NUMBER = "";

export const WHATSAPP_PAIRING_ENABLED = AURA_WHATSAPP_NUMBER.length > 0;

// Temporary gate: only these accounts see the pairing card until the webhook ships.
export const WHATSAPP_PAIRING_ALLOWLIST = ["9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3"];