export function NotAllowed({ need }: { need: string }) {
  return <p className="text-sm text-muted-foreground">You need the {need} role for this page. Ask an admin.</p>;
}
