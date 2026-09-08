import { UserCheck, UserX } from 'lucide-react'
import type { ScanResult } from '../api'

interface FaceMatchCardProps {
  result: ScanResult | null
  selfiePreview: string | null
}

export function FaceMatchCard({ result, selfiePreview }: FaceMatchCardProps) {
  if (!result) return null

  const bio = result.biometrics
  if (bio.verified == null && !bio.id_face_url) return null

  const verified = bio.verified === true
  const pFace = result.penalties.P_face ?? 0
  const threshold = bio.threshold ?? 0.4
  const distance = bio.distance

  return (
    <div className="rounded-xl border border-sky-500/40 bg-slate-800/50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {verified ? (
            <UserCheck className="h-5 w-5 text-emerald-400" />
          ) : (
            <UserX className="h-5 w-5 text-red-400" />
          )}
          <h2 className="text-lg font-semibold text-white">Face Match (ArcFace)</h2>
        </div>
        <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs font-medium text-sky-300">
          Phase 4 — Biometrics
        </span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">ID Photo Crop</p>
          <div className="aspect-square overflow-hidden rounded-lg bg-slate-900">
            {bio.id_face_url ? (
              <img src={bio.id_face_url} alt="ID face crop" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">No crop</div>
            )}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Live Selfie</p>
          <div className="aspect-square overflow-hidden rounded-lg bg-slate-900">
            {selfiePreview ? (
              <img src={selfiePreview} alt="Selfie" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">No selfie</div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-center">
        <span
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            verified ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          }`}
        >
          {verified ? 'MATCH — Same person' : 'MISMATCH — Different person'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-900/60 p-4 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">Cosine distance</p>
          <p className="font-mono text-cyan-400">{distance != null ? distance.toFixed(4) : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Threshold</p>
          <p className="font-mono text-slate-300">{threshold.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">P_face penalty</p>
          <p className={`font-mono ${pFace > 0.5 ? 'text-red-400' : 'text-emerald-400'}`}>{pFace.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Risk contribution</p>
          <p className="font-mono text-slate-300">+{(pFace * 25).toFixed(1)}</p>
        </div>
      </div>

      {bio.face_inference_ms != null && (
        <p className="mt-3 text-xs text-slate-400">
          Face inference: <span className="font-mono text-cyan-400">{bio.face_inference_ms.toFixed(0)} ms</span>
        </p>
      )}

      {!verified && (
        <p className="mt-3 text-xs text-red-300/80">
          Selfie does not match the photo on the document — identity verification failed.
        </p>
      )}
    </div>
  )
}
