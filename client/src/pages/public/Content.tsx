/**
 * Static and near-static public pages: About, How it works, Reviews, Community
 * teaser, Changelog, policy documents, 404 and the maintenance screen.
 *
 * Policy text is stored in the database and versioned, so the page renders
 * whatever version is currently published rather than a hard-coded copy that
 * could drift from what customers actually accepted.
 */
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  CalendarClock,
  Compass,
  FileText,
  Lock,
  MessageSquare,
  Search,
  ShieldCheck,
  Star,
  Wrench,
} from "lucide-react";
import { BRAND, BRAND_PILLARS } from "@shared/brand";
import { trpc } from "@/lib/trpc";
import { formatDate, formatRelative } from "@/lib/utils";
import { Markdown } from "@/lib/markdown";
import { LinkButton } from "@/components/ui/Button";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  SectionHeading,
  Skeleton,
} from "@/components/ui/Surface";
import { PageSection } from "@/components/layout/PublicLayout";

export function AboutPage() {
  return (
    <>
      <div className="border-b border-line bg-navy py-16 text-white">
        <PageSection>
          <Badge tone="teal" className="bg-white/10 text-teal-light">
            About {BRAND.companyShortName}
          </Badge>
          <h1 className="mt-4 max-w-3xl text-balance text-3xl font-bold sm:text-4xl">
            We turn an idea into something that holds up under scrutiny.
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-white/75">
            {BRAND.companyLegalName} exists because most founders lose momentum in the same place:
            the gap between a concept they can explain and a package a lawyer, investor, or
            manufacturer can act on. We close that gap with structure rather than volume.
          </p>
        </PageSection>
      </div>

      <PageSection className="py-16">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="prose-rp">
            <h2>Logic Synthesis, not document assembly</h2>
            <p>
              Our process begins with a structured intake that deliberately asks the uncomfortable
              questions early: what is the day-one user, what is the biggest technical or legal
              hurdle, and what specifically would have to be true for this to work. The answers are
              the raw material for a focused synthesis call with the lead architect, and then for
              the documents themselves.
            </p>
            <p>
              The result is a packet that argues a position and shows its reasoning. That matters
              because the reader is usually a professional — counsel preparing a filing, an investor
              running diligence, a manufacturer quoting tooling — and a template cannot survive
              that kind of reading.
            </p>

            <h2>What we will not do</h2>
            <p>
              We do not provide legal, tax, securities, or medical advice, and we are not licensed
              engineers. Everything we produce is prepared for review by the appropriate licensed
              professional, and we say so plainly in every deliverable.
            </p>
            <p>
              We also will not write a favourable report we do not believe. Under the Integrity
              Clause you choose, before work starts, how we proceed if the analysis turns against
              the concept: a documented pivot strategy, or a Kill Memo setting out exactly why the
              concept fails as described, with half your fee returned.
            </p>

            <h2>Confidentiality is structural, not a promise</h2>
            <p>
              A mutual NDA is executed before we see your concept. Inside the portal, every file
              access is logged, personal data is encrypted at rest, and your material is never used
              to train external systems. Our{" "}
              <Link href="/privacy">privacy policy</Link> sets out the retention schedule in full.
            </p>
          </div>

          <div className="space-y-5">
            <Card>
              <h2 className="text-base font-semibold text-ink">Our pillars</h2>
              <dl className="mt-4 space-y-4">
                {BRAND_PILLARS.map((pillar) => (
                  <div key={pillar.name}>
                    <dt className="text-sm font-semibold text-teal-dark">{pillar.name}</dt>
                    <dd className="mt-0.5 text-sm text-body">{pillar.detail}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card>
              <h2 className="text-base font-semibold text-ink">Legal and contact</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Legal entity</dt>
                  <dd className="mt-0.5 text-ink">{BRAND.companyLegalName}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Registered address</dt>
                  <dd className="mt-0.5 text-ink">{BRAND.address}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">General enquiries</dt>
                  <dd className="mt-0.5">
                    <a href={`mailto:${BRAND.emails.general}`}>{BRAND.emails.general}</a>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Compliance</dt>
                  <dd className="mt-0.5">
                    <a href={`mailto:${BRAND.emails.compliance}`}>{BRAND.emails.compliance}</a>
                  </dd>
                </div>
              </dl>
            </Card>

            <Card className="border-teal/25 bg-surface-soft">
              <h2 className="text-base font-semibold text-ink">Governing law</h2>
              <p className="mt-2 text-sm leading-relaxed text-body">
                Our mutual NDA is governed by the laws of Maryland, with venue in Baltimore County,
                Maryland. Trade secrets are protected under the Maryland Uniform Trade Secrets Act.
              </p>
            </Card>
          </div>
        </div>
      </PageSection>
    </>
  );
}

const STEPS = [
  {
    icon: Compass,
    title: "1. Choose your packets",
    body: "Select the packet groups and tiers that match where your business actually is. Higher tiers include everything below them, so nothing is paid for twice.",
  },
  {
    icon: Lock,
    title: "2. Sign the mutual NDA",
    body: "Before we see anything substantive, both parties execute a mutual NDA in the portal. It is versioned, timestamped, and available for download at any time.",
  },
  {
    icon: FileText,
    title: "3. Complete Phase I intake",
    body: "A structured questionnaire covering core vision, constraints, market, risk, and intent. You can type your answers, upload handwritten notes, or record them as audio.",
  },
  {
    icon: MessageSquare,
    title: "4. Phase II Logic Synthesis call",
    body: "A focused 15 to 25 minute call with the lead architect to resolve ambiguity and confirm direction before production begins.",
  },
  {
    icon: Search,
    title: "5. Production and clarification",
    body: "We build the packet. If a question arises, it appears in your portal as a clarification request rather than stalling the work silently.",
  },
  {
    icon: ShieldCheck,
    title: "6. Delivery and review",
    body: "Deliverables are published to your portal, versioned, and downloadable individually or as one archive. You have a 14-day window to raise quality concerns.",
  },
] as const;

export function HowItWorksPage() {
  return (
    <>
      <div className="border-b border-line bg-surface-soft py-14">
        <PageSection>
          <SectionHeading
            eyebrow="Process"
            title="How an engagement runs, end to end"
            description="Six stages with clear gates. You always know what is happening, what is waiting on you, and what happens next."
          />
        </PageSection>
      </div>

      <PageSection className="py-14">
        <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.title}>
                <Card className="h-full">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-teal/10 text-teal-dark">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h2 className="mt-4 text-base font-semibold text-ink">{step.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-body">{step.body}</p>
                </Card>
              </li>
            );
          })}
        </ol>

        <Card className="mt-10 border-gold/35 bg-gold/5">
          <h2 className="text-lg font-semibold text-ink">The Integrity Clause</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-body">
            During intake you choose, in advance, how we proceed if the analysis turns against the
            concept. Either we produce a documented pivot strategy, or we produce a Kill Memo: a
            hard-truth report explaining precisely why the concept cannot work as described, with
            50% of your fee refunded. You will never receive a report that tells you what you want
            to hear.
          </p>
          <LinkButton href="/refunds" variant="outline" className="mt-4">
            Read the refund policy
          </LinkButton>
        </Card>

        <div className="mt-10 text-center">
          <LinkButton
            href="/packets"
            size="lg"
            trailingIcon={<ArrowRight className="size-4" aria-hidden="true" />}
          >
            Browse the packets
          </LinkButton>
        </div>
      </PageSection>
    </>
  );
}

