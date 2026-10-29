import type { Metadata } from "next";
import { Suspense } from "react";
import { NotAllowed } from "@/components/not-allowed";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { importDefaults } from "@/lib/import/apply";
import { ImportFlow } from "./import-flow";

export const metadata: Metadata = { title: "Import roster" };

export default function ImportPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Import the roster</h1>
      <p className="text-sm text-muted-foreground">
        Use Scouting America&apos;s &ldquo;all registered people&rdquo; export (CSV). The file is read in your browser.
        Only adults in the district you pick are sent, and only their name, email, phone, member ID, units, and positions.
        Addresses, birthdates, demographics, and every youth row stay on your computer.
      </p>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Gate />
      </Suspense>
    </div>
  );
}

async function Gate() {
  const user = await requireUser();
  if (!hasRole(user.role, "admin")) return <NotAllowed need="admin" />;
  const defaults = await importDefaults();
  return (
    <ImportFlow
      savedDistrict={defaults.district}
      recent={defaults.recent.map((r) => ({ ...r, at: r.at.toISOString() }))}
    />
  );
}
