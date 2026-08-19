/**
 * Public contact form.
 *
 * The honeypot field is present in the DOM but hidden from sighted users and
 * removed from the accessibility tree, so a bot that fills every input is
 * discarded server-side while a real submission is unaffected. Validation runs
 * client-side for feedback and again on the server, which is the only check that
 * counts.
 */
import { useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Mail, MapPin, Send } from "lucide-react";
import { BRAND } from "@shared/brand";
import { trpc, errorMessage } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/Field";
import { Alert, Card, SectionHeading } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { PageSection } from "@/components/layout/PublicLayout";
import { useSession } from "@/lib/session";

const TOPICS = [
  { value: "general", label: "General enquiry" },
  { value: "packets", label: "Question about a specific packet" },
  { value: "bundle", label: "The All-In bundle" },
  { value: "support", label: "Support for an existing order" },
  { value: "partnership", label: "Partnership or referral" },
  { value: "press", label: "Press or media" },
] as const;

interface FormState {
  name: string;
  email: string;
  company: string;
  topic: string;
  message: string;
  website: string;
  acceptedPrivacy: boolean;
}

const EMPTY: FormState = {
  name: "",
  email: "",
  company: "",
  topic: "general",
  message: "",
  website: "",
  acceptedPrivacy: false,
};

export function ContactPage() {
  const toast = useToast();
  const { businessProfile } = useSession();
  const businessAddress = businessProfile
    ? [businessProfile.addressLine1, businessProfile.addressLine2, `${businessProfile.city}, ${businessProfile.state} ${businessProfile.postalCode}`].filter(Boolean).join(", ")
    : BRAND.address;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [sent, setSent] = useState(false);

  const submit = trpc.public.submitContact.useMutation({
    onSuccess() {
      setSent(true);
      setForm(EMPTY);
      setErrors({});
      toast.success("Message sent", "We reply to enquiries within one business day.");
    },
    onError(error) {
      toast.error("Could not send your message", errorMessage(error));
    },
  });

  const update = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (form.name.trim().length < 2) next.name = "Please tell us your name.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      next.email = "Enter a valid email address.";
    }
    if (form.message.trim().length < 20) {
      next.message = "Please provide a little more detail — at least 20 characters.";
    }
    if (form.message.length > 5000) next.message = "Please keep your message under 5,000 characters.";
    if (!form.acceptedPrivacy) {
      next.acceptedPrivacy = "Please confirm you have read the privacy policy.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    submit.mutate({
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      company: form.company.trim() || undefined,
      topic: form.topic as (typeof TOPICS)[number]["value"],
      message: form.message.trim(),
      website: form.website || undefined,
      acceptedPrivacy: form.acceptedPrivacy,
    });
  };

  return (
    <>
      <div className="border-b border-line bg-surface-soft py-14">
        <PageSection>
          <SectionHeading
            eyebrow="Contact"
            title="Talk to us about your project"
            description="Tell us what you are building and where you are stuck. We reply to every enquiry within one business day."
          />
        </PageSection>
      </div>

      <PageSection className="py-14">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <Card>
            {sent ? (
              <div className="py-6 text-center">
                <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/12 text-success">
                  <CheckCircle2 className="size-6" aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-lg font-semibold text-ink">Message received</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-body">
                  Thank you — a confirmation has been sent to your email address. A member of the
                  team will reply within one business day.
                </p>
                <Button variant="outline" className="mt-5" onClick={() => setSent(false)}>
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    label="Your name"
                    value={form.name}
                    onChange={(event) => update("name", event.target.value)}
                    error={errors.name}
                    autoComplete="name"
                    required
                    maxLength={120}
                  />
                  <Input
                    label="Email address"
                    type="email"
                    value={form.email}
                    onChange={(event) => update("email", event.target.value)}
                    error={errors.email}
                    autoComplete="email"
                    required
                    maxLength={254}
                  />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    label="Company"
                    value={form.company}
                    onChange={(event) => update("company", event.target.value)}
                    help="Optional"
                    autoComplete="organization"
                    maxLength={160}
                  />
                  <Select
                    label="What is this about?"
                    value={form.topic}
                    onChange={(event) => update("topic", event.target.value)}
                    options={TOPICS.map((topic) => ({ value: topic.value, label: topic.label }))}
                  />
                </div>

                <Textarea
                  label="Your message"
                  value={form.message}
                  onChange={(event) => update("message", event.target.value)}
                  error={errors.message}
                  required
                  rows={7}
                  maxLength={5000}
                  showCount
                  placeholder="What are you building, and what is currently blocking you?"
                />

                {/*
                  Honeypot. Off-screen rather than display:none, because some bots
                  skip hidden inputs; aria-hidden and tabIndex keep it away from
                  assistive technology and keyboard users.
                */}
                <div className="absolute left-[-9999px] top-0" aria-hidden="true">
                  <label htmlFor="website-field">Website</label>
                  <input
                    id="website-field"
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.website}
                    onChange={(event) => update("website", event.target.value)}
                  />
                </div>

                <Checkbox
                  label={
                    <>
                      I have read the <Link href="/privacy">privacy policy</Link> and consent to
                      ReadyPackets processing my enquiry.
                    </>
                  }
                  checked={form.acceptedPrivacy}
                  onChange={(event) => update("acceptedPrivacy", event.target.checked)}
                  error={errors.acceptedPrivacy}
                />

                <Button
                  type="submit"
                  busy={submit.isPending}
                  leadingIcon={<Send className="size-4" aria-hidden="true" />}
                >
                  Send message
                </Button>
              </form>
            )}
          </Card>

          <div className="space-y-5">
            <Card>
              <h2 className="text-base font-semibold text-ink">Direct contacts</h2>
              <dl className="mt-4 space-y-4 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">General</dt>
                  <dd className="mt-0.5 flex items-center gap-2">
                    <Mail className="size-4 text-teal" aria-hidden="true" />
                    <a href={`mailto:${BRAND.emails.general}`}>{BRAND.emails.general}</a>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">
                    Privacy and compliance
                  </dt>
                  <dd className="mt-0.5 flex items-center gap-2">
                    <Mail className="size-4 text-teal" aria-hidden="true" />
                    <a href={`mailto:${BRAND.emails.compliance}`}>{BRAND.emails.compliance}</a>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Cancellations</dt>
                  <dd className="mt-0.5 flex items-center gap-2">
                    <Mail className="size-4 text-teal" aria-hidden="true" />
                    <a href={`mailto:${BRAND.emails.cancellations}`}>
                      {BRAND.emails.cancellations}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Registered address</dt>
                  <dd className="mt-0.5 flex items-start gap-2">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden="true" />
                    <span>{businessAddress}</span>
                  </dd>
                </div>
              </dl>
            </Card>

            <Alert tone="info" title="Existing order?">
              Support requests for an active order are tracked properly if you raise them from your
              portal, where they are linked to the order and its history.
            </Alert>

            <Card className="bg-surface-soft">
              <h2 className="text-base font-semibold text-ink">Response times</h2>
              <p className="mt-2 text-sm text-body">
                Enquiries: within one business day. Support tickets from the portal: within one
                business day, prioritised by severity.
              </p>
            </Card>
          </div>
        </div>
      </PageSection>
    </>
  );
}
