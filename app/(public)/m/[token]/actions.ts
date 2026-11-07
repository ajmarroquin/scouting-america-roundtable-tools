"use server";

import { headers } from "next/headers";
import { answer, answerNew, confirm, identify, type Mode, pick, registerNew } from "@/lib/selfcheckin/service";

// The only actions in the app with nobody signed in. Each one goes through
// lib/selfcheckin/service.ts, which checks the token, the time window, and a
// rate limit, and re-checks the person by email and last name. See AGENTS.md.

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}

const mode = (m: unknown): Mode => (m === "rsvp" ? "rsvp" : "check_in");

export async function identifyAction(token: string, input: unknown, m?: Mode) {
  return identify(String(token), input, await clientIp(), new Date(), mode(m));
}

export async function pickAction(token: string, input: unknown, contactId: string, m?: Mode) {
  return pick(String(token), input, String(contactId), await clientIp(), new Date(), mode(m));
}

export async function answerAction(token: string, input: unknown) {
  return answer(String(token), input, await clientIp());
}

export async function answerNewAction(token: string, input: unknown) {
  return answerNew(String(token), input, await clientIp());
}

export async function confirmAction(token: string, input: unknown) {
  return confirm(String(token), input, await clientIp());
}

export async function registerAction(token: string, input: unknown) {
  return registerNew(String(token), input, await clientIp());
}
