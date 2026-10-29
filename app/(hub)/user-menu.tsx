import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { SignOutButton } from "./sign-out-button";

export async function UserMenu() {
  const user = await requireUser();
  return (
    <div className="flex min-w-0 items-center gap-3 text-sm">
      <span className="hidden truncate text-muted-foreground sm:inline">{user.email}</span>
      <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
      <SignOutButton />
    </div>
  );
}
