import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { UserMenu } from "./user-menu";

export default function HubLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/" className="font-semibold">
            Roundtable Tools
          </Link>
          <Suspense fallback={<div className="h-8 w-32 animate-pulse rounded-md bg-muted" />}>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
