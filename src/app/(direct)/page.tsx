import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { HelpTip } from "@/components/help-tip";
import { PrototypeNotice } from "@/components/prototype-notice";
import { ResetDemoButton } from "@/components/reset-demo-button";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatXcg } from "@/lib/rent-advance/money";
import { loadBook } from "@/lib/rent-advance/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

const GATE_PLAIN: Record<string, string> = {
  "M.1.2": "What this instrument is",
  "M.1.3": "Who collects the rent",
  "M.1.4": "Who may hold a position",
};

export default async function DirectPage() {
  const book = await loadBook();
  const offer = book.offers[0];
  const openGates = book.openQuestions.filter((question) =>
    ["M.1.2", "M.1.3", "M.1.4"].includes(question.id),
  );

  return (
    <div className="space-y-8">
      <PrototypeNotice>
        Labs walkthrough. Not live on merkado.cw. No public offering. Wallet
        and USDC payments are mocked.
      </PrototypeNotice>

      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Merkado Labs demo
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Merkado Direct lets a landlord get future rent paid upfront. Merkado
          Pay is the renter payment-link. One shared demo state. This is a sale
          of receivables, not a loan.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RoleCard
          href="/originate"
          badge="Direct"
          title="Merkado Direct"
          body="My Offers, Get Now, Marketplace, and Portfolio. Compare rent paid forward, then walk the seeded book."
          action="Open Direct"
        />
        <RoleCard
          href="/pay"
          badge="Pay"
          title="Merkado Pay"
          body="A simple renter payment-link. Mocked USDC, same rent, same lease. English, Dutch, Papiamentu."
          action="Open Pay"
        />
        <RoleCard
          href="/account/payments"
          badge="Account"
          title="Merkado account"
          body="A fictional Labs account with My Payments and Apps. Not production sign-in."
          action="Open account"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              MRA-001 in one glance
              <HelpTip label="MRA-001">
                The locked reference deal: Sun Set Heights, Cg 1,800 rent, six
                months, 5.50% fee. All other demo offers copy this shape.
              </HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              <Fact
                label="Monthly rent"
                value={formatXcg(180000)}
                tip="What the renter already pays. It does not change."
              />
              <Fact
                label="Term"
                value="6 months"
                tip="Only the six-month term can create an offer. Nine and twelve months can be simulated."
              />
              <Fact
                label="Landlord receives"
                value={formatXcg(1020600)}
                tip="Purchase price: six months of rent minus the 5.50% fee. Paid once."
              />
              <Fact
                label="Fee"
                value={`5.50% · ${formatXcg(59400)}`}
                tip="One flat fee on the gross rent. No extra arrangement or exit charges."
              />
              <Fact
                label="Effective annualised comparison"
                value="21.6%"
                tip="A comparison figure so a landlord can compare the flat fee with other ways of getting cash today. This is not an interest rate. The engine blocks anything above 24%."
              />
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              {offer?.property.district ?? "Sun Set Heights"} · related-party
              premium · sale of receivables, not a loan.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Still open
              <HelpTip label="Still open">
                Counsel has not closed these questions. The seeded book is a
                walkthrough, not a launch.
              </HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="space-y-2">
              {openGates.map((question) => (
                <li key={question.id} className="rounded-lg border bg-muted/40 p-3">
                  <p className="flex items-center gap-1.5 font-medium">
                    {GATE_PLAIN[question.id] ?? question.title}
                    <HelpTip label={question.id}>
                      {question.id}. {question.title}. Blocks{" "}
                      {question.blocks.toLowerCase()}.
                    </HelpTip>
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Reset the walkthrough</p>
          <p className="text-sm text-muted-foreground">
            Restores the seeded offers, payments, transactions, and
            distributions.
          </p>
        </div>
        <ResetDemoButton />
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  tip,
}: {
  label: string;
  value: string;
  tip: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        {label}
        <HelpTip label={label}>{tip}</HelpTip>
      </dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function RoleCard({
  href,
  badge,
  title,
  body,
  action,
}: {
  href: string;
  badge: string;
  title: string;
  body: string;
  action: string;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <StatusBadge tone="neutral">{badge}</StatusBadge>
        <CardTitle className="mt-3 text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
        <Button asChild className="mt-auto w-fit">
          <Link href={href}>
            {action}
            <ArrowRight />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
