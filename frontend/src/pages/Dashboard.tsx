import { useEffect, useState } from 'react'
import { FileSearch, Loader2, ScanLine, ScanSearch, Shield, ShieldCheck, Users } from 'lucide-react'
import { getJobStatus, scanDocument, scanFace, scanForensics, scanFull, scanOcr, submitScanJob } from '../api'
import type { ScanResult } from '../api'
import { ElaViewer } from '../components/ElaViewer'
import { ExtractedFieldsCard } from '../components/ExtractedFieldsCard'
import { FaceMatchCard } from '../components/FaceMatchCard'
import { FraudAlert } from '../components/ValidationChecklist'
import { RiskGauge } from '../components/RiskGauge'
import { ValidationChecklist } from '../components/ValidationChecklist'
import { UploadPanel, WebcamCapture } from '../components/UploadPanel'

const STEPS = ['OCR', 'Validate', 'ELA', 'Face', 'Graph', 'Score']

export function Dashboard() {
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [documentPreview, setDocumentPreview] = useState<string | null>(null)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [ocrResult, setOcrResult] = useState<ScanResult | null>(null)
  const [validationResult, setValidationResult] = useState<ScanResult | null>(null)
  const [forensicsResult, setForensicsResult] = useState<ScanResult | null>(null)
  const [faceResult, setFaceResult] = useState<ScanResult | null>(null)
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [validationLoading, setValidationLoading] = useState(false)
  const [forensicsLoading, setForensicsLoading] = useState(false)
  const [faceLoading, setFaceLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [step, setStep] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [useAsync, setUseAsync] = useState(false)

  useEffect(() => {
    if (!documentFile) {
      setDocumentPreview(null)
      return
    }
    const url = URL.createObjectURL(documentFile)
    setDocumentPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [documentFile])

  useEffect(() => {
    if (!selfieFile) {
      setSelfiePreview(null)
      return
    }
    const url = URL.createObjectURL(selfieFile)
    setSelfiePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [selfieFile])

  const pollJob = async (jobId: string) => {
    while (true) {
      const status = await getJobStatus(jobId)
      setProgress(status.progress)
      setStep(status.step)
      if (status.status === 'completed' && status.result) {
        setResult(status.result)
        return
      }
      if (status.status === 'failed') {
        throw new Error(status.error || 'Scan failed')
      }
      await new Promise((r) => setTimeout(r, 800))
    }
  }

  const handleOcrScan = async () => {
    if (!documentFile) {
      setError('Please upload a document first.')
      return
    }
    setOcrLoading(true)
    setError(null)
    setOcrResult(null)
    try {
      setOcrResult(await scanOcr(documentFile))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR scan failed')
    } finally {
      setOcrLoading(false)
    }
  }

  const handleValidationScan = async () => {
    if (!documentFile) {
      setError('Please upload a document first.')
      return
    }
    setValidationLoading(true)
    setError(null)
    setValidationResult(null)
    try {
      setValidationResult(await scanDocument(documentFile))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation scan failed')
    } finally {
      setValidationLoading(false)
    }
  }

  const handleForensicsScan = async () => {
    if (!documentFile) {
      setError('Please upload a document first.')
      return
    }
    setForensicsLoading(true)
    setError(null)
    setForensicsResult(null)
    try {
      setForensicsResult(await scanForensics(documentFile))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Forensics scan failed')
    } finally {
      setForensicsLoading(false)
    }
  }

  const handleFaceScan = async () => {
    if (!documentFile) {
      setError('Please upload a document first.')
      return
    }
    if (!selfieFile) {
      setError('Please capture a selfie first — Phase 4 requires document + live selfie.')
      return
    }
    setFaceLoading(true)
    setError(null)
    setFaceResult(null)
    try {
      setFaceResult(await scanFace(documentFile, selfieFile))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Face match failed')
    } finally {
      setFaceLoading(false)
    }
  }

  const handleFullScan = async () => {
    if (!documentFile) {
      setError('Please upload a document first.')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    setProgress(0)
    setStep('Queued')

    try {
      if (useAsync) {
        const response = await submitScanJob(documentFile, selfieFile ?? undefined)
        if ('job_id' in response) {
          await pollJob(response.job_id)
        } else {
          setResult(response)
        }
      } else {
        setResult(await scanFull(documentFile, selfieFile ?? undefined))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setLoading(false)
    }
  }

  const busy = loading || ocrLoading || validationLoading || forensicsLoading || faceLoading

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex items-center gap-3">
          <Shield className="h-10 w-10 text-cyan-400" />
          <div>
            <h1 className="text-2xl font-bold text-white md:text-3xl">Identity Screening System</h1>
            <p className="text-sm text-slate-400">SIH 2026 — Phase 4: Face Match (ArcFace Biometrics)</p>
          </div>
        </header>

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <UploadPanel documentFile={documentFile} onDocumentSelect={setDocumentFile} disabled={busy} />
          <WebcamCapture selfieFile={selfieFile} onCapture={setSelfieFile} disabled={busy} />
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleOcrScan}
            disabled={busy || !documentFile}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-50"
          >
            {ocrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
            Phase 1 — OCR
          </button>
          <button
            type="button"
            onClick={handleValidationScan}
            disabled={busy || !documentFile}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {validationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Phase 2 — Validate
          </button>
          <button
            type="button"
            onClick={handleForensicsScan}
            disabled={busy || !documentFile}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {forensicsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
            {forensicsLoading ? 'Analyzing…' : 'Phase 3 — Forensics'}
          </button>
          <button
            type="button"
            onClick={handleFaceScan}
            disabled={busy || !documentFile || !selfieFile}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {faceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            {faceLoading ? 'Matching…' : 'Phase 4 — Face Match'}
          </button>
          <button
            type="button"
            onClick={handleFullScan}
            disabled={busy || !documentFile}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            Full Scan
          </button>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input type="checkbox" checked={useAsync} onChange={(e) => setUseAsync(e.target.checked)} className="rounded" />
            Async (Phase 8)
          </label>
        </div>

        {loading && (
          <div className="mb-6 rounded-xl border border-slate-700 bg-slate-800/50 p-4">
            <div className="mb-2 flex justify-between text-sm text-slate-300">
              <span>{step || 'Processing…'}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div className="h-full bg-cyan-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {STEPS.map((s) => (
                <span key={s} className={`rounded px-2 py-0.5 text-xs ${step.includes(s) ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700 text-slate-500'}`}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-red-300">{error}</div>
        )}

        {ocrResult && (
          <div className="mb-6">
            <ExtractedFieldsCard result={ocrResult} />
          </div>
        )}

        {validationResult && (
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ExtractedFieldsCard result={validationResult} />
            <ValidationChecklist result={validationResult} mode="phase2" />
          </div>
        )}

        {forensicsResult && (
          <div className="mb-6 space-y-6">
            <ElaViewer documentPreview={documentPreview} result={forensicsResult} phase="3" />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ExtractedFieldsCard result={forensicsResult} />
              </div>
              <div className="space-y-6">
                <ValidationChecklist result={forensicsResult} mode="phase2" />
                <RiskGauge result={forensicsResult} />
              </div>
            </div>
          </div>
        )}

        {faceResult && (
          <div className="mb-6 space-y-6">
            <FaceMatchCard result={faceResult} selfiePreview={selfiePreview} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <ElaViewer documentPreview={documentPreview} result={faceResult} />
                <ValidationChecklist result={faceResult} mode="full" />
              </div>
              <RiskGauge result={faceResult} />
            </div>
          </div>
        )}

        <FraudAlert result={result} />

        {!forensicsResult && !faceResult && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <ElaViewer documentPreview={documentPreview} result={result} />
            </div>
            <div className="space-y-6">
              <RiskGauge result={result ?? validationResult} />
              {!validationResult && <ValidationChecklist result={result} mode="full" />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
