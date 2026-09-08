import { Gauge, Info } from 'lucide-react'
import type { ScanResult } from '../api'
import { RiskGauge } from './RiskGauge'

interface UnifiedScanPanelProps {
  result: ScanResult
  phase?: '5' | '6'
}

const BAND_HELP: Record<string, string> = {
  LOW: 'Document checks and biometrics look acceptable — proceed with standard verification.',
  MEDIUM: 'Some modules flagged issues — manual review recommended.',
  HIGH: 'Multiple high-risk signals — reject or escalate immediately.',
}

export function UnifiedScanPanel({ result, phase = '5' }: UnifiedScanPanelProps) {
  const isPhase6 = phase === '6' || result.phase === '6'
  const band = result.risk.band
  const bandColor =
    band === 'LOW' ? 'text-emerald-400' : band === 'MEDIUM' ? 'text-amber-400' : 'text-red-400'

  const penaltyRows = [
    ['P_mrz — document rules', result.penalties.P_mrz, '35'],
    ['P_ela — tampering', result.penalties.P_ela, '25'],
    ['P_face — biometrics', result.penalties.P_face, '25'],
    ...(isPhase6 ? [['P_graph — fraud loop', result.penalties.P_graph, '15'] as const] : []),
  ]

  return (
    <div className="rounded-xl border border-cyan-500/40 bg-gradient-to-br from-cyan-950/40 to-slate-900/60 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">Unified Risk Assessment</h2>
        </div>
        <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs font-medium text-cyan-300">
          {isPhase6 ? 'Phase 6 — Graph + Score' : 'Phase 5 — End-to-End Score'}
        </span>
      </div>

      <p className="mb-4 text-sm text-slate-400">
        {isPhase6 ? (
          <>
            Full formula:{' '}
            <span className="font-mono text-slate-300">
              R = 35×P_mrz + 25×P_ela + 25×P_face + 15×P_graph
            </span>
          </>
        ) : (
          <>
            Combines OCR validation, ELA forensics, and face match{' '}
            <span className="font-mono text-slate-300">R = 35×P_mrz + 25×P_ela + 25×P_face</span>
          </>
        )}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RiskGauge result={result} phase={isPhase6 ? '6' : '5'} />

        <div className="space-y-4">
          <div className="rounded-lg bg-slate-900/60 p-4">
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Risk band</p>
            <p className={`text-2xl font-bold ${bandColor}`}>{band}</p>
            <p className="mt-2 text-sm text-slate-400">{BAND_HELP[band]}</p>
          </div>

          <div className="rounded-lg bg-slate-900/60 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm text-slate-300">
              <Info className="h-4 w-4 text-cyan-400" />
              Raw penalties (0–1)
            </div>
            <div className="space-y-2 text-sm">
              {penaltyRows.map(([label, value, weight]) => (
                <div key={label as string} className="flex items-center justify-between">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-mono text-slate-200">
                    {(value as number).toFixed(2)}{' '}
                    <span className="text-slate-500">×{weight}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-emerald-500/10 px-2 py-2 text-emerald-400">LOW 0–30</div>
            <div className="rounded-lg bg-amber-500/10 px-2 py-2 text-amber-400">MEDIUM 31–60</div>
            <div className="rounded-lg bg-red-500/10 px-2 py-2 text-red-400">HIGH 61–100</div>
          </div>
        </div>
      </div>
    </div>
  )
}
