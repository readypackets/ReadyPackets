import { useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { CheckCircle2, FileAudio, FileQuestion, FileText, Mic, Upload } from "lucide-react";
import { trpc, errorMessage, refreshCsrfToken, csrfToken } from "@/lib/trpc";
import { formatBytes, formatDate } from "@/lib/utils";
import { Button, LinkButton } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { Alert, Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/Surface";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

type Capability = "documents" | "questions" | "recording" | "audio_upload";
type WorkflowStage = { key: string; label: string; order: number; capabilities?: Capability[] };
const AUDIO_EXTENSIONS = new Set(["webm", "wav", "mp3", "m4a", "ogg"]);

function stagesFromUnknown(value: unknown): WorkflowStage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { key?: unknown; label?: unknown; order?: unknown; capabilities?: unknown } => Boolean(item) && typeof item === "object")
    .filter((item) => typeof item.key === "string" && typeof item.label === "string")
    .map((item, index) => ({
      key: item.key as string,
      label: item.label as string,
      order: typeof item.order === "number" ? item.order : index + 1,
      capabilities: Array.isArray(item.capabilities)
        ? item.capabilities.filter((capability): capability is Capability => capability === "documents" || capability === "questions" || capability === "recording" || capability === "audio_upload")
        : ["documents", "questions", "recording"] as Capability[],
    }))
    .sort((left, right) => left.order - right.order);
}

