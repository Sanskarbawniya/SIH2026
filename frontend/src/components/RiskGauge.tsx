import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import type { ScanResult } from '../api'

interface RiskGaugeProps {
  result: ScanResult | null
  phase?: '5' | '6' | 'full'
}

const BAND_COLORS = {
  LOW: '#22c55e',
  MEDIUM: '#f59e0b',
  HIGH: '#ef4444',
}

const BREAKDOWN_ITEMS = [
  { key: 'mrz_contribution', label: 'MRZ / Rules', max: 35, color: '#f59e0b' },
  { key: 'ela_contribution', label: 'ELA Forensics', max: 25, color: '#a855f7' },
  { key: 'face_contribution', label: 'Face Match', max: 25, color: '#38bdf8' },
  { key: 'graph_contribution', label: 'Graph Fraud', max: 15, color: '#ef4444' },
] as const

export function RiskGauge({ result, phase }: RiskGaugeProps) {
  const score = result?.risk.score ?? 0
  const band = result?.risk.band ?? 'LOW'
  const color = BAND_COLORS[band]
  const hideGraph = phase === '5'

  const data = [
    { name: 'score', value: score },
    { name: 'remaining', value: 100 - score },
  ]

  const items = BREAKDOWN_ITEMS.filter((item) => !(hideGraph && item.key === 'graph_contribution'))

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6">
      <h2 className="mb-4 text-lg font-semibold text-white">Unified Risk Score</h2>
      <div className="relative mx-auto h-48 w-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              startAngle={180}
              endAngle={0}
              innerRadius={60}
              outerRadius={80}
              dataKey="value"
              stroke="none"
            >
              <Cell fill={color} />
              <Cell fill="#334155" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-8">
          <span className="text-4xl font-bold" style={{ color }}>{score}</span>
          <span className="text-sm font-medium text-slate-400">{band}</span>
        </div>
      </div>
      {result && (
        <div className="mt-4 space-y-3 text-sm">
          {items.map(({ key, label, max, color: barColor }) => {
            const value = result.risk.breakdown[key]
            const pct = max > 0 ? (value / max) * 100 : 0
            return (
              <div key={key}>
                <div className="mb-1 flex justify-between text-slate-300">
                  <span>{label}</span>
                  <span className="font-mono text-slate-400">+{value.toFixed(1)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${Math.min(100, pct)}%`, backgroundColor: barColor }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
