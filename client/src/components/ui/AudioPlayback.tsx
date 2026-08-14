import { useState } from "react";
import { Play, RefreshCw } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function AudioPlayback({ fileId, label = "Play recording" }: { fileId: number; label?: string }) {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const playback = trpc.files.requestAudioPlayback.useMutation({
    onSuccess(data) {
      setUrl(data.url);
    },
    onError(error) {
      toast.error("Could not prepare audio playback", errorMessage(error));
    },
  });

  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    <Button size="sm" variant="outline" busy={playback.isPending} leadingIcon={url ? <RefreshCw className="size-3.5" /> : <Play className="size-3.5" />} onClick={() => playback.mutate({ fileId })}>
      {url ? "Refresh player" : label}
    </Button>
    {url ? <audio controls preload="metadata" className="h-9 max-w-full" src={url} onError={() => toast.warning("Playback link expired", "Select Refresh player to request a new protected audio link.")}>Your browser cannot play this recording.</audio> : null}
  </div>;
}
