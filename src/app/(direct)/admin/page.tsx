import Link from "next/link";

import { CopyValue } from "@/components/copy-value";
import { HelpTip } from "@/components/help-tip";
import { PayNetworkControl } from "@/components/pay-network-control";
import { ResetDemoButton } from "@/components/reset-demo-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Money } from "@/components/money-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isTestnetConfig, mainnetSelectionAllowed } from "@/lib/pay/networks";
import {
  sortOffersForLandlordList,
  statusTone,
  mintStateLabel,
  displayStatusLabel,
} from "@/lib/rent-advance/helpers";
import { mergeOnchain, mintState } from "@/lib/rent-advance/custody";
import { loadBook } from "@/lib/rent-advance/store";
import { isMerkadoConfigured } from "@/lib/onchain/config";
import { MintSweep } from "@/components/rent-advance/mint-sweep";
import { merkadoMinterAddressOrNull } from "@/lib/onchain/minter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const book = await loadBook();
  const minterAddress = merkadoMinterAddressOrNull();
  const offers = sortOffersForLandlordList(book.offers);
  const review = offers.filter((offer) => offer.status === "under_review");

  return (
    <div className="space-y-6">
      <MintSweep />
      <PageHeader
        title="Admin"
        description="Approve offers, record collections, set the payment network, and restore the starting book."
      />

      {review.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Waiting for approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {review.map((offer) => (
              <div
                key={offer.reference}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
              >
                <div>
                  <p className="font-medium">{offer.reference}</p>
                  <p className="text-xs text-muted-foreground">
                    {offer.property.summary} · {offer.property.district}
                  </p>
                </div>
                <Button size="sm" asChild>
                  <Link href={`/admin/${offer.reference}`}>Review</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table className="min-w-[840px]">
          <TableHeader>
            <TableRow>
              <TableHead>Offer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Chain</TableHead>
              <TableHead>Rent</TableHead>
              <TableHead>Purchase</TableHead>
              <TableHead>Filled</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {offers.map((offer) => {
              const onchain = mergeOnchain(offer.onchain);
              const state = mintState(offer);
              return (
                <TableRow key={offer.reference}>
                  <TableCell>
                    <p className="font-medium">{offer.reference}</p>
                    <p className="text-xs text-muted-foreground">
                      {offer.property.district} · {offer.property.summary}
                    </p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(offer.status)}>
                      {displayStatusLabel(
                        offer.status,
                        onchain.tokenId != null && Boolean(onchain.mintTxHash),
                      )}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">
                      {state === "purchased"
                        ? "Purchased"
                        : state === "minted"
                          ? `Minted · token ${onchain.tokenId}`
                          : onchain.mintTxHash
                            ? "Mint in progress"
                            : "Not minted"}
                    </p>
                    {onchain.mintTxHash && isMerkadoConfigured() ? (
                      <p className="text-xs text-muted-foreground">
                        {mintStateLabel(state)}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Money cents={offer.monthlyRentCents} />
                  </TableCell>
                  <TableCell>
                    <Money cents={offer.purchasePriceCents} />
                  </TableCell>
                  <TableCell>
                    <Money cents={offer.fundedCents} compact /> /{" "}
                    <Money cents={offer.offeringCents} compact />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/admin/${offer.reference}`}>Manage</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contract and addresses (Base Sepolia)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Landlords never sign. The backend mints one offer NFT per
            listing. A buyer pays the purchase price to the payout address
            locked at mint, and rent is deposited into the offer contract.
          </p>
          <div className="space-y-3">
            <AddressRow
              title="Merkado operator (minter)"
              copyLabel="Merkado operator"
              value={minterAddress ?? book.cryptoConfig?.companySafeAddress ?? ""}
              tip="The backend key that mints each offer NFT after Admin approval. Landlords never connect a wallet or sign."
            />
            <AddressRow
              title="USDC contract"
              copyLabel="USDC contract"
              value={book.cryptoConfig?.usdcContract ?? ""}
              tip="Circle native USDC for the selected network. Rent and purchases settle 1:1 with stored USD."
            />
            <AddressRow
              title="Merkado offer contract"
              copyLabel="offer contract"
              value={book.cryptoConfig?.offerNftContract ?? ""}
              tip={
                isMerkadoConfigured()
                  ? "The deployed Merkado Rent Offer contract. Mint and purchases happen here."
                  : "Not deployed or configured yet. Set NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS to activate live flows."
              }
            />
          </div>
        </CardContent>
      </Card>

      <PayNetworkControl
        networkKey={book.cryptoConfig?.networkKey ?? ""}
        networkLabel={book.cryptoConfig?.networkLabel?.trim() || "Network to be confirmed"}
        isTestnet={isTestnetConfig(book.cryptoConfig)}
        allowMainnet={mainnetSelectionAllowed()}
      />

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Reset the book</p>
          <p className="text-sm text-muted-foreground">
            Restores the seeded offers, payments, and positions. Keeps the
            selected test network.
          </p>
        </div>
        <ResetDemoButton />
      </div>
    </div>
  );
}

function AddressRow({
  title,
  copyLabel,
  value,
  tip,
}: {
  title: string;
  copyLabel: string;
  value: string;
  tip: string;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1 font-medium">
        {title}
        <HelpTip label={title}>{tip}</HelpTip>
      </p>
      <CopyValue value={value} label={copyLabel} truncate />
    </div>
  );
}
