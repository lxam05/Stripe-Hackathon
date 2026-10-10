# Balance — UCD society spending and accountability
Version 3 · 10 October 2026 · implemented local sandbox prototype

## 1. Product objective

Remove the personal cash burden of running society activities, since committee members spend on society cards instead of their own money, while making spending review and annual grant reporting understandable to volunteers. Cards are assigned to committee members, not created per event. Events are optional reporting cost centres.

The primary journey is: Council sets up a society and its leadership → treasurer adds members and issues controlled committee cards → committee members spend on their cards → routine purchases stay out of the review queue while policy/risk exceptions are reviewed after payment → senior treasurer prepares the annual report → Council reviews the report, interview notes and next-year grant estimate.

Sponsor top-ups, billing, the purchase simulator and risk evaluation support this journey; they are not the main product story.

## 2. Evidence and uncertainty

The following is interview context supplied by the product owner, not independently verified UCD policy:

- Every society has a treasurer who reviews first-time payments; recurring payments can be allowed after initial approval.
- A senior treasurer oversees spending and prepares a report for a Societies Council interview.
- The interview considers the preceding year's spending and the estimate for next year's grant.
- Today members pay society expenses out of pocket and wait days for reimbursement. A Netsoc auditor reported being about €1,000 out of pocket for an event. Committee cards funded from the society balance remove this.
- An emergency refreshments purchase replaced a failed bubble-tea delivery. Discretionary substitution can be legitimate, rather than automatically suspicious.

Product decisions agreed for this prototype:

- Council creates societies and assigns a required treasurer and an optional senior treasurer. Without a senior, the treasurer owns reporting.
- Treasurer review occurs **after payment** for deterministic exceptions and purchases escalated by JEV.
- Committee members receive individual cards funded from the society balance, so nobody fronts society costs personally.
- €49/year includes five card slots; each extra slot costs €10 for the remaining plan year.
- Grant decisions do not themselves transfer funds.
- AI drafts are editable, advisory and explicitly labelled.

Superseded assumptions: one shared treasurer card, one card per event, event dates as a hard spending gate, risk score alone as a decline, misuse review as a refund, and sponsor acquisition as the primary workflow.

Still to validate with UCD: exact role appointment and handover rules; who may use discretion and at what value; official MCC restrictions; reporting template and academic-year boundary; receipt retention and privacy policy; grant eligibility for fees; lawful card issuance and funding architecture. Sandbox configuration is not represented as official UCD policy.

## 3. Roles and access

| Role | Primary permissions |
| --- | --- |
| Member | View the society membership; no card |
| Committee cardholder / auditor | Member permissions plus personal card spending |
| Treasurer | Add members, issue/manage committee cards, configure hard limits and merchant profiles, review exception payments, approve/revoke recurring mandates |
| Senior treasurer | Read society spending and evidence; prepare, edit and submit annual reports; no routine card/payment approval powers |
| Treasurer when no senior exists | Also owns annual report preparation and submission |
| Societies Council admin | Create societies, assign/change leadership, view society evidence, comment on/return/approve submitted reports and record approved grant amount |

No society member may access another society's protected records or receipts. Council is not an implicit substitute treasurer for ordinary payment reviews. Role switching is explicitly demo-only, not production authentication.

## 4. Card spending and review

### Network decision

A synchronous SQLite transaction checks active card/plan/slot entitlement, available society funds, per-purchase/monthly limits, the card's merchant profile and configured global MCC blocks. These can decline a purchase. No model is called in this path. A successful authorization reserves a hold; capture converts the hold into recorded spending.

Purchase and monthly card limits are **hard authorization limits**, checked atomically. Stripe Issuing receives matching `per_authorization` and `monthly` controls. Event dates and event budget overruns remain advisory. A high aggregate risk score alone does not decline spending. Event budgets do not ring-fence funds from other society purchases.

Legacy database column names `per_auth_cap_cents` and `monthly_limit_cents` remain for compatibility and now store hard limits. Every card also has a restriction profile: `standard`, `event_essentials` or `trip`. Restricted profiles are allowlists; unknown categories are blocked and global gambling, cash-like, tobacco and adult-service blocks can never be weakened.

### Post-payment review

Every approved payment gets an immediate review-state row, independent of AI availability. Routine policy-compliant purchases are `not_required`; deterministic exceptions are `pending`, and JEV may escalate a routine purchase to `pending`. The treasurer can approve spending, request evidence or mark misuse with a recovery note. Reviews do not reverse holds, refund settled payments or claim money has been recovered. Card freeze/cancellation is a separate future-use control.

A payment may be authorised but not yet captured when it appears in the queue. UI distinguishes network status from the treasurer's review. The optional risk flag is a separate investigation record, not a replacement for routine payment review.

### Recurring mandates

An initial approved payment can create an explicit mandate scoped to society, cardholder, merchant identity, currency, amount range, cadence and expiry. Default form suggestions: ±10%, monthly, end of the academic year; treasurer can edit them.

Supported cadence tolerances: weekly 6–8 days, monthly 25–35 days, yearly 350–380 days since the last matched payment. Only one payment consumes a cadence slot. Unmatched routine purchases remain `not_required`; duplicate, category, timing, velocity, foreign-merchant and AI risk exceptions still require review. Revoked/expired mandates never claim an automatic match.

When no stable network merchant identifier is available, use an exact normalized descriptor + MCC + country. This is deliberately conservative but is not proof of merchant identity. Production must use and validate a stable identifier wherever available. Mandates authorize review treatment, not merchant-initiated debit collection.

## 5. Annual report and Council interview

One report per society and academic year, defined in this prototype as September 1 through the next September 1 (UTC boundaries; confirm the official calendar before rollout).

