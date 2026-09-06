import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { WalletLinkPanel } from "@/components/wallet-link-panel";
import { merkadoDirectHref, merkadoPayHref } from "@/lib/pay/config";
import { getOptionalUser } from "@/lib/supabase/server-client";
import { getActiveLinkedWallet } from "@/lib/wallet-link/service";

import { AccountPageHeader } from "../account-page-header";

export const metadata = { title: "Apps" };

function AppCard({
  title,
  body,
  href,
  external,
  actionLabel,
}: {
  title: string;
  body: string;
  href: string;
  external: boolean;
  actionLabel: string;
}) {
  return (
    <section className="flex flex-col rounded-[16px] border border-grey-200 bg-surface p-5 min-[769px]:p-6">
      <h2 className="text-[18px] font-semibold leading-[26px] text-surface-dark">{title}</h2>
      <p className="mt-2 text-[14px] leading-5 font-normal text-grey-900">{body}</p>
      <Link
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        className="mt-4 inline-flex h-9 w-fit items-center justify-center gap-1.5 rounded-[12px] bg-violet-500 px-3 text-[13px] font-semibold leading-4 text-white transition-colors hover:bg-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1"
      >
        {actionLabel}
        <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
        <span className="sr-only">
          {external ? "Opens in a new tab" : "Opens another Merkado app"}
        </span>
      </Link>
    </section>
  );
}

export default async function AppsPage() {
  const pay = merkadoPayHref();
  const direct = merkadoDirectHref();
  const user = await getOptionalUser();
  const linkedWalletAddress = user ? await getActiveLinkedWallet(user.id) : null;

  return (
    <div className="flex flex-col gap-4">
      <AccountPageHeader
        title="Apps"
        description="Merkado Pay and Merkado Direct linked to this demo account."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <AppCard
          title="Merkado Pay"
          body="See rent payments and pay this month. Shown in XCG, settled in USDC."
          href={pay.href}
          external={pay.external}
          actionLabel="Open Pay"
        />
        <AppCard
          title="Merkado Direct"
          body="Open Merkado Direct: My Offers, Simulator, Marketplace, and Portfolio."
          href={direct.href}
          external={direct.external}
          actionLabel="Open Direct"
        />
      </div>
      <section className="rounded-[16px] border border-grey-200 bg-surface p-5 min-[769px]:p-6">
        <h2 className="text-[18px] font-semibold leading-[26px] text-surface-dark">
          Wallet
        </h2>
        <p className="mt-2 text-[14px] leading-5 font-normal text-grey-900">
          Link one wallet to this account. Marketplace purchases and Portfolio
          rent claims use the linked wallet.
        </p>
        {user ? (
          <WalletLinkPanel
            initialLinkedAddress={linkedWalletAddress}
            className="mt-4"
          />
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Sign in to link a wallet to your account.
          </p>
        )}
      </section>
    </div>
  );
}
