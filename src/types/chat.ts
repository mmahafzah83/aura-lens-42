export interface ChatContext {
  linkedType?: "signal" | "insight" | "framework" | "content" | "general";
  linkedId?: string;
  linkedLabel?: string;
}