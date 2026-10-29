import { ClipboardCheckIcon, ContactRoundIcon, ShieldCheckIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { visibleTools, type Tool } from "@/lib/tools/registry";

const ICONS: Record<string, LucideIcon> = {
  contacts: ContactRoundIcon,
  attendance: ClipboardCheckIcon,
  users: ShieldCheckIcon,
};

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Tools</h1>
      <Suspense fallback={<ToolGridSkeleton />}>
        <ToolGrid />
      </Suspense>
    </div>
  );
}

async function ToolGrid() {
  const user = await requireUser();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {visibleTools(user.role).map((tool) =>
        tool.status === "live" ? (
          <Link key={tool.slug} href={tool.href} className="rounded-xl focus-visible:outline-2">
            <ToolCard tool={tool} />
          </Link>
        ) : (
          <ToolCard key={tool.slug} tool={tool} />
        ),
      )}
    </div>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  const Icon = ICONS[tool.slug];
  const live = tool.status === "live";
  return (
    <Card className={live ? "h-full transition-colors hover:bg-muted/50" : "h-full opacity-70"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {Icon && <Icon className="size-5" aria-hidden />}
          {tool.name}
          {!live && <Badge variant="outline">Coming soon</Badge>}
        </CardTitle>
        <CardDescription>{tool.description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function ToolGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
