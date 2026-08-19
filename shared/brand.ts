/**
 * ReadyPackets brand constants — Brand Kit v2.0 (August 2026).
 * Values transcribed from ReadyPackets_Brand_Guidelines.pdf and brand_kit/README.md.
 * These are the single source of truth for colour, naming and legal marks.
 */

export const BRAND = {
  companyLegalName: "Ready Packets Consulting LLC",
  companyShortName: "ReadyPackets",
  wordmark: "ReadyPackets\u2122",
  tagline: "Your Business, Professionally Packeted\u2122",
  taglinePlain: "Your Business, Professionally Packeted",
  address: "7404 Executive Pl, Lanham, MD 20706",
  emails: {
    general: "info@readypackets.com",
    compliance: "compliance@readypackets.com",
    cancellations: "cancellations@readypackets.com",
    disputes: "disputes@readypackets.com",
    brand: "brand@readypackets.com",
  },
  copyright: (year = new Date().getFullYear()) =>
    `\u00A9 ${year} Ready Packets Consulting LLC. All rights reserved.`,
} as const;

/** Primary and secondary palette. Hex values from the Brand Guidelines colour page. */
export const BRAND_COLORS = {
  navy: "#0D1B2A",
  navyRaised: "#12263A",
  navyElevated: "#17304A",
  teal: "#20A090",
  tealDark: "#1A7A6E",
  tealLight: "#2EC4B6",
  gold: "#C9A84C",
  goldDark: "#A98C36",
  grayDark: "#4A5568",
  white: "#FFFFFF",
} as const;

/**
 * Approved logo asset paths. Assets are served from the application's own
 * public directory — never from a CDN or third-party origin.
 */
export const BRAND_ASSETS = {
  light: {
    fullres: "/brand/light/readypackets_light_original_fullres.png",
    printLarge: "/brand/light/readypackets_light_print_large.png",
    document: "/brand/light/readypackets_light_document.png",
    emailHeader: "/brand/light/readypackets_light_email_header.png",
    webStandard: "/brand/light/readypackets_light_web_standard.png",
    webCompact: "/brand/light/readypackets_light_web_compact.png",
    thumbnail: "/brand/light/readypackets_light_thumbnail.png",
  },
  dark: {
    fullres: "/brand/dark/readypackets_dark_original_fullres.png",
    printLarge: "/brand/dark/readypackets_dark_print_large.png",
    document: "/brand/dark/readypackets_dark_document.png",
    emailHeader: "/brand/dark/readypackets_dark_email_header.png",
    webStandard: "/brand/dark/readypackets_dark_web_standard.png",
    webCompact: "/brand/dark/readypackets_dark_web_compact.png",
    thumbnail: "/brand/dark/readypackets_dark_thumbnail.png",
  },
  icon: {
    px1024: "/brand/icon/readypackets_icon_1024.png",
    px512: "/brand/icon/readypackets_icon_512.png",
    px256: "/brand/icon/readypackets_icon_256.png",
    px128: "/brand/icon/readypackets_icon_128.png",
    px64: "/brand/icon/readypackets_icon_64.png",
    px32: "/brand/icon/readypackets_icon_32.png",
    px16: "/brand/icon/readypackets_icon_16.png",
    master: "/brand/readypackets_icon_master.png",
  },
} as const;

/** Brand pillars, used on the public About page. */
export const BRAND_PILLARS = [
  {
    name: "Professionalism",
    detail: "Every touchpoint reflects expertise, clarity, and polish.",
  },
  { name: "Reliability", detail: "Clients trust us to deliver on time, every time." },
  { name: "Clarity", detail: "Complex business needs translated into actionable documents." },
  { name: "Momentum", detail: "We exist to help businesses move — fast and with confidence." },
] as const;
