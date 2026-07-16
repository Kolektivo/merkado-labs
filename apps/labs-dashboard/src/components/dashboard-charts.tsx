"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tooltipStyle = {
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: "12px",
  boxShadow: "0 4px 12px rgb(0 0 0 / 0.08)",
};

const tick = { fontSize: 11, fill: "var(--muted-foreground)" };

export function NeighbourhoodChart({
  data,
}: {
  data: { name: string; count: number }[];
}) {
  return (
    <div
      className="relative min-h-[240px] w-full min-w-0 flex-1 overflow-hidden sm:min-h-[280px]"
      role="img"
      aria-label="Bar chart of listings by neighbourhood"
    >
      <div className="absolute inset-0 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 0, right: 8 }}
          >
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={tick}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={88}
              tick={tick}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: "var(--muted)" }}
            />
            <Bar dataKey="count" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function PriceDistributionChart({
  data,
  ariaLabel = "Histogram of positive XCG listing prices",
}: {
  data: { label: string; count: number }[];
  ariaLabel?: string;
}) {
  return (
    <div
      className="relative min-h-[240px] w-full min-w-0 flex-1 overflow-hidden sm:min-h-[280px]"
      role="img"
      aria-label={ariaLabel}
    >
      <div className="absolute inset-0 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ left: -8, right: 4, top: 4, bottom: 4 }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={tick}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={12}
            />
            <YAxis
              allowDecimals={false}
              tick={tick}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: "var(--muted)" }}
            />
            <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
