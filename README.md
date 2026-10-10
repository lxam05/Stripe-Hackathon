# Balance

A local sandbox for UCD society spending: committee cards, post-payment treasurer reviews, member reimbursements and annual grant reports for Societies Council.

## Run locally

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The project now runs from the repository root, not the old `balance/` folder. Node 24 LTS is recommended (Node 23 produces an engine warning from ESLint dependencies).

Next loads private credentials from your ignored `.env`; see `.env.example`. Never commit secret keys. Prefer a restricted Stripe sandbox key with only the required permissions. With no Stripe key, checkout and issuing are clearly simulated. With no OpenRouter key, risk uses rules and report drafts use labelled templates.

JEV runs TypeSafe's Jev decision model through OpenRouter's Decisions API after each purchase. It answers typed risk/action questions, while Balance builds the displayed explanation from recorded fields. AI never approves a purchase; an automatic freeze still requires agreement from the deterministic rules and a confident high-risk JEV result.

| Variable | Turns on |
| --- | --- |
| `OPENROUTER_API_KEY` + `JEV_MODEL` | JEV purchase analysis and evaluation |
| `GRANT_DRAFT_MODEL` | Optional OpenRouter chat model for report prose; without it reports use a labelled template |
| `STRIPE_SECRET_KEY` | Sandbox Checkout; live keys are rejected |
| `STRIPE_WEBHOOK_SECRET` | Signature-verified Stripe webhooks |
| `ISSUING_MODE=stripe` | Sandbox Stripe Issuing instead of the local adapter |

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Tests use a separate disposable database and a local OpenRouter stub; they never reset your app database. A few existing failure-path tests call external APIs with deliberately invalid test credentials. The sandbox must allow local sockets for the stub. `npm run seed` explicitly resets the app demo data; normal startup uses additive migrations and preserves existing records.

## Main demo

- Choose the Drama treasurer to view payment reviews, card controls and outstanding claims.
- Choose Jamie (member) to submit a receipt-backed claim. Alex (auditor) has a fictional €1,000 approved claim awaiting repayment.
- The treasurer approves/declines expenses and records repayment made externally. “Mark repaid” does not send money.
- Choose Evelyn (senior treasurer) to edit the annual report and forecast; submit to Council.
- Choose Council to create societies, assign required/optional leadership, review reports, record interview notes and approve grant amounts.
- Societies without a senior treasurer use their treasurer as reporting owner.
- Use the simulator for first-time, threshold and recurring purchase cases. Drama's legacy demo plan may need renewal before card spending.

## Important behavior

Cards belong to committee members across events. Events are optional cost centres; their budgets and dates are advisory. Purchase/monthly thresholds trigger **review after payment**, not network declines. Active card/plan/capacity, available funds and blocked MCC policy remain hard checks.

Recurring mandates are explicit: cardholder + merchant identity + currency + amount range + cadence + expiry. They skip routine review, not safety/risk exceptions. Misuse review never refunds or reverses a payment.

€49/year includes five card slots. A €10 extra slot is valid for the remaining plan year and expires at renewal, with no automatic renewal. Cancelled cards release slots; pending/frozen cards count. Extra-card revenue is not society funding.

Existing remotely issued Stripe cards may still carry old hard amount limits. Saving their thresholds clears those legacy limits. Do this deliberately in the sandbox; local migration does not silently change remote cards.

## Integrations

Stripe uses a signature-verified endpoint at `/api/webhooks/stripe`. Webhooks are required for billing and asynchronous checkout: configure completed/async-success/failure, invoice paid/payment-failed, subscription lifecycle and Issuing events. Never substitute the success page for webhook fulfilment. Use `stripe listen --forward-to localhost:3000/api/webhooks/stripe` with the matching sandbox.

This project rejects live Stripe keys. Real Issuing eligibility, funding, consent, tax/VAT registrations and institutional approval remain launch work; Checkout receipts are not proof of available Issuing funds.

JEV calls OpenRouter, never a model provider directly. Risk context is pseudonymized, schema-checked, and falls back to rules. Annual report drafting sends aggregates, not receipts or personal identities, and falls back to a deterministic template.

## Code map

| Area | Files |
| --- | --- |
| Network decisions, holds and captures | `src/lib/authorize.ts`, `ledger.ts` |
| Payment mandates and workflow states | `recurring.ts`, `workflows.ts` |
| Role/tenant checks | `access.ts`, `session.ts` |
| Cards and paid capacity | `cards.ts`, `payments.ts` |
| AI risk and report drafts | `jev.ts`, `assess.ts` |
| Schema and additive demo upgrade | `db.ts`, `demo-workflows.ts` |
| Workflow mutations and receipts | `src/app/api/workflows/[resource]`, `api/expenses/[id]/receipt` |
| Regression coverage | `scripts/test.ts`, `scripts/test-workflows.ts` |

See [the current PRD](docs/PRD.md) for evidence, assumptions and acceptance criteria; [DATA.md](DATA.md) for synthetic data provenance.

## Limitations

Demo cookie identities are deliberately selectable: this is not production authentication. SQLite is local. Receipts need production malware scanning/retention controls. Approved claims are shown as liabilities but not reserved funds. Grant snapshots require human checking. Background risk jobs are in-process, and production needs durable processing plus stronger network reconciliation, webhook concurrency/ordering and capture-adjustment handling.

Interview-reported UCD practices are evidence for the prototype, not verified institutional policy. No measured fraud reduction or time-saving claims are made.

## Artwork

Existing artwork was generated for this project; web assets are in `public/art/`. Originals and the old local `balance/` artifacts are preserved and are not needed to run the root app.
