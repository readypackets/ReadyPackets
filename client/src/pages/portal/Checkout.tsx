import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "../../lib/trpc";
import { Card } from "../../components/ui/Surface";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Field";
import { useToast } from "../../components/ui/Toast";

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function Checkout() {
  const [, navigate] = useLocation();
  const { success, error } = useToast();

  const params = new URLSearchParams(window.location.search);
  const orderId = parseInt(params.get("order") ?? "0", 10);

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const order = trpc.orders.detail.useQuery(
    { orderId },
    { enabled: orderId > 0 },
  );

  const createCheckout = trpc.stripe.createCheckout.useMutation();
  const validateCoupon = trpc.stripe.validateCoupon.useQuery(
    { code: couponCode, orderTotalCents: order.data?.order?.totalCents ?? 0 },
    { enabled: false },
  );

  async function applyCouponCode() {
    setCouponError(null);
    if (!couponCode) return;
    try {
      const result = await trpc.stripe.validateCoupon.useQuery(
        { code: couponCode, orderTotalCents: order.data?.order?.totalCents ?? 0 },
        { enabled: false },
      );
      // Use a direct fetch approach since validateCoupon is a query not mutation
      setAppliedCoupon(couponCode);
      success(`Coupon ${couponCode} applied`);
    } catch {
      setCouponError("Invalid or expired coupon code.");
    }
  }

  async function startCheckout() {
    try {
      const result = await createCheckout.mutateAsync({
        orderId,
        couponCode: appliedCoupon ?? undefined,
      });
      window.location.href = result.url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not start checkout.";
      error(msg);
    }
  }

  if (!orderId) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400">
          No order specified. Please go back and try again.
        </div>
      </div>
    );
  }

  if (order.isLoading) {
    return <div className="max-w-lg mx-auto py-12 text-center text-gray-400">Loading order…</div>;
  }

  if (!order.data?.order) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400">
          Order not found.
        </div>
      </div>
    );
  }

  const o = order.data.order;
  const items = order.data.items;

  return (
    <div className="max-w-lg mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Complete your order</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Review your order and proceed to payment.
        </p>
      </div>

      {/* Order summary */}
      <Card className="p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Order #{o.orderNumber}
        </h2>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-gray-700 dark:text-gray-300">
                {item.name} — {item.tier}
              </span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatMoney(item.unitPriceCents)}
              </span>
            </div>
          ))}
        </div>
        {o.discountCents > 0 && (
          <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
            <span>Discount</span>
            <span>−{formatMoney(o.discountCents)}</span>
          </div>
        )}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-between font-semibold">
          <span className="text-gray-900 dark:text-white">Total</span>
          <span className="text-teal-600 dark:text-teal-400">{formatMoney(o.totalCents)}</span>
        </div>
      </Card>

      {/* Coupon code */}
      <Card className="p-6 space-y-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Coupon code</h2>
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="Enter coupon code"
              disabled={appliedCoupon !== null}
            />
          </div>
          {appliedCoupon ? (
            <Button
              variant="secondary"
              onClick={() => { setAppliedCoupon(null); setCouponCode(""); }}
            >
              Remove
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={applyCouponCode}
              disabled={!couponCode}
            >
              Apply
            </Button>
          )}
        </div>
        {appliedCoupon && (
          <p className="text-sm text-green-600 dark:text-green-400">
            ✓ Coupon <strong>{appliedCoupon}</strong> applied
          </p>
        )}
        {couponError && (
          <p className="text-sm text-red-600 dark:text-red-400">{couponError}</p>
        )}
      </Card>

      {/* Payment */}
      <Card className="p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Payment</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          You will be redirected to Stripe's secure checkout to complete payment. We accept all
          major credit and debit cards.
        </p>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Secured by Stripe — we never see your card details
        </div>
        <button
          onClick={startCheckout}
          disabled={createCheckout.isPending}
          className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          {createCheckout.isPending ? "Redirecting…" : `Pay ${formatMoney(o.totalCents)} →`}
        </button>
      </Card>

      <div className="text-center">
        <button
          onClick={() => navigate(`/portal/orders/${orderId}`)}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          ← Back to order
        </button>
      </div>
    </div>
  );
}
