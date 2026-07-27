import { storage } from "./storage";

/** The signed session token issued by the platform, persisted across launches. */
const TOKEN_KEY = "ygf.token";
const ACCOUNT_KEY = "ygf.account";

export interface MobileAccount {
  id: string;
  name: string;
  email: string;
  role: "athlete" | "coach" | "nutritionist" | "admin" | "owner";
  tier: "free" | "pro" | "elite";
}

let token: string | null = null;

export function currentToken(): string | null {
  return token;
}

export async function restoreSession(): Promise<MobileAccount | null> {
  token = await storage.get(TOKEN_KEY);
  const raw = await storage.get(ACCOUNT_KEY);
  if (!token || !raw) return null;
  try {
    return JSON.parse(raw) as MobileAccount;
  } catch {
    return null;
  }
}

export async function saveSession(newToken: string, account: MobileAccount): Promise<MobileAccount> {
  token = newToken;
  await storage.set(TOKEN_KEY, newToken);
  await storage.set(ACCOUNT_KEY, JSON.stringify(account));
  return account;
}

export async function clearSession(): Promise<void> {
  token = null;
  await storage.remove(TOKEN_KEY);
  await storage.remove(ACCOUNT_KEY);
}
