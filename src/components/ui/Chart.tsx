/**
 * Único wrapper de charts (Recharts). Sin lógica de negocio ContAI.
 */

import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { cn } from '../../lib/utils';
import { chartColors } from '../../styles/tokens';

export type ChartSeries = {
  dataKey: string;
  name?: string;
  color?: string;
};

export type ChartProps = {
  type: 'line' | 'bar';
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: ChartSeries[];
  height?: number;
  className?: string;
};

const DEFAULT_COLORS = [
  chartColors.brand,
  chartColors.success,
  chartColors.warning,
  chartColors.danger,
];

export function Chart({
  type,
  data,
  xKey,
  series,
  height = 240,
  className,
}: ChartProps) {
  const ChartImpl = type === 'bar' ? BarChart : LineChart;

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ChartImpl data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={chartColors.border} strokeDasharray="3 3" />
          <XAxis
            dataKey={xKey}
            tick={{ fill: 'currentColor', fontSize: 11 }}
            className="text-ink-muted"
          />
          <YAxis
            tick={{ fill: 'currentColor', fontSize: 11 }}
            className="text-ink-muted font-mono"
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--contai-surface)',
              border: '1px solid var(--contai-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => {
            const color = s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
            if (type === 'bar') {
              return (
                <Bar
                  key={s.dataKey}
                  dataKey={s.dataKey}
                  name={s.name || s.dataKey}
                  fill={color}
                  radius={[4, 4, 0, 0]}
                />
              );
            }
            return (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.name || s.dataKey}
                stroke={color}
                strokeWidth={2}
                dot={false}
              />
            );
          })}
        </ChartImpl>
      </ResponsiveContainer>
    </div>
  );
}
