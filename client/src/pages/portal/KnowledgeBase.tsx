import { useMemo, useState } from "react";
import { BookOpen, ChevronRight, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Card, EmptyState, Skeleton } from "@/components/ui/Surface";
import { PageHeader } from "@/components/layout/PortalLayout";
import { formatDateTime } from "@/lib/utils";

type Article = { id: number; title: string; slug: string; category: string | null; excerpt: string | null; bodyMarkdown: string; publishedAt: Date | string | null; updatedAt: Date | string };

export function KnowledgeBasePage() {
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const articles = trpc.knowledgeBase.visible.useQuery(query.trim() ? { query: query.trim() } : undefined);
  const selected = useMemo(() => (articles.data ?? []).find((article) => article.slug === selectedSlug) as Article | undefined, [articles.data, selectedSlug]);

  if (articles.isLoading) return <div className="space-y-4"><Skeleton className="h-12 w-64" /><Skeleton className="h-80 w-full" /></div>;

  return <div className="space-y-6">
    <PageHeader title="Knowledge base" description="Approved guidance, answers, and customer portal help from the ReadyPackets team." />
    <Card className="p-4"><Input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedSlug(null); }} placeholder="Search approved help articles" leadingIcon={<Search className="size-4" />} /></Card>
    <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
      <Card className="p-4"><div className="space-y-2">{(articles.data ?? []).length ? (articles.data as Article[]).map((article) => <button key={article.id} type="button" onClick={() => setSelectedSlug(article.slug)} className={`w-full rounded-xl border p-4 text-left transition ${selectedSlug === article.slug ? "border-teal bg-teal/10" : "border-line hover:border-teal/50 hover:bg-surface-soft"}`}><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-ink">{article.title}</p>{article.category ? <p className="mt-1 text-xs font-medium uppercase tracking-wide text-teal">{article.category}</p> : null}<p className="mt-2 line-clamp-2 text-sm text-body">{article.excerpt || article.bodyMarkdown}</p></div><ChevronRight className="mt-1 size-4 shrink-0 text-muted" /></div></button>) : <EmptyState icon={BookOpen} title="No approved articles found" description="Try another search, or contact support for personal assistance." />}</div></Card>
      <Card className="min-h-[420px] p-6">{selected ? <article><div className="border-b border-line pb-5"><p className="text-xs font-medium uppercase tracking-wide text-teal">{selected.category || "Customer guidance"}</p><h1 className="mt-2 text-2xl font-bold text-ink">{selected.title}</h1><p className="mt-2 text-sm text-muted">Updated {formatDateTime(selected.updatedAt)}</p></div><div className="prose prose-slate mt-6 max-w-none whitespace-pre-wrap text-body dark:prose-invert">{selected.bodyMarkdown}</div></article> : <EmptyState icon={BookOpen} title="Choose an article" description="Select an approved article to read its full guidance." />}</Card>
    </div>
  </div>;
}
