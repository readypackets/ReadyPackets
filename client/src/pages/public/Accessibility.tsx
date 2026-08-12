import { Accessibility, Keyboard, Mail, MousePointer2, MonitorSmartphone } from "lucide-react";
import { Link } from "wouter";
import { BRAND } from "@shared/brand";
import { Card } from "@/components/ui/Surface";
import { PageSection } from "@/components/layout/PublicLayout";

const SUPPORTS = [
  { icon: Keyboard, title: "Keyboard access", body: "Use Tab and Shift+Tab to move through controls, Enter or Space to activate a control, and Escape to close menus and dialogs." },
  { icon: MonitorSmartphone, title: "Responsive display", body: "The public site is designed to reflow on smaller screens, support browser zoom, and respect your device’s light, dark, and reduced-motion preferences." },
  { icon: MousePointer2, title: "Clear interaction", body: "Visible focus indicators, labelled controls, descriptive links, and adequately sized touch targets are built into the shared interface components." },
];

export function AccessibilityPage() {
  return <>
    <section className="border-b border-line bg-surface-soft py-14 sm:py-20"><PageSection width="narrow"><p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal">Accessibility</p><h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">A website designed for more people</h1><p className="mt-5 max-w-2xl text-lg leading-relaxed text-body">ReadyPackets is committed to making its public website usable by people with disabilities. We use the Web Content Accessibility Guidelines (WCAG) 2.2 Level AA as our technical target and continuously improve the experience.</p></PageSection></section>
    <PageSection width="narrow" className="py-10 sm:py-14"><div className="space-y-8"><Card className="p-6"><div className="flex gap-4"><Accessibility className="mt-1 size-6 shrink-0 text-teal" aria-hidden="true" /><div><h2 className="text-xl font-semibold text-ink">Our accessibility approach</h2><p className="mt-3 leading-7 text-body">Accessibility is included in shared components, content review, and interface testing. We provide a skip link, keyboard-operable navigation and disclosure controls, visible focus indicators, labelled forms, text alternatives for meaningful images, and reduced-motion support. We avoid requiring drag-only interactions and provide consistent routes to human and self-service help.</p></div></div></Card>
      <div className="grid gap-4 sm:grid-cols-3">{SUPPORTS.map(({ icon: Icon, title, body }) => <Card key={title} className="p-5"><Icon className="size-5 text-teal" aria-hidden="true" /><h2 className="mt-4 text-base font-semibold text-ink">{title}</h2><p className="mt-2 text-sm leading-6 text-body">{body}</p></Card>)}</div>
      <Card className="border-teal/20 bg-teal/5 p-6"><h2 className="text-xl font-semibold text-ink">Tell us about an accessibility barrier</h2><p className="mt-3 leading-7 text-body">If you have difficulty using any part of this website, contact us with the page address, the task you were trying to complete, and the assistive technology or browser you were using. We will review the report and work with you to provide the information or service through an accessible alternative.</p><div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold"><a href={`mailto:${BRAND.emails.general}?subject=Website%20accessibility%20support`} className="inline-flex min-h-11 items-center text-teal underline underline-offset-4"><Mail className="mr-2 size-4" aria-hidden="true" />Email accessibility support</a><Link href="/contact" className="inline-flex min-h-11 items-center text-teal underline underline-offset-4">Contact ReadyPackets</Link><Link href="/faq" className="inline-flex min-h-11 items-center text-teal underline underline-offset-4">Browse FAQs</Link></div></Card>
      <p className="text-sm leading-6 text-muted">This statement describes our ongoing accessibility program and technical target. It does not replace an independent accessibility audit or a legal determination of conformance.</p></div></PageSection>
  </>;
}