export function WorkflowStagePage() {
  const params = useParams<{ id: string; phaseKey: string }>();
  const orderId = Number(params.id);
  const phaseKey = params.phaseKey ?? "";
  const [, navigate] = useLocation();
  const toast = useToast();
  const detail = trpc.orders.detail.useQuery({ orderId }, { enabled: Number.isFinite(orderId) });
  const filesQuery = trpc.files.listForOrder.useQuery({ orderId }, { enabled: Number.isFinite(orderId) });
  const questions = trpc.orders.questions.useQuery({ orderId }, { enabled: Number.isFinite(orderId) });
  const fileInput = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [microphoneOpen, setMicrophoneOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const deleteFile = trpc.files.delete.useMutation({
    async onSuccess() { await filesQuery.refetch(); toast.success("File removed"); },
    onError(error) { toast.error("Could not remove file", errorMessage(error)); },
  });
  const answerQuestion = trpc.orders.answerQuestion.useMutation({
    async onSuccess() { await questions.refetch(); toast.success("Answer saved"); },
    onError(error) { toast.error("Could not save answer", errorMessage(error)); },
  });

  async function upload(selected: FileList | File[] | null, recordedPitch = false, prerecordedAudio = false) {
    if (!selected || selected.length === 0) return;
    setUploading(true);
    try {
      const post = async (token: string) => {
        const body = new FormData();
        for (const file of Array.from(selected)) body.append("files", file);
        body.append("orderId", String(orderId));
        body.append("category", "intake_attachment");
        body.append("phase", phaseKey);
        if (recordedPitch) body.append("recordedPitch", "true");
        if (prerecordedAudio) body.append("prerecordedAudio", "true");
        const response = await fetch("/api/files/upload", {
          method: "POST", credentials: "same-origin",
          headers: { "x-rp-csrf": token, ...(recordedPitch ? { "x-rp-recorded-pitch": "true" } : {}) }, body,
        });
        let payload: { error?: string; files?: { originalName: string }[]; rejected?: { name: string; reason: string }[] } = {};
        try { payload = await response.json() as typeof payload; } catch { /* status below explains the failure */ }
        return { response, payload };
      };
      let token = await refreshCsrfToken();
      let result = await post(token ?? csrfToken() ?? "");
      if (result.response.status === 403 && /csrf|security token/i.test(result.payload.error ?? "")) {
        token = await refreshCsrfToken();
        if (token) result = await post(token);
      }
      if (!result.response.ok) { toast.error("Upload rejected", result.payload.error ?? "The file could not be processed."); return; }
      toast.success(`${result.payload.files?.length ?? 0} file(s) added to this phase`);
      for (const rejected of result.payload.rejected ?? []) toast.warning(`Not uploaded: ${rejected.name}`, rejected.reason);
      await filesQuery.refetch();
    } catch { toast.error("Upload failed", "A network error occurred. Please try again."); }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ""; }
  }

  function stopRecording() {
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") mediaRecorder.current.stop();
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
  }

  async function startRecording() {
    setMicrophoneOpen(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("This browser does not support in-browser audio recording.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      if (!mimeType) { stream.getTracks().forEach((track) => track.stop()); throw new Error("This browser cannot create the required WebM recording."); }
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.current = recorder;
      audioChunks.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunks.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunks.current, { type: mimeType });
        if (blob.size > 0) void upload([new File([blob], `${phaseKey}-recording-${Date.now()}.webm`, { type: mimeType })], true);
      };
      recorder.start();
      setRecordingSeconds(0);
      setRecording(true);
      timer.current = setInterval(() => setRecordingSeconds((value) => value + 1), 1000);
    } catch (error) {
      toast.error("Could not start recording", error instanceof Error ? error.message : "Allow microphone access and try again.");
    }
  }

  if (detail.isLoading || filesQuery.isLoading || questions.isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-72 w-full" /></div>;
  if (!detail.data) return <EmptyState icon={FileText} title="Order not found" description="This order is unavailable or is not associated with your account." action={<LinkButton href="/portal/orders" variant="outline">Back to my orders</LinkButton>} />;

  const stages = stagesFromUnknown(detail.data.workflow?.stages);
  const stage = stages.find((item) => item.key === phaseKey);
  if (!stage) return <><PageHeader title="Workflow phase unavailable" breadcrumb={{ href: `/portal/orders/${orderId}`, label: "Back to order" }} /><Card className="max-w-2xl"><CardHeader title="This phase is not part of the assigned workflow" description="Ask your project team to review the order workflow assignment." /><LinkButton className="mt-5" href={`/portal/orders/${orderId}`} variant="outline">Back to order</LinkButton></Card></>;

  const capabilities = new Set(stage.capabilities ?? []);
  const phaseFiles = (filesQuery.data ?? []).filter((file) => file.phase === stage.key && file.category !== "deliverable");
  const audioFiles = phaseFiles.filter((file) => AUDIO_EXTENSIONS.has((file.extension ?? "").toLowerCase()));
  const documentFiles = phaseFiles.filter((file) => !audioFiles.includes(file));
  const phaseQuestions = (questions.data ?? []).filter((question) => question.phase === stage.key);
  const { order } = detail.data;

  return <>
    <PageHeader title={stage.label} description={`Order ${order.orderNumber} · workflow phase ${stage.order}`} breadcrumb={{ href: `/portal/orders/${orderId}`, label: "Back to order" }} />
    <Alert tone="info" className="mb-6">Files, questions, and recordings in this area belong only to <strong>{stage.label}</strong>. Final deliverables are published separately in My Business Packets.</Alert>
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title={`${stage.label} documents`} description={capabilities.has("documents") ? "Upload supporting documents requested by your project team." : "Documents published by your project team for this phase."} />
        {capabilities.has("documents") ? <><input ref={fileInput} type="file" className="hidden" multiple onChange={(event) => void upload(event.target.files)} /><Button className="mt-4" leadingIcon={<Upload className="size-4" />} busy={uploading} onClick={() => fileInput.current?.click()}>Upload documents</Button></> : null}
        <ul className="mt-4 space-y-2">{documentFiles.length ? documentFiles.map((file) => <li key={file.id} className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2 text-sm"><span className="min-w-0 truncate"><FileText className="mr-1 inline size-4" />{file.originalName} <span className="text-xs text-muted">· {formatBytes(file.sizeBytes)} · {formatDate(file.createdAt)}</span></span>{!file.uploadedByStaff ? <Button size="sm" variant="ghost" onClick={() => deleteFile.mutate({ fileId: file.id })}>Remove</Button> : <Badge tone="teal">Team document</Badge>}</li>) : <li className="text-sm text-muted">No documents for this phase yet.</li>}</ul>
      </Card>
      <Card>
        <CardHeader title={`${stage.label} audio recording`} description={capabilities.has("recording") || capabilities.has("audio_upload") ? "Record an in-browser WebM update or upload approved prerecorded audio when this phase enables the relevant action." : "No customer audio action is enabled for this phase."} />
        <div className="mt-4 flex flex-wrap gap-2">{capabilities.has("recording") ? <Button leadingIcon={<Mic className="size-4" />} variant={recording ? "danger" : "primary"} busy={uploading} onClick={() => recording ? stopRecording() : setMicrophoneOpen(true)}>{recording ? `Stop recording (${recordingSeconds}s)` : `Record ${stage.label} audio`}</Button> : null}{capabilities.has("audio_upload") ? <><input id={`audio-upload-${stage.key}`} className="hidden" type="file" accept="audio/*,.webm,.ogg" onChange={(event) => void upload(event.target.files, false, true)} /><Button variant="outline" leadingIcon={<Upload className="size-4" />} busy={uploading} onClick={() => document.getElementById(`audio-upload-${stage.key}`)?.click()}>Upload audio file</Button></> : null}</div>
        <ul className="mt-4 space-y-2">{audioFiles.length ? audioFiles.map((file) => <li key={file.id} className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2 text-sm"><span className="truncate"><FileAudio className="mr-1 inline size-4" />{file.originalName}</span>{!file.uploadedByStaff ? <Button size="sm" variant="ghost" onClick={() => deleteFile.mutate({ fileId: file.id })}>Remove</Button> : <Badge tone="teal">Team recording</Badge>}</li>) : <li className="text-sm text-muted">No recordings for this phase yet.</li>}</ul>
      </Card>
      {capabilities.has("questions") ? <Card className="lg:col-span-2"><CardHeader title={`${stage.label} questions`} description="Questions assigned by your project team for this specific workflow phase." /><div className="mt-4 space-y-4">{phaseQuestions.length ? phaseQuestions.map((question) => <div key={question.id} className="rounded border border-line p-4"><p className="text-sm font-medium text-ink">{question.question}</p>{question.status === "answered" || question.status === "resolved" ? <p className="mt-2 flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="size-4" /> Answer received</p> : <><Textarea className="mt-3" label="Your answer" value={answers[question.id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} rows={3} /><Button className="mt-3" size="sm" busy={answerQuestion.isPending} disabled={(answers[question.id] ?? "").trim().length === 0} onClick={() => answerQuestion.mutate({ questionId: question.id, body: (answers[question.id] ?? "").trim() })}>Save answer</Button></>}</div>) : <p className="text-sm text-muted">No questions have been assigned to this phase.</p>}</div></Card> : null}
    </div>
    <Modal open={microphoneOpen} onClose={() => setMicrophoneOpen(false)} title="Allow microphone access" description={`Your browser will ask for microphone permission for ${stage.label}.`}><div className="space-y-4"><Alert tone="info">Select <strong>Allow microphone</strong> in the browser prompt. The recording is not uploaded until you stop it.</Alert><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setMicrophoneOpen(false)}>Cancel</Button><Button onClick={() => void startRecording()}>Allow microphone and record</Button></div></div></Modal>
  </>;
}
