"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency, formatOriginalPriceLabel } from "@/lib/format";
import type { XcgPricePoint } from "@/lib/domain/xcg-price-series";

function provenanceLabel(point: XcgPricePoint): string {
  if (point.xcgProvenance === "source_official_conversion") {
    return "Source-official XCG";
  }
  if (point.conversionProvider === "ecb_eur_usd_xcg_peg") {
    return "Merkado ECB benchmark";
  }
  return "Merkado benchmark";
}

export function PriceHistoryChart({
  data,
}: {
  data: XcgPricePoint[];
}) {
  if (!data.length) return null;
  return (
    <div
      className="h-[220px] w-full min-w-0 overflow-hidden sm:h-[260px]"
      role="img"
      aria-label="Asking price history in XCG"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            width={40}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) =>
              Intl.NumberFormat("en", { notation: "compact" }).format(value)
            }
          />
          <Tooltip
            formatter={(value, _name, item) => {
              const point = item?.payload as XcgPricePoint | undefined;
              const xcg = formatCurrency(Number(value), "XCG");
              if (!point) return xcg;
              const original = formatOriginalPriceLabel(
                point.originalAmount,
                point.originalCurrency,
              );
              return [
                `${xcg} · ${original} · ${provenanceLabel(point)}`,
                "Asking (XCG)",
              ];
            }}
            contentStyle={{
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              fontSize: "12px",
              boxShadow: "0 4px 12px rgb(0 0 0 / 0.08)",
            }}
          />
          <Line
            type="stepAfter"
            dataKey="priceXcg"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--chart-1)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
