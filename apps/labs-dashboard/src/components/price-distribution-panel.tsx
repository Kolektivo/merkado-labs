"use client";

import { PriceDistributionChart } from "@/components/dashboard-charts";
import { HelpTip } from "@/components/help-tip";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber } from "@/lib/format";

type Distribution = {
  sampleSize: number;
  buckets: { label: string; count: number }[];
};

export function PriceDistributionPanel({
  sale,
  rent,
}: {
  sale: Distribution;
  rent: Distribution;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Price ranges (XCG)
          <HelpTip label="XCG">
            Caribbean guilder — Curaçao&apos;s local currency. Other currencies
            are left out of this chart so bars stay comparable.
          </HelpTip>
        </CardTitle>
        <CardDescription>
          How sale and rent prices are spread. Switch tabs above the chart.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <Tabs defaultValue="sale" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="w-full shrink-0">
            <TabsTrigger value="sale" className="gap-2">
              For sale
              <Badge variant="secondary">{formatNumber(sale.sampleSize)}</Badge>
            </TabsTrigger>
            <TabsTrigger value="rent" className="gap-2">
              For rent
              <Badge variant="secondary">{formatNumber(rent.sampleSize)}</Badge>
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="sale"
            className="mt-4 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          >
            <PriceDistributionChart
              data={sale.buckets}
              ariaLabel="Histogram of XCG sale prices"
            />
          </TabsContent>
          <TabsContent
            value="rent"
            className="mt-4 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          >
            <PriceDistributionChart
              data={rent.buckets}
              ariaLabel="Histogram of XCG rent prices"
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
