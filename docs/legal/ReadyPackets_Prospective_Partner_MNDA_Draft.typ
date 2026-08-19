// ReadyPackets branded attorney-review draft.
#import "report-theme.typ": report-accent, report-theme

#let navy = rgb("0B1F33")
#let teal = rgb("109E9A")
#let gold = rgb("D9A441")
#let muted = rgb("5C6875")
#let rule = rgb("D9E0E7")

#show: report-theme.with(
  title: "Mutual Non-Disclosure Agreement",
  author: "ReadyPackets",
  rhythm: "report",
  running-header: true,
)

#let blank-line(width: 100%) = box(width: width, inset: (bottom: 2pt), stroke: (bottom: 0.55pt + muted))[]
#let signature-line(label) = [
  #v(1.35em)
  #line(length: 100%, stroke: 0.55pt + navy)
  #v(0.3em)
  #text(size: 8.5pt, fill: muted)[#label]
]

// ---------- Title page ----------
#page(margin: (top: 21%, bottom: 14%, x: 2.2cm), numbering: none, header: none)[
  #set par(first-line-indent: 0pt)
  #align(center)[
    #image("assets/readypackets_light_document.png", width: 5.5cm)
    #v(2.25em)
    #text(size: 8.5pt, weight: "bold", fill: teal, tracking: 0.09em)[CONFIDENTIAL BUSINESS DOCUMENT]
    #v(0.8em)
    #text(size: 25pt, weight: "bold", fill: navy)[Mutual Non-Disclosure]
    #text(size: 25pt, weight: "bold", fill: navy)[Agreement]
    #v(0.75em)
    #text(size: 13pt, fill: muted)[Prospective Platform Development Partner]
    #v(2.3em)
    #line(length: 46%, stroke: 1.2pt + gold)
    #v(2.25em)
    #box(
      width: 82%,
      inset: (x: 16pt, y: 12pt),
      fill: rgb("FFF7E3"),
      stroke: 0.65pt + gold,
      radius: 5pt,
    )[
      #text(size: 9.5pt, weight: "bold", fill: navy)[DRAFT — FOR ATTORNEY REVIEW BEFORE SIGNATURE]
      #v(0.35em)
      #text(size: 8.8pt, fill: muted)[This working draft is intended for evaluation of a prospective business and platform-development relationship. Complete the bracketed fields and obtain legal review before relying on or signing it.]
    ]
    #v(3em)
    #text(size: 9.5pt, fill: muted)[Prepared for ReadyPackets™]
    #v(0.35em)
    #text(size: 9pt, fill: muted)[Ready Packets Consulting LLC · Lanham, Maryland]
  ]
]

// ---------- Agreement body ----------
#counter(page).update(1)

#align(center)[
  #text(size: 15pt, weight: "bold", fill: navy)[MUTUAL NON-DISCLOSURE AGREEMENT]
  #v(0.35em)
  #text(size: 9pt, fill: muted)[Prospective platform-development partner relationship]
]

#v(1.25em)

#text(weight: "bold")[Effective Date:] #h(0.45em) #line(length: 35%, stroke: 0.55pt + muted) #h(1.4em) #text(weight: "bold")[Agreement Reference:] RP-MNDA-PARTNER-#line(length: 23%, stroke: 0.55pt + muted)

#v(1.2em)

This Mutual Non-Disclosure Agreement (this *Agreement*) is entered into as of the Effective Date by and between *Ready Packets Consulting LLC*, doing business as *ReadyPackets* (*ReadyPackets*), with an address at 7404 Executive Pl, Lanham, MD 20706, and *[PARTNER LEGAL NAME]*, a [STATE/COUNTRY AND ENTITY TYPE] with an address at [PARTNER BUSINESS ADDRESS] (*Partner*). ReadyPackets and Partner are each a *Party* and collectively the *Parties*.

