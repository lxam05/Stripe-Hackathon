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
| `STRIPE_SECRET_KEY` | Sandbox Checkout and required Stripe Issuing card creation; live keys are rejected |
| `STRIPE_WEBHOOK_SECRET` | Signature-verified Stripe webhooks |

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Tests use a separate disposable database and never reset your app database. `npm run seed` explicitly resets the app to Drama Society with no cards. The first run after upgrading from the old multi-society fixture performs that same one-time cleanup.

## Who sees what

| | Societies Council | Treasurer | Senior treasurer | Other members & officers |
|---|---|---|---|---|
| Societies | All (oversight) | Their own | Their own | Their own |
| Committee cards | All | All, and manages them | All (read-only) | Only their own card |
| Card payments, reviews, risk investigations | All | Whole society; decides reviews | Whole society (read-only) | Only payments on their own card |
| Expenses | All | All claims; approves and records repayment | All claims | Only their own claims and receipts |
| Events | All | All; creates, tags cards, closes | All | Events their card is on or they bought for; only their own purchases on them |
| Funding & ledger | Overview | Yes | Yes | No |
| Plan & billing | No | Yes | No | No |
| Grant report | Reviews submitted reports | Yes (owns it if no senior) | Prepares and submits | No |
| Members directory | Leadership changes | Adds members | Yes | Yes |
| Simulator / Evaluation | All cards / yes | Society's cards / no | Own card / no | Own card / no |

Rules live in `src/lib/access.ts` and are enforced on every page and API route, not only hidden in the UI. Asking for someone else's payment, card or event returns a 404.

## Main demo

- Run `npm run demo:prepare` to reset the app to UCD Drama Society with a €0 balance and zero cards.
- Top up Drama, then use the success-page action to continue as Aoife.
- Open Cards and issue an officer card. Balance creates the cardholder/card in Stripe Issuing; no demo card is substituted if Stripe is unavailable.
- Set the per-purchase limit, monthly limit and merchant profile during issuance.
- `npm run demo:prepare` leaves exactly one card, Aoife's (treasurer), in Stripe and cancels earlier run cards. As Aoife, issue Cian (events officer) his card live; pick an event under “Spending for” so food spend reads as event spend.
- Continue as Cian, open his card and choose a shop: **Slice Republic** (pizza, the happy path) or **Pixel Vault** (PlayStation Portal: paid, then flagged for review; PlayStation 5 Pro: over his €500 limit, declined by Stripe). Each is a fictional outside shop with its own card form, autofilled with his card in the demo. The shop charges the real Stripe Issuing card with its own merchant name and category; Balance's webhook approves or declines in real time. Stripe Checkout isn't used because sandbox Checkout rejects Issuing card numbers.
- From the shop's confirmation, go back to the Balance dashboard to see the payment, and Payment reviews for why it was flagged.
- Purchases, authorizations and card status changes reconcile through Stripe webhooks.

## Important behavior

Cards belong to committee members across events. Events are optional cost centres; their budgets and dates are advisory. Per-purchase and monthly card limits are hard, atomic authorization checks. Active card/plan/capacity, available funds, the selected merchant profile and university-wide blocked categories are also hard checks.

Recurring mandates are explicit: cardholder + merchant identity + currency + amount range + cadence + expiry. They skip routine review, not safety/risk exceptions. Misuse review never refunds or reverses a payment.

€49/year includes five card slots. A €10 extra slot is valid for the remaining plan year and expires at renewal, with no automatic renewal. Cancelled cards release slots; pending/frozen cards count. Extra-card revenue is not society funding.

Every card has a human-readable merchant profile: Standard society spending, Event essentials only or Society trip. Global blocks can never be relaxed. Stripe Issuing receives the same `per_authorization`, `monthly` and category controls used by the local authorization engine.

## Integrations

Stripe uses a signature-verified endpoint at `/api/webhooks/stripe`. Webhooks are required for billing and asynchronous checkout: configure completed/async-success/failure, invoice paid/payment-failed, subscription lifecycle and Issuing events. Never substitute the success page for webhook fulfilment. Run `npm run stripe:listen` (it forwards exactly the events the endpoint handles, using `STRIPE_SECRET_KEY`) and put the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET`.

Stripe Issuing demo:

1. Enable Issuing in the Stripe sandbox and set `STRIPE_SECRET_KEY`.
2. Run `npm run seed` to create only Drama Society with zero cards. For an upgrade from the old fixture, `npm run stripe:clean-demo-cards` cancels the legacy seeded cards in Stripe.
3. Run `npm run stripe:listen` in a second terminal and set the printed webhook secret.
4. Run `npm run dev`, continue as Aoife, and issue cards from the Cards page. Only cards tagged as created by Balance are synchronized back into the society.

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
