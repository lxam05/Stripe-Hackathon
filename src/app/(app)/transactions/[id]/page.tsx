import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, HelpCircle, LoaderCircle } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { ReviewActions } from "@/components/review-actions";
import { HoldTools } from "@/components/txn-tools";
import { MerchantAvatar, prettyMerchant } from "@/components/txn-list";
import { DecisionBadge, Notice, Panel, Pill, SectionTitle, button, cx } from "@/components/ui";
import { requireActor } from "@/lib/guard";
import { mccInfo } from "@/lib/mcc";
import { fmtDate, fmtDateTime, fmtEur } from "@/lib/money";
import { comparablePurchases, getTransaction, latestAssessment, signalsOf } from "@/lib/queries";
import { canManageSociety, canSeeOwned, isOfficer } from "@/lib/access";
import { NEXT_STEP, plainSignal, plainText } from "@/lib/explain";
import { getDb } from "@/lib/db";

export async function generateMetadata({ params }: PageProps<"/transactions/[id]">) {
  const t = getTransaction((await params).id);
  return { title: t ? `${prettyMerchant(t.merchant_name)} · ${fmtEur(t.amount_cents)}` : "Transaction" };
}

/**
 * One purchase, explained for people: what happened, and in plain words why it was blocked or
 * needs a look. The engine's scores, rule codes and model output are on /engine/[id].
 */
