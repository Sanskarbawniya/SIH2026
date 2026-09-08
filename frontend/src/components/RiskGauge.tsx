import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import type { ScanResult } from '../api'

interface RiskGaugeProps {
  result: ScanResult | null
}

const BAND_COLORS = {
  LOW: '#22c55e',
  MEDIUM: '#f59e0b',
  HIGH: '#ef4444',
}

export function RiskGauge({ result }: RiskGaugeProps) {
  const score = result?.risk.score ?? 0
  const band = result?.risk.band ?? 'LOW'
  const color = BAND_COLORS[band]

  const data = [
    { name: 'score', value: score },
    { name: 'remaining', value: 100 - score },
  ]

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
        <div className="mt-4 space-y-2 text-sm">
          {[
            ['MRZ / Rules', result.risk.breakdown.mrz_contribution],
            ['ELA Forensics', result.risk.breakdown.ela_contribution],
            ['Face / Liveness', result.risk.breakdown.face_contribution],
            ['Graph Fraud', result.risk.breakdown.graph_contribution],
          ].map(([label, value]) => (
            <div key={label as string} className="flex justify-between text-slate-300">
              <span>{label}</span>
              <span className="font-mono text-slate-400">+{(value as number).toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
