import { AlertTriangle, GitBranch, Link2, RotateCcw, ShieldCheck } from 'lucide-react'
import type { GraphAlert, GraphStats, ScanResult } from '../api'

interface GraphFraudPanelProps {
  result: ScanResult
  stats?: GraphStats | null
  alerts?: GraphAlert[]
}

const STATUS_COPY: Record<
  string,
  { tone: 'red' | 'emerald' | 'amber' | 'sky'; title: string; body: string }
> = {
  fraud_loop: {
    tone: 'red',
    title: 'Fraud loop detected',
    body: 'Same face linked to conflicting or unknown identity documents — possible alias fraud.',
  },
  duplicate_rescan: {
    tone: 'sky',
    title: 'Duplicate rescan',
    body: 'Exact same document and selfie files were scanned before. No new graph penalty applied.',
  },
  same_identity: {
    tone: 'emerald',
    title: 'Same identity document',
    body: 'This face matches a prior scan with the same PAN / Aadhaar / passport number — treated as re-verification, not fraud.',
  },
  linked_profile: {
    tone: 'amber',
    title: 'Linked identity profile',
    body: 'Same person verified across different ID types (e.g. PAN + Aadhaar). Linked in graph — not flagged as fraud.',
  },
  clear: {
    tone: 'emerald',
    title: 'No fraud loop',
    body: 'Face embedding stored in graph for future cross-checks. No suspicious cross-document link found.',
  },
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id
}

export function GraphFraudPanel({ result, stats, alerts }: GraphFraudPanelProps) {
  const graph = result.graph
  const pGraph = result.penalties.P_graph
  const status = graph.graph_status ?? (graph.fraud_loop_detected ? 'fraud_loop' : 'clear')
  const copy = STATUS_COPY[status] ?? STATUS_COPY.clear

  const borderClass =
    copy.tone === 'red'
      ? 'border-red-500/50 bg-red-500/10'
      : copy.tone === 'amber'
        ? 'border-amber-500/40 bg-amber-500/5'
        : copy.tone === 'sky'
          ? 'border-sky-500/40 bg-sky-500/5'
          : 'border-emerald-500/30 bg-emerald-500/5'

  const StatusIcon =
    status === 'fraud_loop'
      ? AlertTriangle
      : status === 'linked_profile'
        ? Link2
        : status === 'duplicate_rescan'
          ? RotateCcw
          : ShieldCheck

  const iconColor =
    copy.tone === 'red'
      ? 'text-red-400'
      : copy.tone === 'amber'
        ? 'text-amber-400'
        : copy.tone === 'sky'
          ? 'text-sky-400'
          : 'text-emerald-400'

  const bannerClass =
    copy.tone === 'red'
      ? 'bg-red-500/10 text-red-200'
      : copy.tone === 'amber'
        ? 'bg-amber-500/10 text-amber-200'
        : copy.tone === 'sky'
          ? 'bg-sky-500/10 text-sky-200'
          : 'bg-emerald-500/10 text-emerald-200'

  return (
    <div className={`rounded-xl border p-6 ${borderClass}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StatusIcon className={`h-5 w-5 ${iconColor}`} />
          <h2 className="text-lg font-semibold text-white">Identity Graph — Fraud Loop</h2>
        </div>
        <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs font-medium text-violet-300">
          Phase 6 — NetworkX
        </span>
      </div>

      <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${bannerClass}`}>
        <p className="font-medium">{copy.title}</p>
        <p className="mt-1 opacity-90">{copy.body}</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-slate-900/60 p-3">
          <p className="text-xs text-slate-500">Status</p>
          <p className="font-mono text-sm text-slate-200">{status}</p>
        </div>
        <div className="rounded-lg bg-slate-900/60 p-3">
          <p className="text-xs text-slate-500">P_graph</p>
          <p className={`font-mono text-lg ${pGraph > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {pGraph.toFixed(2)}
          </p>
        </div>
        <div className="rounded-lg bg-slate-900/60 p-3">
          <p className="text-xs text-slate-500">Risk +graph</p>
          <p className="font-mono text-lg text-slate-200">+{(pGraph * 15).toFixed(1)}</p>
        </div>
        {graph.similarity != null && (
          <div className="rounded-lg bg-slate-900/60 p-3">
            <p className="text-xs text-slate-500">Cosine sim</p>
            <p className="font-mono text-lg text-amber-400">{graph.similarity.toFixed(3)}</p>
          </div>
        )}
      </div>

      {graph.matched_alias_docs.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 flex items-center gap-2 text-sm text-slate-400">
            <GitBranch className="h-4 w-4" />
            {status === 'duplicate_rescan' ? 'Prior scan ID' : 'Related document scan IDs'}
          </p>
          <div className="flex flex-wrap gap-2">
            {graph.matched_alias_docs.map((docId) => (
              <span
                key={docId}
                className="rounded-md bg-slate-900/80 px-2 py-1 font-mono text-xs text-cyan-300"
                title={docId}
              >
                {shortId(docId)}
              </span>
            ))}
          </div>
        </div>
      )}

      {stats && (
        <div className="mb-4 rounded-lg bg-slate-900/50 p-3 text-sm text-slate-400">
          Graph memory: {stats.documents} documents · {stats.faces} face embeddings ·{' '}
          {stats.biometric_links} biometric links · {stats.alerts} fraud alerts
        </div>
      )}

      {alerts && alerts.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Fraud alert history</p>
          <div className="max-h-40 space-y-2 overflow-y-auto">
            {alerts.map((alert, i) => (
              <div key={`${alert.face_id}-${i}`} className="rounded-lg bg-slate-900/60 px-3 py-2 text-xs">
                <span className="text-red-300">Fraud loop</span>
                <span className="text-slate-500"> · sim {(alert.similarity * 100).toFixed(1)}% · </span>
                <span className="font-mono text-slate-400">{alert.docs.map(shortId).join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