export default async function TransactionPage({ params }: PageProps<"/transactions/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  const t = getTransaction(id);
  if (!t || !canSeeOwned(actor, t)) notFound();
  const manage = canManageSociety(actor, t.society_id);
  const own = actor.kind === "member" && actor.id === t.member_id;
  const ra = latestAssessment(t.id);
  const signals = signalsOf(t);
  // Officers compare against their own history only, never other officers' spending.
  const comps = comparablePurchases(t, isOfficer(actor) ? t.member_id : undefined);
  const info = mccInfo(t.mcc);
  const flag = getDb().prepare(`SELECT * FROM flag WHERE authorization_id=?`).get(t.id) as
    | { id: string; severity: "low" | "medium" | "high"; status: string; card_frozen: number; resolution_note: string | null; resolved_at: string | null }
    | undefined;
  const card = getDb().prepare(`SELECT status FROM card WHERE id=?`).get(t.card_id) as { status: string };
  const checking = (!ra || ra.status === "pending") && t.source !== "seed";
  const aiDone = ra?.source === "jev" && ra.status !== "pending";
  const questions = aiDone ? (JSON.parse(ra!.questions) as string[]) : [];
  const declined = t.decision === "declined";
  const openFlag = flag && ["open", "receipt_requested"].includes(flag.status);
  // First-time payments and exceptions also wait in the treasurer's payment review queue.
  const review = getDb().prepare(`SELECT status, reason FROM payment_review WHERE authorization_id=?`).get(t.id) as { status: string; reason: string } | undefined;
  const reviewOpen = review && ["pending", "receipt_requested"].includes(review.status);
  const waiting = openFlag || reviewOpen;
  const wasFlagged = Boolean(flag) && !openFlag;

  // Hard rules explain a decline; everything else explains why it was sent for a look.
  const reasons = (declined ? signals.filter((s) => s.hard) : signals.filter((s) => !s.hard)).map(plainSignal);
  if (!declined && !reasons.length && reviewOpen) reasons.push(plainText(review!.reason) || "First payment to this shop.");
  const first = t.member_name.split(" ")[0];

  return (
    <>
      <AutoRefresh active={checking} />
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href="/transactions" className={button("ghost", "-ml-3")}>
          <ArrowLeft className="h-4 w-4" /> {isOfficer(actor) ? "My purchases" : "Transactions"}
        </Link>
        {t.event_id && (
          <Link href={`/events/${t.event_id}`} className="text-sm text-ink-3 hover:text-ink">
            {t.event_name} →
          </Link>
        )}
      </div>

      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="hidden scale-125 sm:ml-1 sm:mr-2 sm:block">
          <MerchantAvatar name={t.merchant_name} declined={declined} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-3">
            {info.label}
            {t.merchant_city ? ` · ${t.merchant_city}` : ""}
          </p>
          <h1 className="display break-words text-4xl leading-tight sm:text-5xl">{prettyMerchant(t.merchant_name)}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {fmtDateTime(t.created_at)} · {own ? "Your card" : `${t.member_name}'s card`} ••{t.card_last4}
            {t.event_id ? ` · ${t.event_name}` : ""}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <div className={cx("display text-5xl tabular", declined && "text-ink-3 line-through")}>{fmtEur(t.amount_cents)}</div>
          <div className="mt-2 flex gap-1.5 sm:justify-end">
            <DecisionBadge decision={t.decision} status={t.status} />
            {waiting && <Pill className="bg-coral/15 text-[#a8452c]">Needs review</Pill>}
            {t.captured_cents > 0 && t.captured_cents !== t.amount_cents && <Pill className="bg-paper-2 text-ink-2">Charged {fmtEur(t.captured_cents)}</Pill>}
          </div>
        </div>
      </header>

      <div className={cx("grid gap-6", comps.length ? "lg:grid-cols-[1.4fr_1fr]" : "max-w-3xl")}>
        <div className="min-w-0 space-y-6">
          <Panel>
            <SectionTitle>What happened</SectionTitle>
            {declined ? (
              <Notice tone="bad" title="This purchase was blocked">
                The card declined it at the till, so no money left the society account.
              </Notice>
            ) : waiting ? (
              <Notice tone="warn" title="Paid, and waiting for a quick review">
                The purchase went through as normal. {manage ? "It's new or unusual enough that you should take a look." : own ? "Your treasurer will take a look; nothing for you to do unless they ask." : "The treasurer will take a look."}
              </Notice>
            ) : wasFlagged ? (
              <Notice tone="info" title="Paid, then flagged and reviewed">
                The purchase went through, looked unusual, and the treasurer has since reviewed it.
              </Notice>
            ) : checking ? (
              <div className="flex items-center gap-3 rounded-xl bg-paper-2 px-4 py-3 text-sm text-ink-2">
                <LoaderCircle className="h-4 w-4 animate-spin text-stone-2" /> Paid. Checking it against the society&rsquo;s usual spending…
              </div>
            ) : (
              <Notice tone="ok" title="Paid. Nothing unusual">
                It matches how the society normally spends, so no review is needed.
              </Notice>
            )}

            {reasons.length > 0 && (declined || waiting || wasFlagged) && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium text-ink">{declined ? "Why it was blocked" : waiting ? "Why it needs a look" : "Why it was flagged"}</p>
                <ul className="space-y-1.5 text-[15px] text-ink-2">
                  {reasons.map((r) => (
                    <li key={r} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {aiDone && ra!.summary && (flag || ra!.risk_level !== "low") && !declined && (
              <p className="mt-4 rounded-xl bg-paper-2 px-4 py-3 text-[15px] leading-relaxed text-ink">{plainText(ra!.summary)}</p>
            )}

            {manage && openFlag && aiDone && ra!.recommended_action && NEXT_STEP[ra!.recommended_action] && (
              <p className="mt-4 text-sm">
                <span className="text-ink-3">Suggested next step: </span>
                <b className="font-medium">{NEXT_STEP[ra!.recommended_action]}</b>
              </p>
            )}
            {manage && openFlag && questions.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-ink-3">
                  <HelpCircle className="h-3.5 w-3.5" /> Worth asking {first}
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
                  {questions.map((q) => (
                    <li key={q}>{plainText(q)}</li>
                  ))}
                </ul>
              </div>
            )}

            {manage && reviewOpen && !openFlag && (
              <Link href="/review" className={button("primary", "mt-5")}>
                Review it
              </Link>
            )}

            {t.status === "pending" && t.decision === "approved" && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-3">Demo: what the shop does next</p>
                <HoldTools authId={t.id} />
              </div>
            )}
          </Panel>

          {flag && (
            <Panel className={cx(openFlag && "ring-1 ring-coral/50")}>
              <SectionTitle>Review</SectionTitle>
              {flag.card_frozen ? (
                <div className="mb-3">
                  <Notice tone="info" title="The card was frozen">
                    This looked risky enough that the card was paused until the treasurer reviews it.
                  </Notice>
                </div>
              ) : null}
              {openFlag ? (
                manage ? (
                  <ReviewActions flagId={flag.id} cardStatus={card.status} authStatus={t.status} status={flag.status} />
                ) : (
                  <p className="text-sm text-ink-2">The treasurer has been notified and will review this purchase.</p>
                )
              ) : (
                <Notice tone={flag.status === "fraud" ? "bad" : "ok"} title={flag.status === "fraud" ? "Marked as misuse" : "Reviewed and approved"}>
                  {flag.resolution_note ?? "No note added."} {flag.resolved_at && `(${fmtDate(flag.resolved_at)})`}
                </Notice>
              )}
              {flag.status === "receipt_requested" && <p className="mt-3 text-xs text-ink-3">Receipt requested. Close the review once it arrives.</p>}
            </Panel>
          )}
        </div>

        {comps.length > 0 && (
          <div className="min-w-0">
            <Panel>
              <SectionTitle>Similar past purchases</SectionTitle>
              <ul className="divide-y divide-line text-sm">
                {comps.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/transactions/${c.id}`} className="min-w-0 truncate hover:underline">
                      {prettyMerchant(c.merchant_name)} <span className="text-ink-3">· {fmtDate(c.created_at)}</span>
                    </Link>
                    <span className="tabular">{fmtEur(c.amount_cents)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