export function ReviewsPage() {
  const reviews = trpc.public.reviews.useQuery({ limit: 50 });

  return (
    <>
      <div className="border-b border-line bg-surface-soft py-14">
        <PageSection>
          <SectionHeading
            eyebrow="Client reviews"
            title="Reviews from founders we have worked with"
            description={
              reviews.data?.average
                ? `Averaging ${reviews.data.average.toFixed(1)} out of 5 across all published reviews. Only verified clients can leave a review.`
                : "Only verified clients who have received a deliverable can leave a review."
            }
          />
        </PageSection>
      </div>

      <PageSection className="py-14">
        {reviews.isLoading ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-48 w-full rounded-[var(--radius-card)]" />
            ))}
          </div>
        ) : !reviews.data?.enabled ? (
          <EmptyState
            icon={Star}
            title="Reviews are currently unavailable"
            description="This section has been temporarily disabled. Please check back shortly."
          />
        ) : reviews.data.items.length === 0 ? (
          <EmptyState
            icon={Star}
            title="No published reviews yet"
            description="As engagements complete and clients choose to publish their feedback, it will appear here."
            action={
              <LinkButton href="/packets" variant="outline">
                Browse the packets
              </LinkButton>
            }
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {reviews.data.items.map((review) => (
              <Card key={review.id} className="flex flex-col">
                <div
                  className="flex items-center gap-0.5"
                  aria-label={`Rated ${review.rating} out of 5`}
                >
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star
                      key={index}
                      className={index < review.rating ? "size-4 fill-gold text-gold" : "size-4 text-line"}
                      aria-hidden="true"
                    />
                  ))}
                </div>
                {review.title ? (
                  <h2 className="mt-3 text-base font-semibold text-ink">{review.title}</h2>
                ) : null}
                <p className="mt-2 flex-1 text-sm leading-relaxed text-body">{review.body}</p>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs">
                  <span className="font-medium text-ink">
                    {review.author}
                  </span>
                  <Badge tone="success">Verified</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </PageSection>
    </>
  );
}

