import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import type { Meta } from "@/types";
import { Card, Select } from "@/components/ui";

export function ChartsTab({ meta }: { meta: Meta }) {
  const [category, setCategory] = useState(meta.categories[0]);
  const unit = meta.units[category];

  const { data: categoryCounts } = useQuery({
    queryKey: ["charts", "category-counts"],
    queryFn: api.chartCategoryCounts,
  });
  const { data: stockByItem } = useQuery({
    queryKey: ["charts", "stock-by-item", category],
    queryFn: () => api.chartStockByItem(category),
  });
  const { data: addedOverTime } = useQuery({
    queryKey: ["charts", "added-over-time", category],
    queryFn: () => api.chartAddedOverTime(category),
  });

  const countsData = meta.categories.map((c) => ({
    category: c,
    items: categoryCounts?.[c] ?? 0,
    fill: meta.palette[c],
  }));

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h3 className="mb-3 font-semibold text-neutral-700">📁 Items per category</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={countsData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
            <XAxis dataKey="category" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="items" radius={[8, 8, 0, 0]}>
              {countsData.map((entry) => (
                <Cell key={entry.category} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="max-w-xs">
        <Select
          value={category}
          onValueChange={setCategory}
          options={meta.categories.map((c) => ({ value: c, label: `${meta.icons[c]} ${c}` }))}
        />
      </div>

      <Card className="p-5">
        <h3 className="mb-3 font-semibold text-neutral-700">
          📦 Stock by item — {meta.icons[category]} {category}
        </h3>
        {stockByItem && stockByItem.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(220, stockByItem.length * 38)}>
            <BarChart data={stockByItem} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
              <XAxis type="number" tick={{ fontSize: 12 }} label={{ value: `Quantity (${unit})`, position: "insideBottom", offset: -5, fontSize: 12 }} />
              <YAxis type="category" dataKey="title" tick={{ fontSize: 12 }} width={100} />
              <Tooltip />
              <Bar dataKey="quantity" fill={meta.palette[category]} radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-neutral-400">No {category.toLowerCase()} yet.</p>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 font-semibold text-neutral-700">📈 {category} added over time</h3>
        {addedOverTime && addedOverTime.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={addedOverTime}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} label={{ value: `Quantity (${unit})`, angle: -90, position: "insideLeft", fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="quantity" fill={meta.palette[category]} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-neutral-400">No data yet.</p>
        )}
      </Card>
    </div>
  );
}
