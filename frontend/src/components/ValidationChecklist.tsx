import { AlertTriangle, ShieldCheck } from 'lucide-react'
import type { ScanResult } from '../api'

interface ValidationChecklistProps {
  result: ScanResult | null
  mode?: 'phase2' | 'full'
}

export function ValidationChecklist({ result, mode = 'full' }: ValidationChecklistProps) {
  if (!result) return null

  const isPhase2 = mode === 'phase2' || result.phase === '2'

  const checks = [
    { label: 'PAN Format', value: result.validations.pan_format, show: result.validations.pan_format != null },
    { label: 'Verhoeff / Aadhaar', value: result.validations.verhoeff, show: result.validations.verhoeff != null },
    { label: 'MRZ Valid', value: result.validations.mrz_valid, show: result.validations.mrz_valid != null },
    { label: 'Face Verified', value: result.biometrics.verified, show: !isPhase2 && result.biometrics.verified != null },
    { label: 'Liveness Passed', value: result.biometrics.liveness_passed, show: !isPhase2 && result.biometrics.liveness_passed != null },
  ].filter((c) => c.show)

  const pMrz = result.penalties.P_mrz
  const hasFailures = checks.some((c) => c.value === false)

  return (
    <div className="rounded-xl border border-amber-500/30 bg-slate-800/50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-amber-400" />
          <h2 className="text-lg font-semibold text-white">Validation Checklist</h2>
        </div>
        {isPhase2 && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
            Phase 2 — Rules
          </span>
        )}
      </div>

      <div className="space-y-2">
        {checks.length === 0 && (
          <p className="text-sm text-slate-400">
            No document rules matched. Upload a PAN, Aadhaar, or passport image.
          </p>
        )}
        {checks.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between rounded-lg bg-slate-900/50 px-3 py-2">
            <span className="text-sm text-slate-300">{label}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                value ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
              }`}
            >
              {value ? 'PASS' : 'FAIL'}
            </span>
          </div>
        ))}
      </div>

      {(isPhase2 || pMrz > 0) && (
        <div className="mt-4 rounded-lg bg-slate-900/50 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Rule penalty (P_mrz)</span>
            <span className={`font-mono font-medium ${pMrz > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {pMrz.toFixed(2)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700">
            <div
              className={`h-full transition-all ${pMrz >= 0.8 ? 'bg-red-500' : pMrz > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, pMrz * 100)}%` }}
            />
          </div>
          {hasFailures && (
            <p className="mt-2 text-xs text-red-300/80">
              Validation failures detected — risk contribution up to +{(pMrz * 35).toFixed(0)} points.
            </p>
          )}
        </div>
      )}

      {result.extracted.pan_number && (
        <div className="mt-4 rounded-lg bg-slate-900/50 p-3 text-left text-sm">
          <p className="text-slate-400">Extracted PAN</p>
          <p className="font-mono text-cyan-400">{result.extracted.pan_number}</p>
          {result.extracted.aadhaar_number && (
            <>
              <p className="mt-2 text-slate-400">Aadhaar</p>
              <p className="font-mono text-cyan-400">{result.extracted.aadhaar_number}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface FraudAlertProps {
  result: ScanResult | null
}

export function FraudAlert({ result }: FraudAlertProps) {
  if (!result?.graph.fraud_loop_detected) return null

  return (
    <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-6">
      <div className="mb-2 flex items-center gap-2 text-red-400">
        <AlertTriangle className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Fraud Loop Detected</h2>
      </div>
      <p className="text-sm text-red-200/80">
        Same biometric identity linked to multiple documents: {result.graph.matched_alias_docs.join(', ')}
      </p>
    </div>
  )
}