Deterministic evidence includes net recorded spending, event/category breakdowns, prior-year recorded spending, current holds and links to underlying ledger entries and transactions. Missing prior-year entries are labelled missing evidence, not proof of no activity.

Initial forecast = net recorded spending, never below zero. The owner edits the amount and narrative for planned events, inflation, one-off costs and other income. OpenRouter can draft a short narrative from aggregates only; missing key/API failure uses a clearly labelled deterministic template. AI never sets an approved grant or moves money.

State: draft → submitted → returned for revision → submitted → approved. Submitted reports are locked for the owner; Council can save interview notes, request revision or approve an explicit amount. Evidence refreshes on draft save/submission and is then a submission snapshot. Council notes are retained across revisions. Approval records a decision only: receipt of grant funding is a separate ledger event.

## 6. Pricing and funding

- Society Plan: €49 annually; five non-cancelled committee card slots.
- Extra slot: €10 one-time Checkout payment, expires at the current plan renewal date; not prorated and not automatically renewed.
- Pending and frozen cards consume slots; cancelled cards release slots.
- Expired extra capacity cannot authorize new spending. The treasurer must repurchase capacity or cancel a card.
- Checkout fulfilment is idempotent; verified paid completed/async-success events fulfil purchases. Unpaid events do not grant slots.
- Sponsor top-ups and plan revenue are separate: buying a card slot does not increase society spending funds.
- Stripe integration is sandbox-only. Live keys are rejected. No claims are made about production eligibility, banking authorization or whether Checkout funds can automatically fund an Issuing balance.
- Tax/VAT registration and fee treatment must be resolved before real billing. Automatic tax is not silently enabled.

## 7. AI and risk

JEV remains on OpenRouter through its Decisions API using TypeSafe's Jev model. Risk inputs use member pseudonyms, not member emails or receipt files. Merchant text is untrusted. Typed decision answers are validated; invalid responses retry then fall back to rules. Balance builds explanations from recorded fields and includes evidence checks and source labels.

Risk flags can raise attention after recurring matching. Auto-freeze requires agreement between scored rules and confident high-risk AI, and affects future use only. A lower-confidence JEV concern may create a cautious human review but never auto-freezes a card. Legitimate emergency substitutions should be explained, not treated as automatic misuse.

Grant drafting uses aggregate financial evidence only, with a human review requirement. AI narratives may still be inaccurate; ledger totals are authoritative.

## 8. Frontend hierarchy

Primary: Overview, Committee cards, Payment reviews, Grant report, Members.
Supporting: Events/cost centres, Transactions, Funding, Plan.
Demo tools: two fictional outside shops (Slice Republic, Pixel Vault) that charge real Stripe Issuing cards, Purchase simulator, Council-only Evaluation.
Council: society onboarding/leadership and submitted grant reports, with read-only spending oversight.

Each flow must expose ownership, state, empty/error feedback and what the next action actually does. Never call an approval a refund or a report estimate an awarded grant.

## 9. Architecture and migrations

Next.js 16 App Router, React, TypeScript, Tailwind, SQLite integer-cent ledger. Existing risk/card/Checkout modules are retained. Workflow modules add payment reviews, mandates, report snapshots and paid card-slot entitlements. The demo marketplace owns price, merchant and MCC data server-side and accepts idempotency keys.

Schema migration is additive; no implicit database reset. Old synthetic history is labelled imported history, not retroactively claimed to have been individually approved. Explicit demo reset remains Council-only and destructive by confirmation. Private `.env`, database files, build output and node_modules remain ignored.

Mutation routes enforce actor/tenant checks independently of navigation. This is still a local demo with a selectable cookie identity, not hardened multi-user authentication. A production release requires real auth, CSRF/session hardening, durable jobs, full network reconciliation and backup/retention design.

## 10. Acceptance and verification

- Required treasurer, optional senior and explicit reporting fallback.
- Cross-society/role mutation denied.
- Five base slots, paid extras, expiry, cancellation release, frozen/pending counting.
- Hard card-limit boundaries, matching Stripe controls, profile allowlists and immutable global blocks.
- Routine purchases remain out of review; deterministic exceptions and JEV escalation enter it.
- Recurring scope/cadence/expiry/revocation and exception handling.
- Review of misuse does not alter the ledger.
- Evidence-linked report, editable forecast, AI fallback, submission lock, Council return/notes/approved amount.
- Signed webhook replay, unpaid fulfilment prevention and duplicate financial-event handling.
- Typecheck, lint, production build and desktop/mobile browser smoke tests.

The automated results are generated into `data/test-results.json`; do not claim an AI quality score from a fixture test. Interview findings motivate the product, not measured time-saving or fraud-reduction claims.

## 11. Demo sequence

1. Top up UCD Drama Society by €250 and continue from the success page as Aoife, treasurer.
2. Start with zero cards and issue Orla a Stripe sandbox card from the site with a €200 per-purchase limit, €500 monthly limit and Standard society spending profile.
3. As the cardholder, open a shop from the card and buy the €18.40 pizza at Slice Republic; try the PlayStation Portal (flagged) and PlayStation 5 Pro (declined) at Pixel Vault.
4. Show the receipt's cardholder, masked Stripe card and exact society balance movement, then show Orla's increased monthly spend on the dashboard.
5. Buy the console with a site-issued card to create the contextual JEV review; no seeded card or transaction is used.
6. Optional: reproduce the console purchase in the marketplace or use the simulator for broader rules/failure cases.

## 12. Non-goals and launch gates

Not a production bank, live card programme or official UCD grant portal. No real financial action is demonstrated. Institutional approval, Issuing eligibility, legal/KYC terms, funding flows, tax, real authentication, data protection, network control migration, webhook ordering/concurrency and durable background processing remain launch gates.
