# Theme and SSO verification — August 11, 2026

## Dark palette visual check

After the global token remap was deployed, the public homepage was opened and the labeled **Dark** control was selected. The application applied a visibly distinct branded dark appearance across the page: the top navigation changed from white to deep ReadyPackets navy, token-based content surfaces changed from white to dark navy/blue surfaces, and text switched to light high-contrast values while teal and gold remained the brand accents.

This corrects the prior behavior where only the selected appearance button changed while the rest of the site retained its light palette.

## Single Sign-On entry point

The login implementation now receives only a minimal SSO availability flag through the existing session bootstrap and displays **Continue with Single Sign-On**. It routes to the existing signed SAML login endpoint only when an administrator has configured and enabled a SAML identity provider. Otherwise it remains visibly disabled with an explanatory configuration message; no IdP metadata, certificate, or endpoint information is exposed to unauthenticated visitors.


## Light palette inspection

The labeled **Light** control was also selected after the Dark-mode check. The document root removed the `dark` class, browser storage recorded `rp-theme=light`, the body computed background returned to white, and the header computed background returned to a near-white value. The public hero intentionally retains its ReadyPackets navy presentation in both modes as a brand surface; the global page background and token-driven cards/panels distinguish Light from Dark elsewhere in the application.
