# Balance

**Virtual cards, live budgets and an AI risk analyst for UCD society committees.** HackUCD 2026 · FinTech & Quantitative Analysis (payments + fraud & risk), crossover with Everyday Frustrations ("your society's spreadsheet chaos").

Every society gets **five virtual officer cards**, one per committee officer, each with its own per-purchase and monthly limit. Events are budgets: point a card at an event and its purchases come out of that budget, within the event's dates. Every purchase is checked twice:

1. **In real time by deterministic rules** (event budget, card limits, blocked merchant categories, event dates, 13 scored risk signals), inside the card network's authorisation window. Typical decision: under 1 ms.
2. **Straight after by JEV**, an LLM risk analyst called through **OpenRouter**. It compares the purchase with the society's own history, the purchaser's pattern and the event's context, then explains anything odd in plain English with evidence the treasurer can check. AI can raise suspicion but never approve, and auto-freeze needs **both** layers to agree.

Sponsors and UCD top up a society's budget through **Stripe Checkout**; societies subscribe to the **€49/year Society Plan** (Stripe bonus).

See [`docs/PRD.md`](docs/PRD.md) (and the [`hackathon brief`](docs/HACKATHON_BRIEF.md)) for the full product spec and [`DATA.md`](DATA.md) for data sources and assumptions.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:3000; the synthetic dataset is generated on first load
```

No keys are required. Without them, Balance runs a **simulated checkout** (it never collects card details) and the **MockAdapter** card network, and JEV falls back to clearly labelled **rules-only** assessments. To turn on the real integrations, copy `.env.example` to `.env` (untracked) and fill in what you need.

| Variable | Turns on |
|---|---|
| `OPENROUTER_API_KEY` (+ `JEV_MODEL`, default `anthropic/claude-haiku-5.5`) | JEV analysis on every purchase, the evaluation run |
| `STRIPE_SECRET_KEY` (sandbox `sk_test_…` only; the app refuses live keys) | Real Stripe Checkout for top-ups and the Society Plan subscription |
| `STRIPE_WEBHOOK_SECRET` | Signature-verified webhooks. Run `stripe listen --forward-to localhost:3000/api/webhooks/stripe` |
| `ISSUING_MODE=stripe` | Real Stripe Issuing virtual cards and test-helper authorisations (needs Issuing enabled on the sandbox account) |

Other scripts:

```bash
npm test           # PRD §11.2 test matrix (32 ordinary / boundary / failure cases) → data/test-results.json
npm run eval       # JEV over the labelled eval set: rules vs JEV vs combined (needs OPENROUTER_API_KEY)
npm run eval -- openai/gpt-5-mini   # compare another OpenRouter model
npm run seed       # regenerate the synthetic year (fixed seed)
npm run typecheck && npm run lint
```

## The 3-minute demo

1. **Landing:** pick **Aoife Byrne, Treasurer, Drama Society**. Her 2025/26 plan has ended and €180 carried over.
2. **Plan → Subscribe €49/year:** Stripe Checkout (`mode=subscription`). Back in-app, the plan is *Active* and Drama's five officer cards, frozen when the plan lapsed, work again (Stripe bonus: price, button, sandbox purchase, recognised in product).
3. **Funding → Open page:** the public sponsor page. Pay **€250** as "Acme Ltd". The success page shows *confirmed* only once payment is verified, and the ledger is credited exactly once.
4. **New event:** *Pizza Night*, €300 budget, with Cian's events-officer card switched on. His card now spends from that budget, only within the event's dates, and still within his own €500 per-purchase and €3,000 monthly limits. **Officer cards** shows all five cards, what each is spending for, and this month's spend.
5. **Purchase simulator** (Cian's card):
   * **Domino's €184** → approved in about 1 ms, rules score 0, JEV low risk.
   * **Paddy Power €50** → declined at the card (blocked MCC 7995) and flagged high.
   * **Electro World €100 at 02:14** → approved by the rules (within limits, score 40, so it goes to review). With `OPENROUTER_API_KEY` set, JEV explains why electronics at 2am doesn't fit a pizza social, and rules ≥ 40 + JEV high → **card auto-frozen**. Without a key, the rules flag it for review, labelled "AI unavailable".
6. **Review queue:** resolve as *Misuse*. The card is cancelled, the hold released, and the incident written to the audit log. The freed slot can take a replacement card from **Officer cards**.
7. **Evaluation:** rules vs JEV vs combined on the labelled set, per-anomaly-type catch rates, 32/32 test matrix, JEV's known limits.

## How it's built

```
Next.js 16 (App Router, TypeScript) monolith · SQLite (better-sqlite3) · Tailwind v4
├─ src/lib/authorize.ts   sync decision engine: hard rules H1–H6, scored rules R1–R13, holds (IMMEDIATE txn)
├─ src/lib/jev.ts         JEV: pseudonymised context, OpenRouter structured output, Zod, retry, evidence check
├─ src/lib/assess.ts      action policy (§8.6): flags, auto-freeze, in-process job queue
├─ src/lib/ledger.ts      append-only ledger in integer cents: funded / held / spent / available
├─ src/lib/payments.ts    Stripe Checkout: top-ups (payment) + Society Plan (subscription), idempotent fulfilment
├─ src/lib/cards.ts       officer cards (5 per society, event assignment, limits) + CardNetworkAdapter: StripeIssuing | Mock
├─ src/lib/seed.ts        synthetic year + labelled anomalies, replayed through the real engine
├─ src/lib/evaluation.ts  rules vs JEV vs combined metrics
└─ src/app/api/…          REST API with a consistent {error:{code,message}} envelope + Stripe webhook
```

**Money model.** Stripe Issuing has one Issuing balance per platform account (UCD). Per-society budgets are an internal ledger that Balance enforces at authorisation time, which is why the synchronous decision matters. Invariant (tested): `available = funded − held − spent ≥ 0` and `held = Σ pending authorisations`. A card on an event spends from that event's remaining budget; an unassigned card spends only from **unallocated** money (available minus what open events still have reserved).

**AI guardrails.** temperature 0; JSON-schema output validated with Zod (one retry, then rules fallback); merchant descriptors wrapped as untrusted `<<DATA>>` and backed by a deterministic injection rule (R13); members sent as pseudonyms only; OpenRouter `provider.data_collection: "deny"`; each € amount and MCC cited in a flag is checked against the input; model, prompt version, latency, tokens and cost stored with every assessment.

## Artwork

All illustrations (hero sculpture, card and event art, society icons, personas, the JEV mascot) were generated with **OpenArt** (GPT Image 2) for this project. Originals live in `art-src/` (git-ignored); `npm run art` re-exports the web-sized WebP files in `public/art/`.
