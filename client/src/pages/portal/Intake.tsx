/**
 * Phase I intake form and mutual NDA signature.
 *
 * The form is deliberately sectioned and saved as a draft, because the questions
 * demand considered answers rather than a single sitting. Drafts save without
 * validation; the minimum lengths are enforced only at submission, which is also
 * where the server re-validates every field.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";
import { INTEGRITY_CHOICE_LABELS } from "@shared/domain";
import { BRAND } from "@shared/brand";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatDateTime } from "@/lib/utils";
import { Markdown } from "@/lib/markdown";
import { Button, LinkButton } from "@/components/ui/Button";
import { Checkbox, Input, Textarea } from "@/components/ui/Field";
import { Alert, Badge, Card, CardHeader, Skeleton } from "@/components/ui/Surface";
import { ProgressBar } from "@/components/ui/DataDisplay";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

export function IntakePage() {
  const params = useParams<{ id: string }>();
  const orderId = Number(params.id);
  const toast = useToast();
  const [, navigate] = useLocation();

  const utils = trpc.useUtils();
  const questions = trpc.intake.questions.useQuery();
  const outcomes = trpc.intake.outcomes.useQuery();
  const existing = trpc.intake.get.useQuery({ orderId }, { enabled: Number.isFinite(orderId) });
    const mnda = trpc.intake.mndaStatus.useQuery({ orderId }, { enabled: Number.isFinite(orderId) });
  const orderFiles = trpc.files.listForUser.useQuery(undefined, { enabled: Number.isFinite(orderId) });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [projectName, setProjectName] = useState("");
  const [desiredOutcomes, setDesiredOutcomes] = useState<string[]>([]);
  const [integrityChoice, setIntegrityChoice] = useState<string>("");
  const [confirmAccurate, setConfirmAccurate] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const hydrated = useRef(false);

  // File upload state
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  
  // Audio recording state
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const recordingInterval = useRef<NodeJS.Timeout | null>(null);

  // Hydrate the form once from the saved draft.
  useEffect(() => {
    if (hydrated.current || !existing.data) return;
    hydrated.current = true;
    setAnswers(existing.data.answers ?? {});
    setProjectName(existing.data.projectName ?? "");
    setDesiredOutcomes(existing.data.desiredOutcomes ?? []);
    setIntegrityChoice(existing.data.integrityChoice ?? "");
  }, [existing.data]);

  const save = trpc.intake.save.useMutation({
    async onSuccess() {
      setDirty(false);
      await existing.refetch();
    },
    onError(error) {
      toast.error("Could not save your draft", errorMessage(error));
    },
  });

  const submit = trpc.intake.submit.useMutation({
    async onSuccess() {
      await existing.refetch();
      toast.success(
        "Intake submitted",
        "Your Phase II Logic Synthesis call will be scheduled shortly.",
      );
      navigate(`/portal/orders/${orderId}`);
    },
    onError(error) {
      toast.error("Could not submit your intake", errorMessage(error));
    },
  });

  const sections = useMemo(() => {
    const grouped = new Map<string, typeof questions.data>();
    for (const question of questions.data ?? []) {
      const list = grouped.get(question.section) ?? [];
      grouped.set(question.section, [...(list ?? []), question] as typeof questions.data);
    }
    return [...grouped.entries()];
  }, [questions.data]);

  const submitted = existing.data?.status === "submitted";
  const readOnly = submitted;

  const csrfToken = () => {
    const match = document.cookie.match(/(?:^|;\s*)rp_csrf=([^;]+)/);
    return match && match[1] ? decodeURIComponent(match[1]) : null;
  };

  const handleUpload = async (selected: FileList | File[] | null, isAudio = false) => {
    if (!selected || selected.length === 0) return;
    setUploading(true);
    try {
      type UploadPayload = {
        error?: string;
        files?: { originalName: string }[];
        rejected?: { name: string; reason: string }[];
      };
      const post = async (token: string) => {
        const body = new FormData();
        for (const file of Array.from(selected)) body.append("files", file);
        body.append("orderId", String(orderId));
        body.append("category", "intake_attachment");
        if (isAudio) body.append("recordedPitch", "true");
        const response = await fetch("/api/files/upload", {
          method: "POST",
          credentials: "same-origin",
          headers: { "x-csrf-token": token, ...(isAudio ? { "x-rp-recorded-pitch": "true" } : {}) },
          body,
        });
        let payload: UploadPayload = {};
        try { payload = (await response.json()) as UploadPayload; } catch { /* handled by response status below */ }
        return { response, payload };
      };
      const currentSession = await utils.auth.session.fetch();
      let token = currentSession.csrfToken ?? csrfToken() ?? "";
      let result = await post(token);
      const csrfRejected = result.response.status === 403 && /csrf|security token/i.test(result.payload.error ?? "");
      if (csrfRejected) {
        // A second tab or an earlier session rotation can leave the cookie stale.
        // Fetch the server-authoritative session secret once, then retry the same
        // in-memory files exactly once; CSRF failures occur before persistence.
        const refreshedSession = await utils.auth.session.fetch();
        const refreshedToken = refreshedSession.csrfToken ?? "";
        if (refreshedToken && refreshedToken !== token) {
          token = refreshedToken;
          result = await post(token);
        }
      }

      if (!result.response.ok) {
        toast.error("Upload rejected", result.payload.error ?? "The upload could not be processed.");
      } else {
        const accepted = result.payload.files?.length ?? 0;
        toast.success(`${accepted} file${accepted === 1 ? "" : "s"} uploaded`);
        if (result.payload.rejected && result.payload.rejected.length > 0) {
          toast.error(
            "Some files were rejected",
            result.payload.rejected.map((r) => `${r.name}: ${r.reason}`).join("\n"),
          );
        }
        await orderFiles.refetch();
      }
    } catch (err) {
      toast.error("Upload failed", "A network error occurred. Please try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const deleteFileMut = trpc.files.delete.useMutation({
    onSuccess() {
      toast.success("File deleted");
      void orderFiles.refetch();
    },
    onError(err: any) {
      toast.error("Could not delete file", errorMessage(err));
    },
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorder.current = recorder;
      audioChunks.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: "audio/webm" });
        const file = new File([audioBlob], `pitch-recording-${formatDateTime(new Date()).replace(/[^a-zA-Z0-9]/g, "-")}.webm`, { type: "audio/webm" });
        void handleUpload([file], true);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setRecording(true);
      setRecordingTime(0);
      
      recordingInterval.current = setInterval(() => {
        setRecordingTime(prev => {
          const limits = existing.data?.limits;
          const maxTime = limits?.maxPitchLengthSeconds ?? 300;
          if (prev >= maxTime - 1) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      toast.error("Microphone access denied", "Please allow microphone access to record a pitch.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
    }
    setRecording(false);
    if (recordingInterval.current) clearInterval(recordingInterval.current);
  };

  const files = orderFiles.data?.filter(f => f.orderId === orderId && f.category === "intake_attachment") ?? [];
  // listForUser doesn't return detectedMime, so we infer from extension
  const isAudio = (f: any) => f.extension && ["mp3", "wav", "webm", "ogg", "m4a", "aac", "flac"].includes(f.extension.toLowerCase());
  const documents = files.filter(f => !isAudio(f));
  const pitches = files.filter(f => isAudio(f));
  const limits = existing.data?.limits;

  const requiresMnda = useMemo(() => {
    if (existing.data?.status === "submitted") return false;
    if (mnda.isLoading) return true;
    if (mnda.data?.acceptedAt) return false;
    return true;
  }, [existing.data?.status, mnda.isLoading, mnda.data?.acceptedAt]);

  const totalRequired = (questions.data ?? []).filter((question) => question.required).length;
  const completedRequired = (questions.data ?? []).filter(
    (question) =>
      question.required && (answers[question.key] ?? "").trim().length >= question.minLength,
  ).length;

  const setAnswer = (key: string, value: string) => {
    setAnswers((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setDirty(true);
  };

  const saveDraft = () => {
    save.mutate({
      orderId,
      projectName: projectName.trim() || undefined,
    });
  };

  // Autosave a dirty draft every 45 seconds so a long session is not lost.
  useEffect(() => {
    if (readOnly || !dirty) return;
    const timer = setTimeout(saveDraft, 45_000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, projectName, readOnly]);

  const validateAndSubmit = () => {
    const next: Record<string, string> = {};
    if (!confirmAccurate) {
      next.confirmAccurate = "Please confirm your answers are accurate.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const firstKey = Object.keys(next)[0];
      document.getElementById(`intake-${firstKey}`)?.scrollIntoView({ block: "center" });
      toast.error("Some answers need attention", "Review the highlighted fields and try again.");
      return;
    }
    // Persist the final state, then submit.
    save.mutate(
      {
        orderId,
        projectName: projectName.trim() || undefined,
      },
      {
        onSuccess() {
          submit.mutate({ orderId, confirmAccurate: true });
        },
      },
    );
  };

  if (questions.isLoading || existing.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!mnda.data?.accepted && !submitted) {
    return (
      <>
        <PageHeader
          title="Phase I intake"
          breadcrumb={{ href: `/portal/orders/${orderId}`, label: "Back to order" }}
        />
        <Card className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <ShieldCheck className="size-4 text-teal" aria-hidden="true" />
            Sign the mutual NDA first
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-body">
            The intake form asks for confidential detail about your concept. We require a mutual NDA
            to be in place before you provide it — that protects you, and it is why we ask for the
            signature first.
          </p>
          <LinkButton
            href={`/portal/orders/${orderId}/nda`}
            className="mt-5"
            leadingIcon={<FileSignature className="size-4" aria-hidden="true" />}
          >
            Review and sign the NDA
          </LinkButton>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Phase I — Intake form"
        description="Upload supporting materials and record a Business Pitch Idea. Your project team will send the specific Phase 1 questions needed for this order."
        breadcrumb={{ href: `/portal/orders/${orderId}`, label: "Back to order" }}
        actions={
          readOnly ? (
            <Badge tone="success">Submitted {formatDateTime(existing.data?.submittedAt ?? null)}</Badge>
          ) : (
            <>
              <Button
                variant="outline"
                busy={save.isPending}
                onClick={saveDraft}
                leadingIcon={<Save className="size-4" aria-hidden="true" />}
              >
                Save draft
              </Button>
              <Button
                busy={submit.isPending}
                onClick={validateAndSubmit}
                leadingIcon={<Send className="size-4" aria-hidden="true" />}
              >
                Submit intake
              </Button>
            </>
          )
        }
      />

      {readOnly ? (
        <Alert tone="success" className="mb-6" title="This intake has been submitted">
          Your answers are locked. If something needs to change, add a message to the order and the
          team will amend the record.
        </Alert>
      ) : (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">
                {completedRequired} of {totalRequired} required answers complete
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Drafts save automatically. Nothing is submitted until you choose to submit.
              </p>
            </div>
            {dirty ? <Badge tone="warning">Unsaved changes</Badge> : <Badge tone="neutral">Saved</Badge>}
          </div>
          <ProgressBar className="mt-3" value={completedRequired} max={Math.max(totalRequired, 1)} />
        </Card>
      )}

      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader title="Project" />
          <Input
            label="Project name"
            className="mt-4"
            value={projectName}
            onChange={(event) => {
              setProjectName(event.target.value);
              setDirty(true);
            }}
            disabled={readOnly}
            maxLength={190}
            help="Optional. A short internal label for this engagement."
          />
        </Card>

        {sections.map(([section, sectionQuestions]) => (
          <Card key={section}>
            <CardHeader title={section} />
            <div className="mt-5 space-y-6">
              {(sectionQuestions ?? []).map((question) => {
                const value = answers[question.key] ?? "";
                const belowMinimum =
                  value.trim().length > 0 && value.trim().length < question.minLength;
                return (
                  <div key={question.key} id={`intake-${question.key}`}>
                    <Textarea
                      label={question.label}
                      help={
                        question.help
                          ? `${question.help} Minimum ${question.minLength} characters.`
                          : `Minimum ${question.minLength} characters.`
                      }
                      value={value}
                      onChange={(event) => setAnswer(question.key, event.target.value)}
                      error={errors[question.key] || undefined}
                      required={question.required}
                      disabled={readOnly}
                      rows={5}
                      maxLength={question.maxLength}
                      showCount
                    />
                    {!readOnly && belowMinimum && !errors[question.key] ? (
                      <p className="mt-1 text-xs text-warning">
                        {question.minLength - value.trim().length} more characters needed.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}

        <Card id="intake-supporting-materials">
          <CardHeader
            title="Supporting documents & Business Pitch Idea"
            description="Upload reference documents for this order and, if useful, record a short Business Pitch Idea directly in this browser. Audio files cannot be uploaded from your device."
          />
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-ink">Supporting documents</p>
              <p className="mt-1 text-xs text-muted">Up to {limits?.maxDocuments ?? 5} documents. Allowed types: {limits?.allowedDocumentTypes ?? ".pdf,.doc,.docx,.txt"}.</p>
              {!readOnly && documents.length < (limits?.maxDocuments ?? 5) ? (
                <label className="mt-3 inline-flex cursor-pointer items-center rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:border-teal">
                  <input ref={fileInput} className="sr-only" type="file" multiple accept={limits?.allowedDocumentTypes ?? ".pdf,.doc,.docx,.txt"} onChange={(event) => void handleUpload(event.target.files, false)} disabled={uploading} />
                  {uploading ? "Uploading…" : "Upload documents"}
                </label>
              ) : null}
              <ul className="mt-3 space-y-2 text-sm">{documents.map((file) => <li key={file.id} className="flex items-center justify-between gap-2 rounded border border-line px-3 py-2"><span className="truncate">{file.originalName}</span>{!readOnly && <Button size="sm" variant="ghost" onClick={() => deleteFileMut.mutate({ fileId: file.id })}>Remove</Button>}</li>)}</ul>
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Business Pitch Idea</p>
              <p className="mt-1 text-xs text-muted">Record directly from your microphone in WebM format. Up to {limits?.maxPitchRecordings ?? 1} recording{(limits?.maxPitchRecordings ?? 1) === 1 ? "" : "s"}, maximum {Math.ceil((limits?.maxPitchLengthSeconds ?? 300) / 60)} minutes each.</p>
              {!readOnly && pitches.length < (limits?.maxPitchRecordings ?? 1) ? (
                <div className="mt-3 flex items-center gap-2"><Button variant={recording ? "danger" : "primary"} onClick={() => recording ? stopRecording() : void startRecording()} disabled={uploading}>{recording ? `Stop recording (${recordingTime}s)` : "Record Business Pitch Idea"}</Button></div>
              ) : null}
              <ul className="mt-3 space-y-2 text-sm">{pitches.map((file) => <li key={file.id} className="flex items-center justify-between gap-2 rounded border border-line px-3 py-2"><span className="truncate">{file.originalName} <Badge tone="teal">WebM recording</Badge></span>{!readOnly && <Button size="sm" variant="ghost" onClick={() => deleteFileMut.mutate({ fileId: file.id })}>Remove</Button>}</li>)}</ul>
            </div>
          </div>
        </Card>

        <Card id="intake-desiredOutcomes" className="hidden">
          <CardHeader
            title="Section 7 — Desired outcomes"
            description="What are you trying to achieve with this packet? Choose everything that applies."
          />
          <div className="mt-4 space-y-2.5">
            {(outcomes.data?.desiredOutcomes ?? []).map((outcome) => (
              <Checkbox
                key={outcome}
                label={outcome}
                checked={desiredOutcomes.includes(outcome)}
                disabled={readOnly}
                onChange={(event) => {
                  setDesiredOutcomes((current) =>
                    event.target.checked
                      ? [...current, outcome]
                      : current.filter((item) => item !== outcome),
                  );
                  setDirty(true);
                  setErrors((current) => ({ ...current, desiredOutcomes: "" }));
                }}
              />
            ))}
          </div>
          {errors.desiredOutcomes ? (
            <p className="mt-2 text-sm text-danger">{errors.desiredOutcomes}</p>
          ) : null}
        </Card>

        <Card id="intake-integrityChoice" className="hidden border-gold/35">
          <CardHeader
            title="Section 8 — The Integrity Clause"
            description="If our analysis concludes the concept cannot work as described, we will not write a favourable report. Choose now how you would like us to proceed."
          />
          <fieldset className="mt-4 space-y-3">
            <legend className="sr-only">Integrity clause choice</legend>
            {(outcomes.data?.integrityChoices ?? []).map((choice) => (
              <label
                key={choice}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 ${
                  integrityChoice === choice
                    ? "border-gold bg-gold/5 ring-1 ring-gold/25"
                    : "border-line hover:border-muted"
                }`}
              >
                <input
                  type="radio"
                  name="integrity-choice"
                  value={choice}
                  checked={integrityChoice === choice}
                  disabled={readOnly}
                  onChange={() => {
                    setIntegrityChoice(choice);
                    setDirty(true);
                    setErrors((current) => ({ ...current, integrityChoice: "" }));
                  }}
                  className="mt-0.5 size-4 shrink-0 accent-gold"
                />
                <span className="text-sm text-ink">
                  {INTEGRITY_CHOICE_LABELS[choice as keyof typeof INTEGRITY_CHOICE_LABELS] ?? choice}
                </span>
              </label>
            ))}
          </fieldset>
          {errors.integrityChoice ? (
            <p className="mt-2 text-sm text-danger">{errors.integrityChoice}</p>
          ) : null}
        </Card>

        {!readOnly ? (
          <Card id="intake-confirmAccurate">
            <Checkbox
              label="I confirm that the information I have provided is accurate and complete to the best of my knowledge."
              checked={confirmAccurate}
              onChange={(event) => {
                setConfirmAccurate(event.target.checked);
                setErrors((current) => ({ ...current, confirmAccurate: "" }));
              }}
              error={errors.confirmAccurate || undefined}
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                busy={submit.isPending || save.isPending}
                onClick={validateAndSubmit}
                leadingIcon={<Send className="size-4" aria-hidden="true" />}
              >
                Submit intake
              </Button>
              <Button variant="outline" busy={save.isPending} onClick={saveDraft}>
                Save and finish later
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted">
              Submitting moves your order into Phase II and locks these answers. {BRAND.companyShortName}{" "}
              will then schedule your Logic Synthesis call.
            </p>
          </Card>
        ) : null}
      </div>
    </>
  );
}

export function MndaPage() {
  const params = useParams<{ id: string }>();
  const orderId = Number.isFinite(Number(params.id)) ? Number(params.id) : undefined;
  const toast = useToast();
  const [, navigate] = useLocation();

  const document = trpc.intake.mndaDocument.useQuery();
  const status = trpc.intake.mndaStatus.useQuery({ orderId });

  const [signatureName, setSignatureName] = useState("");
  const [confirmAuthority, setConfirmAuthority] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const accept = trpc.intake.acceptMnda.useMutation({
    async onSuccess() {
      await status.refetch();
      toast.success("NDA signed", "You can now complete your Phase I intake form.");
      if (orderId) navigate(`/portal/orders/${orderId}/intake`);
    },
    onError(error) {
      setFormError(errorMessage(error));
    },
  });

  const alreadySigned = status.data?.accepted;

  return (
    <>
      <PageHeader
        title="Mutual non-disclosure agreement"
        description="Both parties are bound: you protect our methodology, and we protect your concept."
        breadcrumb={
          orderId
            ? { href: `/portal/orders/${orderId}`, label: "Back to order" }
            : { href: "/portal", label: "Back to portal" }
        }
        actions={
          alreadySigned ? (
            <Badge tone="success">Signed {formatDateTime(status.data?.acceptedAt ?? null)}</Badge>
          ) : null
        }
      />

      <div className="grid max-w-6xl gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <Card>
          {document.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : document.isError || !document.data ? (
            <Alert tone="danger" title="The agreement could not be loaded">
              Please contact us at {BRAND.emails.compliance} and we will provide a copy directly.
            </Alert>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
                <h2 className="text-lg font-semibold text-ink">{document.data.title}</h2>
                <span className="text-xs text-muted">
                  Version {document.data.version} · effective {document.data.effectiveDate}
                </span>
              </div>
              {/*
                The agreement is rendered in a scrollable region rather than a
                separate download, so the signature is captured against text the
                signer has actually been shown.
              */}
              <div
                className="prose-rp mt-5 max-h-[32rem] overflow-y-auto rounded-lg border border-line bg-surface-soft p-5 text-sm"
                tabIndex={0}
                role="region"
                aria-label="Agreement text"
              >
                <Markdown source={document.data.bodyMarkdown} />
              </div>
            </>
          )}
        </Card>

        <Card className="lg:sticky lg:top-24">
          <CardHeader
            title={alreadySigned ? "Signature on file" : "Sign the agreement"}
            description={
              alreadySigned
                ? "A copy of this agreement and your signature record is retained in your account."
                : "Type your full legal name to sign electronically."
            }
          />

          {alreadySigned ? (
            <div className="mt-5">
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Signed on {formatDateTime(status.data?.acceptedAt ?? null)}
              </p>
              {orderId ? (
                <LinkButton
                  href={`/portal/orders/${orderId}/intake`}
                  fullWidth
                  className="mt-5"
                  leadingIcon={<ClipboardCheck className="size-4" aria-hidden="true" />}
                >
                  Continue to Phase I intake
                </LinkButton>
              ) : null}
            </div>
          ) : (
            <form
              className="mt-5 space-y-5"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                setFormError(null);
                if (signatureName.trim().length < 3) {
                  setFormError("Enter your full legal name as your signature.");
                  return;
                }
                if (!confirmAuthority) {
                  setFormError("Confirm that you are authorised to sign this agreement.");
                  return;
                }
                accept.mutate({
                  orderId,
                  signatureName: signatureName.trim(),
                  confirmAuthority,
                });
              }}
            >
              {formError ? <Alert tone="danger">{formError}</Alert> : null}

              <Input
                label="Full legal name"
                value={signatureName}
                onChange={(event) => setSignatureName(event.target.value)}
                autoComplete="name"
                required
                maxLength={120}
                help="This is recorded as your electronic signature."
              />

              <Checkbox
                label="I have read the agreement above, I agree to be bound by it, and I am authorised to sign on behalf of the disclosing party."
                checked={confirmAuthority}
                onChange={(event) => setConfirmAuthority(event.target.checked)}
              />

              <Button
                type="submit"
                fullWidth
                busy={accept.isPending}
                leadingIcon={<FileSignature className="size-4" aria-hidden="true" />}
              >
                Sign agreement
              </Button>

              <p className="text-xs leading-relaxed text-muted">
                Your signature is recorded with a timestamp, the agreement version, your IP address,
                and your browser's user agent, which is what makes the record evidentiary. Governing
                law is Maryland, with venue in Baltimore County.
              </p>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