The Parties wish to evaluate and, if mutually agreed in a later written agreement, potentially pursue a business relationship involving platform strategy, design, software engineering, infrastructure, security, integrations, operations, support, or related professional services (the *Purpose*). In connection with the Purpose, either Party may disclose Confidential Information to the other Party. The Parties agree as follows.

= Confidential Information

*Confidential Information* means non-public information disclosed by or on behalf of a Party (the *Disclosing Party*) to the other Party (the *Receiving Party*), whether disclosed orally, visually, electronically, in writing, by access to systems, or in any other form, that is marked confidential or that a reasonable person would understand to be confidential given the nature of the information and the circumstances of disclosure.

For ReadyPackets, Confidential Information includes, without limitation, product and business plans; strategy; customer, prospect, vendor, and partner information; pricing; financial information; platform architecture; source code and object code; repositories; technical specifications; workflows; designs; algorithms; deployment materials; security assessments; penetration-test results; access-control configurations; incident information; credentials, tokens, keys, certificates, or secrets; data models; documentation; customer-uploaded materials; and all analyses, notes, extracts, or derivatives of the foregoing.

For Partner, Confidential Information includes Partner’s non-public business, technical, security, financial, personnel, and service-delivery information that is disclosed for the Purpose. The terms of this Agreement, the existence and status of discussions under it, and the identity of the Parties’ contacts are also Confidential Information.

= Exclusions

Confidential Information does not include information that the Receiving Party can demonstrate by contemporaneous written records: (a) was publicly available through no breach of this Agreement; (b) was lawfully known to the Receiving Party without a confidentiality obligation before receipt from the Disclosing Party; (c) was lawfully received from a third party without breach of any confidentiality obligation; or (d) was independently developed without use of or reference to the Disclosing Party’s Confidential Information. The burden of proving an exclusion rests with the Receiving Party.

= Use and Non-Disclosure Obligations

The Receiving Party shall: (a) use Confidential Information solely for the Purpose; (b) protect it using at least reasonable care and no less than the care it uses for its own similar information; (c) disclose it only to its employees, contractors, professional advisers, and representatives who have a legitimate need to know for the Purpose and who are bound by written obligations at least as protective as this Agreement; and (d) remain responsible for any breach of this Agreement by those persons.

The Receiving Party shall not copy, reproduce, reverse engineer, decompile, disassemble, scrape, mine, train an artificial-intelligence or machine-learning system on, publicly discuss, publish, sell, license, transfer, or otherwise exploit the Disclosing Party’s Confidential Information except as expressly permitted in writing by the Disclosing Party.

= Platform, Security, and Data Protections

Because the Purpose may involve a customer-facing platform and sensitive commercial information, Partner shall not access any ReadyPackets production environment, source repository, customer data, live account, security log, credential, encryption key, secret, backup, or third-party integration without ReadyPackets’ prior written authorization and only through approved access methods.

The Receiving Party shall use appropriate administrative, technical, and physical safeguards to prevent unauthorized access, use, alteration, loss, disclosure, or destruction of Confidential Information. It shall not share credentials or secrets through unapproved channels, store them in public repositories, or use them outside the approved scope of work. If the Receiving Party becomes aware of a suspected or actual unauthorized access, disclosure, loss, or security incident involving the Disclosing Party’s Confidential Information, it shall notify the Disclosing Party without undue delay and, in any event, within twenty-four (24) hours after discovery; cooperate in reasonable containment and investigation efforts; and preserve relevant evidence.

No customer data or personal information may be used for demonstrations, testing, development, analytics, or training unless the Disclosing Party has expressly authorized the specific use in writing and the Parties have implemented any required data-protection documentation.

= Ownership; No License; No Commitment

All Confidential Information remains the property of the Disclosing Party. No patent, copyright, trademark, trade secret, data, software, or other intellectual-property right or license is granted by this Agreement, whether by implication, estoppel, or otherwise. Each Party retains all rights in its pre-existing materials, tools, methods, know-how, and intellectual property.

