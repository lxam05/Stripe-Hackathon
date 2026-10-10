# HackUCD 2026 — Challenge Brief & Rubric (Agent Reference)

> **Purpose of this file:** Single source of truth for every AI agent working on this project. Read it before ideating, planning, coding, testing, or writing pitch material. Every decision should trace back to a scoring criterion below.
>
> Sections 1–7 restate the official challenge document. Section 8 contains derived guidance for agents (interpretation, not official rules).

---

## 1. The Challenge in One Paragraph

Pick a real frustration you recognise (e.g. a society's spreadsheet chaos, a café's unsold lunch, a task friends keep complaining about) and find the people who share it. In **one afternoon**, turn that insight into a **working prototype**. Use AI (via **OpenRouter**), test your hunches, and give first users a reason to try it. Small, carefully executed projects can score highly.

---

## 2. Themes

Choose **one primary theme**. Crossovers are allowed. AI can be applied across all themes.

| Theme | Brief |
|---|---|
| **Everyday Frustrations** | Help people overcome recurring problems in studying, organising, finding information, or getting things done. Find a task that wastes time or causes confusion and make it easier. |
| **Sustainability** | Spot value in what gets wasted. Help people save energy, keep useful things in circulation, or turn leftovers into someone else's next meal. |
| **FinTech & Quantitative Analysis** | Take the headache out of money, or turn messy data into a decision someone can act on. |

### Sample directions (starting points only — team chooses problem, users, solution)

**Everyday Frustrations**
- *Less repetitive administration* — automate routine tasks, summarise info, coordinate plans, make sense of documents. → People managing busy schedules, projects, paperwork.
- *Learning and revision* — personalised tutoring, study planning, quizzes, turning notes into practice. → Students, teachers, skill learners.
- *Accessibility and navigation* — use images/video to interpret surroundings, recognise objects, wayfinding. → People with accessibility needs, visitors, communities.

**Sustainability**
- *Energy and renewables* — consumption, renewable generation, smart grids, making energy use understandable. → Households, campuses, energy users.
- *Reuse and surplus* — swap/reuse marketplaces, surplus food, repair, recycling. → People with spare goods, local businesses, communities.
- *Travel and carpooling* — shared rides, cycling, public transport; compare time, cost, energy; drivers sharing costs. → Commuters, people making similar journeys.

**FinTech & Quantitative Analysis**
- *Market analysis* — market data, backtesting, portfolios, news sentiment. → Researchers, people learning about markets.
- *Payment workflows* — payment collection, cross-border, open banking, settlement, reconciliation, understanding where money goes. → Businesses, sellers, people managing payments.
- *Fraud and risk* — unusual transactions, credit/lending risk, early-warning tools (public or synthetic data). → People/organisations managing financial risk.

---

## 3. Mandatory Expectations

| # | Expectation | Requirement |
|---|---|---|
| E1 | **Know your first users** | Explain: who they are, their problem, their current workaround, why they'd choose your solution, how you'd reach them. **Distinguish evidence from assumptions.** |
| E2 | **Build a working prototype** | Deliver **one working workflow** as an app, API, analysis tool, or automation. **Local execution is sufficient.** |
| E3 | **Use OpenRouter meaningfully** | Add a useful product feature through **OpenRouter APIs**. **AI coding assistance alone does NOT count.** |
| E4 | **Test and learn** | Investigate a user assumption via feedback, observation, or public evidence. Test **ordinary, boundary, and failure inputs** in the prototype. Explain what you learned or changed. |
| E5 | **Use suitable data** | Public or synthetic data only. **State source and assumptions.** For any claimed savings, **state what you're comparing against** (the baseline). |

---

## 4. Data Rules & Suggested Sources

- A small downloaded dataset is enough. Live feeds are **optional**.
- Public data may be combined with **clearly labelled fictional** users, transactions, or journeys.
- For private-record ideas (shop transactions, individual journeys), use a **small synthetic dataset**.
- Always check and document the dataset's **date, units, and reuse terms**.

| Source | Use for |
|---|---|
| **CSO Open Data** | Irish statistics on population, commuting, transport, income, spending. Use aggregate patterns to explore a problem or pick a focus area. |
| **Ireland's Open Data Portal / Smart Dublin** | Local transport, environment, and other datasets. Pick a small, documented dataset you can understand during the event. |
| **NTA public transport data** | Static timetables, routes, stops for scheduled public-transport comparisons. **Schedules, not live travel-time predictions.** |
| **SEAI conversion factors** | Convert fuel use into energy and estimated emissions. **Vehicle efficiency and fuel prices must be supplied separately as clearly stated inputs.** |
| **NASA FIRMS / USGS earthquake catalogue** | Public fire and earthquake observations for environmental monitoring or risk simulations. |

---

## 5. Judging Rubric (Base: 50 points, equally weighted)

Rubric draws on four Stripe operating principles plus AI usage. Each criterion is scored **0–10** per judge.

| Criterion | What judges look for | Score |
|---|---|---|
| **Users first** | A specific user group, a meaningful problem, a reason to adopt, and a credible way to reach those users. Supported by user insight and evidence. | /10 |
| **Create with craft and beauty** | Clear, coherent experience; **correct results**; thoughtful details; **useful error handling**. Includes API and analysis design. | /10 |
| **Move with urgency and focus** | Sensible priorities and scope choices; delivering a useful workflow within the available time. | /10 |
| **Stay curious** | Testing an assumption, exploring an alternative, or investigating a limitation — **then using what you learned**. | /10 |
| **AI usage** | Effective use of **OpenRouter** to improve the solution, with **demonstrated output quality** and **understanding of its limitations**. | /10 |

