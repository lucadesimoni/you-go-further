import type { Role } from "../auth";
import type { SessionFeedback } from "../feedback";
import { api, isApiConfigured, type NewFeedback } from "./client";

/**
 * Client-side feedback persistence with graceful degradation:
 * - when an API is configured, feedback lives on the server (follows the athlete
 *   across devices);
 * - otherwise it falls back to localStorage so the loop still works offline /
 *   in the pure client-side build.
 */

const KEY = "ygf.feedback.v1";

function readLocal(): SessionFeedback[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    return raw ? (JSON.parse(raw) as SessionFeedback[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: SessionFeedback[]): SessionFeedback[] {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore quota / disabled storage */
  }
  return list;
}

export const feedbackPersistence = { mode: (): "server" | "local" => (isApiConfigured() ? "server" : "local") };

export async function loadFeedback(role: Role): Promise<SessionFeedback[]> {
  if (isApiConfigured()) return (await api.feedbackList(role)).feedback;
  return readLocal();
}

export async function addFeedback(role: Role, entry: NewFeedback): Promise<SessionFeedback[]> {
  if (isApiConfigured()) return (await api.feedbackAdd(role, entry)).feedback;
  const fb: SessionFeedback = { id: `${Date.now()}`, date: new Date().toISOString(), ...entry };
  return writeLocal([fb, ...readLocal()]);
}

export async function clearFeedback(role: Role): Promise<SessionFeedback[]> {
  if (isApiConfigured()) return (await api.feedbackClear(role)).feedback;
  return writeLocal([]);
}
