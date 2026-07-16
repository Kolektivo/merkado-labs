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

import { formatCurrency } from "@/lib/format";

export function PriceHistoryChart({
  data,
}: {
  data: { date: string; price: number; currency: string }[];
}) {
  if (!data.length) return null;
  const currency = data[0].currency;
  return (
    <div
      className="h-[220px] w-full min-w-0 overflow-hidden sm:h-[260px]"
      role="img"
      aria-label={`Price history in ${currency}`}
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
            formatter={(value) => formatCurrency(Number(value), currency)}
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
            dataKey="price"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--chart-1)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
