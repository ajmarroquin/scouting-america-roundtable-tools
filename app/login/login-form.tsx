"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

const RESEND_AFTER_SECONDS = 30;

type ErrorLike = { status?: number; code?: string } | null | undefined;

function sendError(error: ErrorLike): string {
  if (error?.status === 429) return "Too many requests. Wait a minute and try again.";
  return "We couldn't send a code right now. Try again in a moment.";
}

function verifyError(error: ErrorLike): string {
  if (error?.status === 429) return "Too many tries. Wait a minute and try again.";
  if (error?.code === "TOO_MANY_ATTEMPTS") return "Too many wrong codes. Send a new one.";
  if (error?.code === "OTP_EXPIRED") return "That code expired. Send a new one.";
  return "That code didn't work. Check it, or send a new one.";
}

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function sendCode() {
    setPending(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim(),
      type: "sign-in",
    });
    setPending(false);
    if (error) return setError(sendError(error));
    setCode("");
    setStep("code");
    setResendIn(RESEND_AFTER_SECONDS);
  }

  async function verify(otp: string) {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.emailOtp({ email: email.trim(), otp });
    if (error) {
      setPending(false);
      setCode("");
      return setError(verifyError(error));
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Roundtable Tools</CardTitle>
        <CardDescription>
          {step === "email"
            ? "Sign in with the email an admin added for you."
            : `If ${email.trim()} has access, a 6-digit code is on its way. It expires in 10 minutes.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === "email" ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void sendCode();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Sending…" : "Send code"}
            </Button>
          </form>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === 6) void verify(code);
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="code">Code</Label>
              <InputOTP
                id="code"
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                autoFocus
                disabled={pending}
                value={code}
                onChange={setCode}
                onComplete={(value: string) => void verify(value)}
              >
                <InputOTPGroup>
                  {Array.from({ length: 6 }, (_, i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" disabled={pending || code.length !== 6}>
              {pending ? "Checking…" : "Sign in"}
            </Button>
            <div className="flex items-center justify-between text-sm">
              <Button
                type="button"
                variant="link"
                className="px-0"
                onClick={() => {
                  setStep("email");
                  setError(null);
                }}
              >
                Use a different email
              </Button>
              <Button
                type="button"
                variant="link"
                className="px-0"
                disabled={pending || resendIn > 0}
                onClick={() => void sendCode()}
              >
                {resendIn > 0 ? `Send a new code (${resendIn}s)` : "Send a new code"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
