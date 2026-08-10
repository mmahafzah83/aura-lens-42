// Single source of truth for the Aura WhatsApp number.
// E.164 digits only — no "+", no spaces. Empty until the Meta number is provisioned.
export const AURA_WHATSAPP_NUMBER = "";

export const WHATSAPP_PAIRING_ENABLED = AURA_WHATSAPP_NUMBER.length > 0;

// Temporary gate: only admins see the pairing card until the webhook ships.
// Membership is a role, never a compiled-in account.
export const WHATSAPP_PAIRING_ADMIN_ONLY = true;
