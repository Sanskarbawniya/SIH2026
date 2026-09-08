import { ScanSearch } from 'lucide-react'
import type { ScanResult } from '../api'

interface ElaViewerProps {
  documentPreview: string | null
  result: ScanResult | null
  phase?: '3' | 'full'
}

function tamperingBand(pEla: number): { label: string; color: string } {
  if (pEla <= 0.15) return { label: 'CLEAN', color: 'text-emerald-400' }
  if (pEla <= 0.4) return { label: 'SUSPICIOUS', color: 'text-amber-400' }
  return { label: 'TAMPERED', color: 'text-red-400' }
}

export function ElaViewer({ documentPreview, result, phase }: ElaViewerProps) {
  const elaUrl = result?.forensics.ela_url
  const isPhase3 = phase === '3' || result?.phase === '3'
  const pEla = result?.penalties.P_ela ?? 0
  const band = tamperingBand(pEla)

  return (
    <div className={`rounded-xl bg-slate-800/50 p-6 ${isPhase3 ? 'border border-violet-500/40' : 'border border-slate-700'}`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">X-Ray Forensics (ELA)</h2>
        {isPhase3 && (
          <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs font-medium text-violet-300">
            Phase 3 — Forensics
          </span>
        )}
      </div>

      <p className="mb-4 text-xs text-slate-400">
        Error Level Analysis highlights regions re-compressed at different quality — common sign of digital edits.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Original</p>
          <div className="aspect-[4/3] overflow-hidden rounded-lg bg-slate-900">
            {documentPreview ? (
              <img src={documentPreview} alt="Document" className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-500">No document</div>
            )}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">ELA Heatmap</p>
          <div className="aspect-[4/3] overflow-hidden rounded-lg bg-slate-900">
            {elaUrl ? (
              <img src={elaUrl} alt="ELA heatmap" className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-500">Run Phase 3 to generate ELA</div>
            )}
          </div>
        </div>
      </div>

      {result?.forensics.anomaly_score != null && (
        <div className="mt-4 rounded-lg bg-slate-900/60 p-4">
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">Anomaly score</p>
              <p className="font-mono text-cyan-400">{result.forensics.anomaly_score.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">P_ela penalty</p>
              <p className="font-mono text-amber-400">{pEla.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Tampering band</p>
              <p className={`font-semibold ${band.color}`}>{band.label}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Risk contribution</p>
              <p className="font-mono text-slate-300">+{(pEla * 25).toFixed(1)}</p>
            </div>
          </div>
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>Tampering signal</span>
              <span>{Math.round(pEla * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div
                className={`h-full transition-all ${pEla > 0.4 ? 'bg-red-500' : pEla > 0.15 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(100, pEla * 100)}%` }}
              />
            </div>
          </div>
          {pEla > 0.4 && (
            <p className="mt-2 flex items-center gap-1 text-xs text-red-300/90">
              <ScanSearch className="h-3 w-3" />
              Bright patches in the heatmap may indicate edited text or spliced regions.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
