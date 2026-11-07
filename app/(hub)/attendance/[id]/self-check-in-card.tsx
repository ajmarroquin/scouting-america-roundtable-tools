"use client";

import { CopyIcon, DownloadIcon, QrCodeIcon, RefreshCwIcon } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checkInLinkAction, resetCheckInLinkAction } from "../actions";

/** The meeting's self check-in link and QR code, for editors to show or print. */
export function SelfCheckInCard({ meetingId, token: initial, status, fileName }: { meetingId: string; token: string | null; status: string; fileName: string }) {
  const [token, setToken] = useState(initial);
  const [qr, setQr] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, start] = useTransition();
  // The site's address, read in the browser (blank while rendering on the server).
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const url = token && origin ? `${origin}/m/${token}` : "";
  useEffect(() => {
    if (!url) return;
    // Drawn here in the browser: an outside QR service would see the link.
    QRCode.toDataURL(url, { margin: 1, width: 480, errorCorrectionLevel: "M" }).then(setQr, () => setQr(""));
  }, [url]);

  const get = (action: typeof checkInLinkAction) =>
    start(async () => {
      const r = await action(meetingId);
      if (r.ok && r.token) {
        setToken(r.token);
        setConfirmReset(false);
        if (action === resetCheckInLinkAction) toast.success(r.message);
      } else toast.error(r.message);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Self check-in</CardTitle>
        <CardDescription>{status}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!token ? (
          <Button className="w-fit" variant="outline" disabled={pending} onClick={() => get(checkInLinkAction)}>
            <QrCodeIcon /> Show QR code and link
          </Button>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element -- a data URL drawn in the browser
              <img src={qr} alt="QR code for self check-in" className="size-44 rounded-lg border bg-white p-1" />
            )}
            <div className="flex min-w-0 flex-col gap-2 text-sm">
              <p className="break-all font-mono text-xs">{url}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Copied the link."), () => toast.error("Couldn't copy. Select the link and copy it."))}
                >
                  <CopyIcon /> Copy link
                </Button>
                {qr && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={qr} download={fileName}>
                      <DownloadIcon /> Download QR code
                    </a>
                  </Button>
                )}
                {confirmReset ? (
                  <>
                    <Button size="sm" variant="destructive" disabled={pending} onClick={() => get(resetCheckInLinkAction)}>
                      Yes, make a new link
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                      Keep this one
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)}>
                    <RefreshCwIcon /> Reset link
                  </Button>
                )}
              </div>
              {confirmReset && <p className="text-xs text-muted-foreground">The old link and QR code stop working. Use this if the link has spread too far.</p>}
              <p className="text-xs text-muted-foreground">
                People enter their email and last name. They see only their own first name and units, and never the contact list.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
