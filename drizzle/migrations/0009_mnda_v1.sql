-- Publish the supplied ReadyPackets MNDA as policy version 1.0.
-- Existing historical versions and acceptance records remain immutable.
INSERT INTO policy_versions (policy_id, version, effective_date, body_markdown, published)
SELECT
  d.id,
  '1.0',
  'August 11, 2026',
  'ReadyPackets™ | MNDA

# Mutual Non-Disclosure & Confidentiality Agreement (Mnda)

This Mutual Non-Disclosure Agreement (the “Agreement”) is entered into as of this _____ day of ____________, 20, by and between:

The ReadyPackets Group (“The Group”) and

________________________________________________ (“Client”).

## 1. Purpose

The parties wish to explore a business relationship regarding the architectural synthesis and logic auditing of the Client’s proprietary concepts. In connection with this, the parties may disclose "Confidential Information" to one another.

## 2. Definition of Confidential Information

"Confidential Information" includes, but is not limited to: business plans, logic maps, inventions, technical specifications, sketches, software, and any other proprietary data disclosed during the ReadyPackets™ intake and production process.

## 3. Obligations of Confidentiality

**Both parties agree to:**

- Use the Confidential Information solely for the purpose of evaluating and creating the ReadyPackets™ dossier.
- Hold and maintain the Confidential Information in strictest confidence.
- Not disclose the Confidential Information to any third party without prior written consent.

## 4. Ownership & Intellectual Property

The ReadyPackets Group does not claim ownership of any Intellectual Property shared by the Client. All rights, titles, and interests in the Client’s concepts remain the sole property of the Client. Conversely, the proprietary "Logic Synthesis" methods, CKO Engine frameworks, and trade secrets used by The Group remain the property of The Group.

## 5. Term & Termination

This Agreement remains in effect for a period of two (2) years from the date of last disclosure. The obligation to protect trade secrets shall continue as long as the information remains a trade secret under Maryland law.

## 6. Governing Law

This Agreement shall be governed by and construed in accordance with the laws of the State of Maryland, USA. Any disputes arising under this Agreement shall be resolved in the courts of Baltimore County, Maryland.

## 7. Entire Agreement

This document constitutes the entire agreement between the parties and supersedes any prior understanding.

THE READYPACKETS GROUP Signed: ______________________________

Name: Luis Pichard \t\tTitle: Lead Architect / Principal \t\tDate: ________________________________

CLIENT Signed: ______________________________

Name: _______________________________

Date: ________________________________
',
  TRUE
FROM policy_documents d
WHERE d.slug = 'mnda'
  AND NOT EXISTS (
    SELECT 1 FROM policy_versions existing
    WHERE existing.policy_id = d.id AND existing.version = '1.0'
  );
