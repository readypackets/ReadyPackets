/**
 * Customer portal onboarding wizard.
 *
 * Guides new customers through the first steps: profile completion,
 * browsing the catalog, placing their first order, and completing the
 * Phase I intake form. Progress is persisted via the account.completeOnboarding
 * mutation once all steps are done.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "../../lib/trpc";
import { Card } from "../../components/ui/Surface";
import { Button } from "../../components/ui/Button";
import { useSession } from "../../lib/session";

interface Step {
  id: string;
  title: string;
  description: string;
  action?: { label: string; href: string };
  completedWhen: (ctx: WizardContext) => boolean;
}

interface WizardContext {
  hasOrders: boolean;
  profileComplete: boolean;
  emailVerified: boolean;
}

const STEPS: Step[] = [
  {
    id: "verify_email",
    title: "Verify your email address",
    description:
      "Check your inbox for a verification link. This ensures you receive important notifications about your orders.",
    completedWhen: (ctx) => ctx.emailVerified,
  },
  {
    id: "complete_profile",
    title: "Complete your profile",
    description:
      "Add your company name and contact details so we can personalise your experience and reach you about your orders.",
    action: { label: "Go to profile", href: "/portal/profile" },
    completedWhen: (ctx) => ctx.profileComplete,
  },
  {
    id: "browse_catalog",
    title: "Browse our service catalog",
    description:
      "Explore our ReadyPackets — professionally packaged consulting services designed to move your business forward.",
    action: { label: "View catalog", href: "/packets" },
    completedWhen: () => false, // Always shows until skipped
  },
  {
    id: "place_order",
    title: "Place your first order",
    description:
      "Select a packet and tier that fits your needs. You can configure multiple packets in a single order.",
    action: { label: "New order", href: "/portal/orders/new" },
    completedWhen: (ctx) => ctx.hasOrders,
  },
];

export default function Wizard() {
  const [, navigate] = useLocation();
  const { user } = useSession();
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [completing, setCompleting] = useState(false);

  const orders = trpc.orders.list.useQuery();
  const completeOnboarding = trpc.account.completeOnboarding.useMutation();

  const ctx: WizardContext = {
    hasOrders: (orders.data?.length ?? 0) > 0,
    profileComplete: Boolean(user?.company),
    emailVerified: user?.emailVerified ?? false,
  };

  const steps = STEPS.map((step) => ({
    ...step,
    completed: step.completedWhen(ctx) || skipped.has(step.id),
  }));

  const completedCount = steps.filter((s) => s.completed).length;
  const allDone = completedCount === steps.length;
  const progress = Math.round((completedCount / steps.length) * 100);

  async function finish() {
    setCompleting(true);
    try {
      await completeOnboarding.mutateAsync();
      navigate("/portal");
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Welcome to ReadyPackets{user?.firstName ? `, ${user.firstName}` : ""}!
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Let's get you set up. Complete these steps to get the most out of your portal.
        </p>
      </div>

      {/* Progress bar */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {completedCount} of {steps.length} steps complete
          </span>
          <span className="text-sm font-semibold text-teal-600 dark:text-teal-400">{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-teal-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </Card>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, i) => (
          <Card
            key={step.id}
            className={`p-5 transition-all ${
              step.completed ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-start gap-4">
              {/* Step indicator */}
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  step.completed
                    ? "bg-teal-500 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                {step.completed ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3
                  className={`text-sm font-semibold ${
                    step.completed
                      ? "line-through text-gray-400 dark:text-gray-500"
                      : "text-gray-900 dark:text-white"
                  }`}
                >
                  {step.title}
                </h3>
                {!step.completed && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {step.description}
                  </p>
                )}
                {!step.completed && (
                  <div className="flex items-center gap-3 mt-3">
                    {step.action && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => navigate(step.action!.href)}
                      >
                        {step.action.label}
                      </Button>
                    )}
                    <button
                      onClick={() => setSkipped((s) => new Set([...s, step.id]))}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      Skip for now
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Finish */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => navigate("/portal")}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Skip wizard
        </button>
        <Button
          variant="primary"
          onClick={finish}
          busy={completing}
          disabled={!allDone && completedCount < 2}
        >
          {allDone ? "Finish setup →" : "Continue to portal →"}
        </Button>
      </div>
    </div>
  );
}