export function CommunityTeaserPage() {
  const teaser = trpc.public.forumTeaser.useQuery({ limit: 8 });
  const recordClick = trpc.tier4.forumClick.recordClick.useMutation();
  const handleTopicClick = (topicId: number) => {
    recordClick.mutate({
      topicId,
      referrer: typeof document !== "undefined" ? document.referrer?.slice(0, 512) || undefined : undefined,
    });
  };

  return (
    <>
      <div className="border-b border-line bg-surface-soft py-14">
        <PageSection>
          <SectionHeading
            eyebrow="Community"
            title="A private forum for ReadyPackets clients"
            description="Discussion between founders working through the same problems: provisional filings, prior art, first customers, and launch sequencing. Full access is included with any packet."
          />
        </PageSection>
      </div>

      <PageSection className="py-14">
        {!teaser.data?.enabled ? (
          <EmptyState
            icon={MessageSquare}
            title="The community is currently unavailable"
            description="This section has been temporarily disabled."
          />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <h2 className="text-lg font-semibold text-ink">Recent discussions</h2>
              <div className="mt-4 space-y-3">
                {teaser.isLoading
                  ? Array.from({ length: 5 }, (_, index) => (
                      <Skeleton key={index} className="h-20 w-full rounded-lg" />
                    ))
                  : teaser.data.topics.map((topic) => (
                      <div key={topic.id} onClick={() => handleTopicClick(topic.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && handleTopicClick(topic.id)}>
                      <Card padded={false} className="p-4 cursor-pointer hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-ink">
                              {topic.title}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-sm text-body">{topic.excerpt}</p>
                          </div>
                          <Badge tone="neutral" className="shrink-0">
                            {teaser.data.categories.find(
                              (category) => category.id === topic.categoryId,
                            )?.name ?? "Discussion"}
                          </Badge>
                        </div>
                        <p className="mt-2.5 flex items-center gap-3 text-xs text-muted">
                          <span>{formatRelative(topic.createdAt)}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {topic.replyCount} {topic.replyCount === 1 ? "reply" : "replies"}
                          </span>
                        </p>
                      </Card>
                      </div>
                    ))}
              </div>

              <Alert tone="info" className="mt-5" title="Preview only">
                Topic excerpts are shown publicly. Sign in with a ReadyPackets account to read full
                threads and take part.
              </Alert>
            </div>

            <div className="space-y-5">
              <Card>
                <h2 className="text-base font-semibold text-ink">Categories</h2>
                <ul className="mt-4 space-y-3">
                  {(teaser.data.categories ?? []).map((category) => (
                    <li key={category.id}>
                      <p className="text-sm font-medium text-ink">{category.name}</p>
                      {category.description ? (
                        <p className="mt-0.5 text-xs text-body">{category.description}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="border-teal/25 bg-surface-soft">
                <h2 className="text-base font-semibold text-ink">Join the conversation</h2>
                <p className="mt-2 text-sm text-body">
                  Community access is included with every packet. Create an account to read and post.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <LinkButton href="/register" fullWidth>
                    Create an account
                  </LinkButton>
                  <LinkButton href="/login" variant="outline" fullWidth>
                    Sign in
                  </LinkButton>
                </div>
              </Card>
            </div>
          </div>
        )}
      </PageSection>
    </>
  );
}

const ENTRY_TONES: Record<string, "teal" | "gold" | "success" | "danger" | "info" | "neutral"> = {
  feature: "teal",
  improvement: "info",
  fix: "neutral",
  security: "danger",
  breaking: "gold",
};

export function ChangelogPage() {
  const changelog = trpc.public.changelog.useQuery({ limit: 50 });

  return (
    <>
      <div className="border-b border-line bg-surface-soft py-14">
        <PageSection>
          <SectionHeading
            eyebrow="Release notes"
            title="Changelog"
            description="Every change to the portal that affects customers, in reverse chronological order."
          />
        </PageSection>
      </div>

      <PageSection width="narrow" className="py-14">
        {changelog.isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-32 w-full rounded-[var(--radius-card)]" />
            ))}
          </div>
        ) : !changelog.data?.enabled || changelog.data.items.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No release notes published yet"
            description="Changes affecting customers will be documented here as they ship."
          />
        ) : (
          <ol className="space-y-6">
            {changelog.data.items.map((entry) => (
              <li key={entry.id}>
                <Card>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Badge tone="navy">v{entry.version}</Badge>
                    <Badge tone={ENTRY_TONES[entry.entryType] ?? "neutral"}>
                      {entry.entryType}
                    </Badge>
                    <span className="text-xs text-muted">{formatDate(entry.releasedAt)}</span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-ink">{entry.title}</h2>
                  <Markdown source={entry.bodyMarkdown} className="prose-rp mt-3 text-sm" />
                </Card>
              </li>
            ))}
          </ol>
        )}
      </PageSection>
    </>
  );
}

const POLICY_ROUTES: Record<string, "privacy-policy" | "refund-policy" | "liability-disclaimer" | "terms-of-service"> = {
  "/privacy": "privacy-policy",
  "/refunds": "refund-policy",
  "/disclaimer": "liability-disclaimer",
  "/terms": "terms-of-service",
  "/legal/privacy-policy": "privacy-policy",
  "/legal/refund-policy": "refund-policy",
  "/legal/liability-disclaimer": "liability-disclaimer",
  "/legal/terms-of-service": "terms-of-service",
};

export function PolicyPage() {
  const [location] = useLocation();
  const slug = POLICY_ROUTES[location] ?? "privacy-policy";
  const policy = trpc.public.policy.useQuery({ slug });

  return (
    <PageSection width="narrow" className="py-14">
      {policy.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-6 h-96 w-full" />
        </div>
      ) : policy.isError || !policy.data ? (
        <EmptyState
          icon={FileText}
          title="That document is not available"
          description="It may not have been published yet. Contact us if you need a copy."
          action={
            <LinkButton href={`mailto:${BRAND.emails.compliance}`} variant="outline">
              Email compliance
            </LinkButton>
          }
        />
      ) : (
        <article>
          <header className="border-b border-line pb-5">
            <h1 className="text-3xl font-semibold text-ink">{policy.data.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
              <span>Version {policy.data.version}</span>
              <span aria-hidden="true">·</span>
              <span>Effective {policy.data.effectiveDate}</span>
            </p>
          </header>
          <Markdown source={policy.data.bodyMarkdown} className="prose-rp mt-8" />
          <footer className="mt-12 border-t border-line pt-6">
            <p className="text-sm text-body">
              Questions about this document? Contact{" "}
              <a href={`mailto:${BRAND.emails.compliance}`}>{BRAND.emails.compliance}</a>.
            </p>
          </footer>
        </article>
      )}
    </PageSection>
  );
}

export function NotFoundPage() {
  return (
    <PageSection width="narrow" className="py-24">
      <div className="text-center">
        <p className="text-6xl font-bold tabular-nums text-teal/25">404</p>
        <h1 className="mt-4 text-2xl font-semibold text-ink">This page could not be found</h1>
        <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-body">
          The address may be mistyped, or the page may have moved. The links below cover most of
          what people are looking for.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <LinkButton href="/">Return home</LinkButton>
          <LinkButton href="/packets" variant="outline">
            Browse packets
          </LinkButton>
          <LinkButton href="/contact" variant="outline">
            Contact us
          </LinkButton>
        </div>

        <nav aria-label="Helpful links" className="mt-12 border-t border-line pt-8 text-left">
          <h2 className="text-center text-xs font-semibold uppercase tracking-wide text-muted">
            Popular destinations
          </h2>
          <ul className="mx-auto mt-4 grid max-w-md gap-2 sm:grid-cols-2">
            {[
              { href: "/how-it-works", label: "How it works" },
              { href: "/portal", label: "Customer portal" },
              { href: "/login", label: "Sign in" },
              { href: "/register", label: "Create an account" },
              { href: "/privacy", label: "Privacy policy" },
              { href: "/changelog", label: "Changelog" },
            ].map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex min-h-11 items-center rounded-lg px-3 text-sm text-body no-underline hover:bg-surface-sunken hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </PageSection>
  );
}

export function MaintenancePage() {
  const status = trpc.public.siteStatus.useQuery();
  const maintenance = status.data?.maintenance;

  return (
    <PageSection width="narrow" className="py-24">
      <div className="text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-warning/12 text-warning">
          <Wrench className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold text-ink">We are performing maintenance</h1>
        <p className="mx-auto mt-3 max-w-lg text-pretty text-sm leading-relaxed text-body">
          {maintenance?.message ??
            "The portal is temporarily unavailable while we complete scheduled work. Your data is safe and nothing has been lost."}
        </p>
        {maintenance?.estimatedCompletion ? (
          <p className="mt-3 text-sm font-medium text-ink">
            Estimated completion: {maintenance.estimatedCompletion}
          </p>
        ) : null}
        <p className="mt-8 text-sm text-body">
          If you need assistance in the meantime, email{" "}
          <a href={`mailto:${BRAND.emails.general}`}>{BRAND.emails.general}</a>.
        </p>
      </div>
    </PageSection>
  );
}
