import "server-only";
import { waitUntil } from "@vercel/functions";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { account, rateLimit, session, user, verification } from "@/lib/db/schema";
import { emailFailureReason } from "@/lib/email/errors";
import { sendEmail } from "@/lib/email/send";
import { SIGN_IN_CODE_MINUTES, signInCodeEmail } from "@/lib/email/sign-in-code";
import { ensureBootstrapAdmin } from "./bootstrap";
import { trustedOriginsFromEnv } from "./origins";

const DAY = 60 * 60 * 24;

export const auth = betterAuth({
  appName: "Roundtable Tools",
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: trustedOriginsFromEnv(process.env),
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification, rateLimit },
  }),
  user: {
    additionalFields: {
      // input: false keeps users from setting their own role through the auth API.
      role: { type: "string", required: true, defaultValue: "viewer", input: false },
    },
  },
  session: {
    // Volunteers sign in on a phone at the door, so keep sessions long.
    expiresIn: 30 * DAY,
    updateAge: DAY,
  },
  rateLimit: {
    // Serverless instances don't share memory, so counts live in the database.
    storage: "database",
  },
  advanced: {
    ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"] },
    backgroundTasks: { handler: waitUntil },
  },
  databaseHooks: {
    session: {
      create: {
        // A session is only created at sign-in, so this is the last time they signed in.
        async after(created) {
          try {
            await db.update(user).set({ lastSignInAt: new Date() }).where(eq(user.id, created.userId));
          } catch (error) {
            // Never block a sign-in over this.
            console.error("[auth] couldn't record the sign-in time", error);
          }
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/email-otp/send-verification-otp") {
        await ensureBootstrapAdmin(ctx.body?.email);
      }
    }),
  },
  plugins: [
    emailOTP({
      // Only people an admin has added can get a code. Unknown addresses get
      // the same "sent" response, so the form doesn't reveal who has access.
      disableSignUp: true,
      otpLength: 6,
      expiresIn: SIGN_IN_CODE_MINUTES * 60,
      allowedAttempts: 3,
      storeOTP: "hashed",
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in") return;
        try {
          await sendEmail({ to: email, ...signInCodeEmail(otp) });
        } catch (error) {
          // The form says "sent" either way, so this log is the only trace of a failure.
          console.error(`[email] sign-in code didn't send: ${emailFailureReason(error)}`);
          throw error;
        }
      },
    }),
    nextCookies(),
  ],
});
