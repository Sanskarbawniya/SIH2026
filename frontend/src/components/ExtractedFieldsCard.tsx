import type { ScanResult } from '../api'

interface ExtractedFieldsCardProps {
  result: ScanResult | null
}

const FIELDS: Array<{ key: keyof ScanResult['extracted']; label: string }> = [
  { key: 'pan_number', label: 'PAN Number' },
  { key: 'aadhaar_number', label: 'Aadhaar Number' },
  { key: 'passport_number', label: 'Passport Number' },
  { key: 'name', label: 'Name' },
  { key: 'dob', label: 'Date of Birth' },
]

export function ExtractedFieldsCard({ result }: ExtractedFieldsCardProps) {
  if (!result?.extracted) return null

  const { extracted } = result
  const hasAnyField = FIELDS.some(({ key }) => extracted[key])

  const phaseLabel =
    result.phase === '3' ? 'Phase 3 — OCR + Rules + ELA' :
    result.phase === '2' ? 'Phase 2 — OCR + Rules' :
    'Phase 1 — OCR'

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-slate-800/50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Extracted Fields</h2>
        <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs font-medium text-cyan-400">
          {phaseLabel}
        </span>
      </div>

      {result.inference_ms != null && (
        <p className="mb-4 text-xs text-slate-400">
          OCR completed in <span className="font-mono text-cyan-400">{result.inference_ms.toFixed(0)} ms</span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="rounded-lg bg-slate-900/60 px-3 py-2 text-left">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="font-mono text-sm text-slate-200">{extracted[key] || '—'}</p>
          </div>
        ))}
      </div>

      {!hasAnyField && (
        <p className="mt-3 text-sm text-amber-400/90">
          No structured fields detected. Try a clearer PAN image with English text.
        </p>
      )}

      {extracted.preprocessed_url && (
        <div className="mt-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Preprocessed (CLAHE + Deskew)</p>
          <img
            src={extracted.preprocessed_url}
            alt="Preprocessed document"
            className="max-h-40 rounded-lg border border-slate-700 object-contain"
          />
        </div>
      )}

      {extracted.raw_text && (
        <div className="mt-4 text-left">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Raw OCR Text</p>
          <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900/60 p-3 text-xs text-slate-400">
            {extracted.raw_text}
          </pre>
        </div>
      )}
    </div>
  )
}
