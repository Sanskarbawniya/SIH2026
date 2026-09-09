import { MonitorOff, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { ScanResult } from '../api'

interface LivenessCardProps {
  result: ScanResult
  selfiePreview: string | null
}

export function LivenessCard({ result, selfiePreview }: LivenessCardProps) {
  const bio = result.biometrics
  if (bio.liveness_passed == null) return null

  const passed = bio.liveness_passed
  const score = bio.liveness_score ?? 0
  const method = bio.liveness_method ?? 'unknown'

  return (
    <div
      className={`rounded-xl border p-6 ${
        passed ? 'border-teal-500/40 bg-teal-950/20' : 'border-orange-500/50 bg-orange-500/10'
      }`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {passed ? (
            <ShieldCheck className="h-5 w-5 text-teal-400" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-orange-400" />
          )}
          <h2 className="text-lg font-semibold text-white">Liveness / Anti-Spoofing</h2>
        </div>
        <span className="rounded-full bg-teal-500/20 px-2 py-0.5 text-xs font-medium text-teal-300">
          Phase 7 — Pre-verify gate
        </span>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Selfie analyzed</p>
          <div className="aspect-square max-w-[200px] overflow-hidden rounded-lg bg-slate-900">
            {selfiePreview ? (
              <img src={selfiePreview} alt="Selfie" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">No preview</div>
            )}
          </div>
        </div>
        <div className="space-y-3">
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              passed ? 'bg-teal-500/10 text-teal-200' : 'bg-orange-500/10 text-orange-200'
            }`}
          >
            {passed ? (
              <p>Live face detected — proceeding to ArcFace verification.</p>
            ) : (
              <p>
                <MonitorOff className="mr-1 inline h-4 w-4" />
                Spoof attack detected — face match skipped, <strong>P_face = 1.0</strong>.
              </p>
            )}
          </div>
          {!passed && bio.spoof_reason && (
            <p className="text-sm text-orange-300/90">Reason: {bio.spoof_reason}</p>
          )}
          <div className="rounded-lg bg-slate-900/60 p-3 text-sm">
            <div className="mb-2 flex justify-between">
              <span className="text-slate-400">Liveness score</span>
              <span className={`font-mono ${passed ? 'text-teal-400' : 'text-orange-400'}`}>
                {score.toFixed(2)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div
                className={`h-full transition-all ${passed ? 'bg-teal-500' : 'bg-orange-500'}`}
                style={{ width: `${Math.min(100, score * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">Method: {method}</p>
            {bio.liveness_inference_ms != null && (
              <p className="text-xs text-slate-500">
                Inference: {bio.liveness_inference_ms.toFixed(0)} ms
              </p>
            )}
          </div>
        </div>
      </div>

      {!passed && (
        <p className="text-xs text-slate-400">
          Demo tip: hold a printed photo or phone screen to the camera → fail. Use live webcam with good lighting → pass.
          Face match still runs below for inspection even when liveness fails.
        </p>
      )}
    </div>
  )
}