> ⚠️ **No demonstrated OpenRouter feature = 0 for AI usage.** Other criteria are still scored normally.

---

## 6. Final Scoring

- Final score = **average of judges' base totals (/50)** + **Stripe bonus (0 or 5)** → **max 55**.
- Example: judge totals 40 and 44 → base 42 → with bonus 47/55.
- Bonus is added **once per team**, regardless of number of judges, purchases, or subscriptions.
- **One judging round.** Teams ranked by final score out of 55.
- Judges assess **evidence in the prototype** and at **in-person judging**.
- Existing customers or revenue are **not** required.

---

## 7. Stripe Bonus (+5, all-or-nothing, optional)

Available under every theme. **Stripe sandbox only — never collect real payments.**

All four steps are required for the 5 points:

1. **Choose a pricing model** — weekly, monthly, or yearly subscription, or one-time purchase. Show a **non-zero test price, currency, and what the customer gets**. One working option is enough. **Explain why it suits your customers.**
2. **Add a Buy/Subscribe button using Stripe's APIs**, connected to the product's purchase flow. Stripe-hosted Checkout via the **Checkout Sessions API** is suitable.
3. **Complete a customer checkout in the sandbox** — at least one successful test purchase. For subscriptions: show **subscription creation AND the first successful test payment**.
4. **Recognise the purchase in the product** — use Stripe's payment confirmation to **activate access or record the order**. Show the completed test transaction and outcome to judges, and explain the pricing model and integration.

> ⚠️ A pricing page or button on its own does **not** qualify.

---

## 8. Agent Guidance (Derived — Not Official Rules)

### 8.1 Decision filter
Before adding any feature, ask: *Which criterion does this raise, and is it on the single core workflow?* If neither, defer it.

### 8.2 Scope discipline (→ Move with urgency and focus)
- Build **one end-to-end workflow** that works reliably. Depth over breadth.
- Local execution is fine — do not spend time on deployment, auth systems, or infra unless the workflow needs it.
- Keep a short written log of scope cuts and why (judges reward *sensible* prioritisation, so make it visible).

### 8.3 OpenRouter feature (→ AI usage)
- AI must be a **user-facing product feature**, called via the OpenRouter API (e.g. classification, extraction, summarisation, recommendation, explanation of results).
- Prefer AI where it does something rules can't; keep deterministic logic (maths, money, emissions) in code, not the LLM.
- **Demonstrate output quality:** prepare example inputs/outputs; ideally a small evaluation (e.g. 10–20 cases, compared against expected answers or a simple baseline).
- **Show understanding of limitations:** document failure modes (hallucination, ambiguous input, cost, latency), and handle them — structured output validation, fallbacks, confidence/uncertainty display, user confirmation for consequential actions.
- Never hard-code API keys in committed code; load from environment variables.

### 8.4 Users and evidence (→ Users first)
Maintain a user section covering, for one **specific** group:
- Who they are → their problem → current workaround → why they'd switch → how we'd reach them.
- Tag each claim as **[Evidence]** (with source: conversation, observation, public data) or **[Assumption]**.

### 8.5 Testing and learning (→ Stay curious, Craft)
- Test three input classes for the core workflow: **ordinary**, **boundary** (empty, extreme, very long, unusual formats), **failure** (invalid input, API error/timeout, malformed LLM output).
- Investigate at least **one user assumption** and record: hypothesis → method → result → **what we changed**.
- Optionally compare an alternative approach (different model, prompt, or non-AI baseline) and record the outcome.

### 8.6 Craft
- Results must be **correct** — verify calculations with tests.
- Errors must be **useful**: clear messages that tell the user what happened and what to do next; no raw stack traces in the UI.
- Coherent, clean UI or API design; consistent naming; sensible defaults.

### 8.7 Data
- Keep a `DATA.md` (or section) listing: each dataset, source URL, date, units, licence/reuse terms, and assumptions.
- Label synthetic/fictional data explicitly.
- Any "savings" claim (money, time, CO₂, energy) must name its **baseline** and its inputs.

### 8.8 Stripe bonus (if attempted)
- Use test-mode keys only; Checkout Sessions API; verify payment via session status or webhook before granting access/recording the order.
- Prepare a demo path: pricing shown → click Buy/Subscribe → test card checkout → product shows activated access/recorded order → show the transaction in the Stripe dashboard.

### 8.9 Judging-day evidence checklist
- [ ] Specific user group, problem, workaround, adoption reason, reach channel — evidence vs assumptions marked
- [ ] One working workflow, demoable locally
- [ ] OpenRouter-powered feature visible in the workflow
- [ ] AI output quality examples + known limitations and mitigations
- [ ] Test record: ordinary / boundary / failure inputs
- [ ] Assumption tested and what changed as a result
- [ ] Data sources, dates, units, terms, assumptions documented; synthetic data labelled
- [ ] Baselines stated for any savings claims
- [ ] Scope decisions explained
- [ ] (Bonus) Pricing model + rationale, working sandbox checkout, purchase recognised in product
