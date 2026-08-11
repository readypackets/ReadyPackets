/**
 * Admin AI Hub page — session history, message logs, response metrics.
 */
import { useState } from "react";
import { Bot, MessageSquare, BarChart2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Badge, EmptyState, Skeleton } from "@/components/ui/Surface";
import { DataTable } from "@/components/ui/DataDisplay";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";

export function AdminAIHub() {
  const toast = useToast();
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"sessions" | "logs">("sessions");

  const sessions = trpc.tier3.aiHub.listSessions.useQuery({ limit: 100 });
  const sessionDetail = trpc.tier3.aiHub.getSession.useQuery({ id: selectedSession! }, { enabled: selectedSession !== null });
  const responseLogs = trpc.tier3.aiHub.responseLogs.useQuery({ limit: 200 });
  const utils = trpc.useUtils();

  const archiveSession = trpc.tier3.aiHub.archiveSession.useMutation({
    onSuccess: () => { utils.tier3.aiHub.listSessions.invalidate(); setSelectedSession(null); toast.success("Session archived"); },
  });

  const sessionList = sessions.data ?? [];
  const logList = responseLogs.data ?? [];

  const totalTokens = sessionList.reduce((s, sess) => s + (sess.tokenCount ?? 0), 0);
  const totalCostUsd = sessionList.reduce((s, sess) => s + (sess.costMicroUsd ?? 0), 0) / 1_000_000;

  return (
    <>
      <PageHeader title="AI Hub" description="Monitor AI sessions, message history, and response metrics." />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-4 p-4">
          <Bot className="size-8 text-teal shrink-0" />
          <div>
            <p className="text-sm text-muted">Total sessions</p>
            <p className="text-2xl font-bold text-ink">{sessionList.length}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-4">
          <MessageSquare className="size-8 text-navy shrink-0" />
          <div>
            <p className="text-sm text-muted">Total tokens</p>
            <p className="text-2xl font-bold text-ink">{totalTokens.toLocaleString()}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-4">
          <BarChart2 className="size-8 text-success shrink-0" />
          <div>
            <p className="text-sm text-muted">Estimated cost</p>
            <p className="text-2xl font-bold text-ink">${totalCostUsd.toFixed(4)}</p>
          </div>
        </Card>
      </div>

      <div className="mb-4 flex gap-2 border-b border-line">
        {(["sessions", "logs"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${activeTab === tab ? "border-teal text-teal" : "border-transparent text-muted hover:text-ink"}`}>
            {tab === "sessions" ? "Sessions" : "Response logs"}
          </button>
        ))}
      </div>

      {activeTab === "sessions" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <Card>
            {sessionList.length === 0 ? (
              <EmptyState icon={Bot} title="No AI sessions" description="AI sessions will appear here when the AI hub is used." />
            ) : (
              <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Title</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Model</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Status</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Tokens</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Created</th></tr></thead><tbody>
                {sessionList.map((s) => (
                  <tr key={s.id} className="cursor-pointer hover:bg-surface-raised transition-colors border-t border-line" onClick={() => setSelectedSession(s.id)}>
                    <td className="px-4 py-3 text-sm font-medium text-ink">{s.title ?? `Session #${s.id}`}</td>
                    <td className="px-4 py-3 text-sm text-body font-mono">{s.model}</td>
                    <td className="px-4 py-3"><Badge tone={s.status === "active" ? "teal" : s.status === "completed" ? "success" : "neutral"}>{s.status}</Badge></td>
                    <td className="px-4 py-3 text-sm text-body tabular-nums">{(s.tokenCount ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-muted">{new Date(s.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody></table></div>
            )}
          </Card>

          {selectedSession !== null && (
            <Card>
              <CardHeader
                title={sessionDetail.data?.session.title ?? `Session #${selectedSession}`}
                actions={
                  <Button size="sm" variant="ghost" onClick={() => archiveSession.mutate({ id: selectedSession })} busy={archiveSession.isPending}>Archive</Button>
                }
              />
              {sessionDetail.isLoading ? <Skeleton className="mt-4 h-40 w-full" /> : (
                <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
                  {(sessionDetail.data?.messages ?? []).map((m) => (
                    <div key={m.id} className={`rounded-lg p-3 text-sm ${m.role === "user" ? "bg-teal/10 ml-8" : m.role === "assistant" ? "bg-surface-raised mr-8" : "bg-warning/10 text-xs"}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge tone={m.role === "user" ? "teal" : m.role === "assistant" ? "neutral" : "warning"}>{m.role}</Badge>
                        <span className="text-xs text-muted">{(m.tokenCount ?? 0)} tokens</span>
                      </div>
                      <p className="text-body whitespace-pre-wrap line-clamp-6">{m.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {activeTab === "logs" && (
        <Card>
          {logList.length === 0 ? (
            <EmptyState icon={BarChart2} title="No response logs" description="Response logs will appear here when AI calls are made." />
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Model</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Prompt tokens</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Completion tokens</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Latency</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Finish reason</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Date</th></tr></thead><tbody>
              {logList.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="px-4 py-3 text-sm font-mono text-ink">{l.model}</td>
                  <td className="px-4 py-3 text-sm text-body tabular-nums">{(l.promptTokens ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-body tabular-nums">{(l.completionTokens ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-body tabular-nums">{l.latencyMs}ms</td>
                  <td className="px-4 py-3"><Badge tone={l.finishReason === "stop" ? "success" : "warning"}>{l.finishReason ?? "—"}</Badge></td>
                  <td className="px-4 py-3 text-sm text-muted">{new Date(l.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </Card>
      )}
    </>
  );
}
