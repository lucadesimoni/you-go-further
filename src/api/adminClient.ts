import type { Role } from "../auth";
import { getConfig } from "../config";
import {
  InMemoryUserStore,
  normalizeNewUser,
  type NewUser,
  type User,
  type UserPatch,
} from "../users";
import { InMemorySettingsStore, defaultSettings, type PlatformSettings } from "../settings";
import { api, isApiConfigured } from "./client";

/**
 * Client access to the admin area (users + platform settings), with the same
 * graceful degradation as the other stores: server-backed when an API is
 * configured, otherwise in-memory singletons seeded from the demo data so the
 * admin area is fully explorable in the pure client-side build.
 */
const localUsers = new InMemoryUserStore();
const localSettings = new InMemorySettingsStore(defaultSettings(getConfig()));

export const adminPersistence = { mode: (): "server" | "local" => (isApiConfigured() ? "server" : "local") };

// --- Users ---
export async function loadUsers(role: Role): Promise<User[]> {
  if (isApiConfigured()) return (await api.usersList(role)).users;
  return localUsers.list();
}

export async function createUser(role: Role, input: NewUser): Promise<User[]> {
  if (isApiConfigured()) return (await api.userCreate(role, input)).users;
  const user = normalizeNewUser(input); // throws on invalid — caller shows the message
  if (await localUsers.get(user.id)) throw new Error("A user with that email already exists.");
  await localUsers.create(user);
  return localUsers.list();
}

export async function updateUser(role: Role, id: string, patch: UserPatch): Promise<User[]> {
  if (isApiConfigured()) return (await api.userUpdate(role, id, patch)).users;
  await localUsers.update(id, patch);
  return localUsers.list();
}

export async function deleteUser(role: Role, id: string): Promise<User[]> {
  if (isApiConfigured()) return (await api.userDelete(role, id)).users;
  await localUsers.remove(id);
  return localUsers.list();
}

// --- Platform settings ---
export async function loadSettings(role: Role): Promise<PlatformSettings> {
  if (isApiConfigured()) return (await api.settingsGet(role)).settings;
  return localSettings.get();
}

export async function saveSettings(role: Role, patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
  if (isApiConfigured()) return (await api.settingsUpdate(role, patch)).settings;
  return localSettings.update(patch);
}