This Agreement does not obligate either Party to disclose information, enter into a transaction, award work, purchase services, provide access, or proceed with any proposed relationship. Any services, deliverables, intellectual-property assignment, payment, service level, data-processing, or production-access terms must be stated in a separate written agreement signed by authorized representatives of both Parties.

= Required Disclosure

If the Receiving Party is required by law, regulation, subpoena, or court order to disclose Confidential Information, it shall, to the extent legally permitted, provide prompt written notice to the Disclosing Party and reasonably cooperate with efforts to seek protective treatment. The Receiving Party shall disclose only the portion legally required and shall use reasonable efforts to obtain confidential treatment for the disclosed information.

= Return or Destruction

Upon the Disclosing Party’s written request or upon termination of discussions, the Receiving Party shall promptly return or securely destroy Confidential Information in its possession or control, including copies and derivatives, except for one archival copy maintained solely for legal-compliance purposes and routine backup copies not reasonably accessible in the ordinary course. Any retained information remains subject to this Agreement until destroyed.

= Term and Survival

This Agreement begins on the Effective Date and continues for three (3) years unless terminated earlier by either Party upon written notice. The confidentiality and use restrictions survive for three (3) years from each disclosure; however, obligations relating to trade secrets survive for so long as the information remains a trade secret under applicable law, and obligations relating to credentials, security vulnerabilities, and customer data survive until the information is no longer confidential or has been securely destroyed or returned as applicable.

= No Warranty; Equitable Relief

Confidential Information is provided “as is.” Neither Party makes a representation or warranty as to its accuracy or completeness, except as may be stated in a later written agreement. Each Party acknowledges that unauthorized use or disclosure may cause irreparable harm for which monetary damages may be inadequate. Accordingly, the Disclosing Party may seek equitable relief, including temporary, preliminary, and permanent injunctive relief, in addition to any other remedies available at law or in equity.

= General Terms

This Agreement is governed by the laws of the State of Maryland, without regard to conflict-of-law principles. The state and federal courts located in Baltimore County, Maryland have exclusive jurisdiction over disputes arising from this Agreement, and each Party consents to that jurisdiction and venue.

Neither Party may assign this Agreement without the other Party’s prior written consent, except to a successor in connection with a merger, acquisition, or sale of substantially all relevant assets, provided that the successor agrees in writing to be bound by this Agreement. This Agreement is the entire agreement between the Parties concerning its subject matter and supersedes prior oral or written confidentiality understandings concerning that subject matter. Any amendment or waiver must be in writing and signed by both Parties. If any provision is held unenforceable, the remaining provisions remain in effect and the unenforceable provision shall be enforced to the maximum extent permitted by law. Notices under this Agreement must be in writing and delivered by personal delivery, recognized courier, certified mail, or email with confirmation of receipt to the addresses or emails the Parties designate in writing.

This Agreement may be executed in counterparts and by electronic signature or electronically transmitted signature, each of which is deemed an original and all of which together constitute one instrument.

#v(1.45em)
#align(center)[#text(size: 10pt, weight: "bold", fill: navy)[SIGNATURES]]

#v(0.75em)
#grid(
  columns: (1fr, 1fr),
  gutter: 1.2cm,
  [
    #text(weight: "bold", fill: navy)[READY PACKETS CONSULTING LLC]
    #v(0.15em)
    #text(size: 8.5pt, fill: muted)[d/b/a ReadyPackets]
    #signature-line("Authorized signature")
    #signature-line("Printed name")
    #signature-line("Title")
    #signature-line("Date")
  ],
  [
    #text(weight: "bold", fill: navy)[[PARTNER LEGAL NAME]]
    #v(0.15em)
    #text(size: 8.5pt, fill: muted)[Prospective platform-development partner]
    #signature-line("Authorized signature")
    #signature-line("Printed name")
    #signature-line("Title")
    #signature-line("Date")
  ],
)

#v(1.6em)
#align(center)[#text(size: 8.2pt, fill: muted)[ReadyPackets™ · Confidential business document · Draft for attorney review before signature]]
