import { useEffect, useRef, useState } from 'react'
import { FileSearch, Gauge, GitBranch, Loader2, ScanSearch, Shield, ShieldCheck, Sparkles, Users } from 'lucide-react'
import {
  getGraphAlerts,
  getGraphStats,
  getJobStatus,
  isScanResult,
  resetGraph,
  scanDocument,
  scanFace,
  scanForensics,
  scanFull,
  scanGraph,
  scanLiveness,
  scanOcr,
  submitScanJob,
} from '../api'
import type { GraphAlert, GraphStats, ScanResult } from '../api'
import { ElaViewer } from '../components/ElaViewer'
import { ExtractedFieldsCard } from '../components/ExtractedFieldsCard'
import { FaceMatchCard } from '../components/FaceMatchCard'
import { GraphFraudPanel } from '../components/GraphFraudPanel'
import { LivenessCard } from '../components/LivenessCard'
import { RiskGauge } from '../components/RiskGauge'
import { UnifiedScanPanel } from '../components/UnifiedScanPanel'
import { ValidationChecklist } from '../components/ValidationChecklist'
import { UploadPanel, WebcamCapture } from '../components/UploadPanel'

const STEPS = ['OCR', 'Validate', 'ELA', 'Face', 'Graph', 'Score']
const PROGRESS_STEPS = [
  { progress: 12, step: 'OCR' },
  { progress: 28, step: 'Validate' },
  { progress: 45, step: 'ELA' },
  { progress: 62, step: 'Face' },
  { progress: 80, step: 'Graph' },
  { progress: 95, step: 'Score' },
]

export function Dashboard() {
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [documentPreview, setDocumentPreview] = useState<string | null>(null)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [ocrResult, setOcrResult] = useState<ScanResult | null>(null)
  const [validationResult, setValidationResult] = useState<ScanResult | null>(null)
  const [forensicsResult, setForensicsResult] = useState<ScanResult | null>(null)
  const [faceResult, setFaceResult] = useState<ScanResult | null>(null)
  const [graphResult, setGraphResult] = useState<ScanResult | null>(null)
  const [livenessResult, setLivenessResult] = useState<ScanResult | null>(null)
  const [graphStats, setGraphStats] = useState<GraphStats | null>(null)
  const [graphAlerts, setGraphAlerts] = useState<GraphAlert[]>([])
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [validationLoading, setValidationLoading] = useState(false)
  const [forensicsLoading, setForensicsLoading] = useState(false)
  const [faceLoading, setFaceLoading] = useState(false)
  const [graphLoading, setGraphLoading] = useState(false)
  const [livenessLoading, setLivenessLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [step, setStep] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [useAsync, setUseAsync] = useState(false)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)

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

  useEffect(() => {
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current)
    }
  }, [])

  const clearPhaseResults = () => {
    setOcrResult(null)
    setValidationResult(null)
    setForensicsResult(null)
    setFaceResult(null)
    setGraphResult(null)
    setLivenessResult(null)
  }

  const refreshGraphMeta = async () => {
    try {
      const [stats, alertsRes] = await Promise.all([getGraphStats(), getGraphAlerts()])
      setGraphStats(stats)
      setGraphAlerts(alertsRes.alerts)
    } catch {
      /* graph meta is optional */
    }
  }

  const startProgressSimulation = (includeFace: boolean) => {
    if (progressTimer.current) clearInterval(progressTimer.current)
    const steps = includeFace ? PROGRESS_STEPS : PROGRESS_STEPS.filter((s) => s.step !== 'Face')
    let index = 0
    setProgress(steps[0].progress)
    setStep(steps[0].step)
    progressTimer.current = setInterval(() => {
      index += 1
      if (index >= steps.length) return
      setProgress(steps[index].progress)
      setStep(steps[index].step)
    }, 4000)
  }

  const stopProgressSimulation = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current)
      progressTimer.current = null
    }
  }

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
    setResult(null)
    clearPhaseResults()
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
    setResult(null)
    clearPhaseResults()
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
    setResult(null)
    clearPhaseResults()
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
    setResult(null)
    clearPhaseResults()
    try {
      setFaceResult(await scanFace(documentFile, selfieFile))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Face match failed')
    } finally {
      setFaceLoading(false)
    }
  }

  const handleGraphScan = async () => {
    if (!documentFile) {
      setError('Please upload a document first.')
      return
    }
    if (!selfieFile) {
      setError('Phase 6 requires document + selfie to build the identity graph.')
      return
    }
    setGraphLoading(true)
    setError(null)
    setResult(null)
    clearPhaseResults()
    try {
      const scanResponse = await scanGraph(documentFile, selfieFile)
      setGraphResult(scanResponse)
      await refreshGraphMeta()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Graph scan failed')
    } finally {
      setGraphLoading(false)
    }
  }

  const handleLivenessScan = async () => {
    if (!documentFile) {
      setError('Please upload a document first.')
      return
    }
    if (!selfieFile) {
      setError('Phase 7 requires a selfie — use live webcam, not a photo of a photo.')
      return
    }
    setLivenessLoading(true)
    setError(null)
    setResult(null)
    clearPhaseResults()
    try {
      setLivenessResult(await scanLiveness(documentFile, selfieFile))
      await refreshGraphMeta()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Liveness scan failed')
    } finally {
      setLivenessLoading(false)
    }
  }

  const handleResetGraph = async () => {
    try {
      await resetGraph()
      setGraphStats(null)
      setGraphAlerts([])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset graph')
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
    clearPhaseResults()
    setProgress(5)
    setStep('Queued')
    startProgressSimulation(Boolean(selfieFile))

    try {
      if (useAsync) {
        const response = await submitScanJob(documentFile, selfieFile ?? undefined)
        if ('job_id' in response) {
          await pollJob(response.job_id)
        } else if (isScanResult(response)) {
          setResult(response)
        }
      } else {
        const scanResponse = await scanFull(documentFile, selfieFile ?? undefined, false)
        setResult(scanResponse)
        setProgress(100)
        setStep('Score')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      stopProgressSimulation()
      setLoading(false)
    }
  }

  const busy =
    loading || ocrLoading || validationLoading || forensicsLoading || faceLoading || graphLoading || livenessLoading
  const showPhasePanels =
    !result &&
    !graphResult &&
    !livenessResult &&
    (ocrResult || validationResult || forensicsResult || faceResult)

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex items-center gap-3">
          <Shield className="h-10 w-10 text-cyan-400" />
          <div>
            <h1 className="text-2xl font-bold text-white md:text-3xl">Identity Screening System</h1>
            <p className="text-sm text-slate-400">
              SIH 2026 — Phase 7: Liveness + Identity Graph (Phases 6–7)
            </p>
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
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
            {loading ? 'Scoring…' : 'Phase 5 — Full Scan'}
          </button>
          <button
            type="button"
            onClick={handleGraphScan}
            disabled={busy || !documentFile || !selfieFile}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50"
            title="Scan Person A + Doc 1, then Person A + Doc 2 to trigger fraud loop"
          >
            {graphLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitBranch className="h-4 w-4" />}
            {graphLoading ? 'Graph scan…' : 'Phase 6 — Graph Scan'}
          </button>
          <button
            type="button"
            onClick={handleLivenessScan}
            disabled={busy || !documentFile || !selfieFile}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
            title="Live face → pass. Photo on phone screen → fail"
          >
            {livenessLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {livenessLoading ? 'Checking…' : 'Phase 7 — Liveness'}
          </button>
          <button
            type="button"
            onClick={handleResetGraph}
            disabled={busy}
            className="rounded-lg border border-slate-600 px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800 disabled:opacity-50"
          >
            Reset Graph
          </button>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input type="checkbox" checked={useAsync} onChange={(e) => setUseAsync(e.target.checked)} className="rounded" />
            Async queue (Phase 8)
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
                <span
                  key={s}
                  className={`rounded px-2 py-0.5 text-xs ${
                    step.includes(s) ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700 text-slate-500'
                  }`}
                >
                  {s}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Full scan runs all modules sequentially — first run may take 30–90s while ML models load.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-red-300">{error}</div>
        )}

        {result && (
          <div className="mb-6 space-y-6">
            <UnifiedScanPanel result={result} />
            {result.biometrics.verified != null && (
              <FaceMatchCard result={result} selfiePreview={selfiePreview} />
            )}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <ElaViewer documentPreview={documentPreview} result={result} />
                <ExtractedFieldsCard result={result} />
                <ValidationChecklist result={result} mode="full" />
              </div>
              <RiskGauge result={result} phase="5" />
            </div>
          </div>
        )}

        {livenessResult && (
          <div className="mb-6 space-y-6">
            <LivenessCard result={livenessResult} selfiePreview={selfiePreview} />
            {livenessResult.biometrics.liveness_passed && (
              <GraphFraudPanel result={livenessResult} stats={graphStats} alerts={graphAlerts} />
            )}
            {livenessResult.biometrics.liveness_passed && livenessResult.biometrics.verified != null && (
              <FaceMatchCard result={livenessResult} selfiePreview={selfiePreview} />
            )}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <ElaViewer documentPreview={documentPreview} result={livenessResult} />
                <ExtractedFieldsCard result={livenessResult} />
                <ValidationChecklist result={livenessResult} mode="full" />
              </div>
              <RiskGauge result={livenessResult} phase="6" />
            </div>
          </div>
        )}

        {graphResult && (
          <div className="mb-6 space-y-6">
            <UnifiedScanPanel result={graphResult} phase="6" />
            <GraphFraudPanel result={graphResult} stats={graphStats} alerts={graphAlerts} />
            {graphResult.biometrics.verified != null && (
              <FaceMatchCard result={graphResult} selfiePreview={selfiePreview} />
            )}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <ElaViewer documentPreview={documentPreview} result={graphResult} />
                <ExtractedFieldsCard result={graphResult} />
                <ValidationChecklist result={graphResult} mode="full" />
              </div>
              <RiskGauge result={graphResult} phase="6" />
            </div>
          </div>
        )}

        {showPhasePanels && ocrResult && (
          <div className="mb-6">
            <ExtractedFieldsCard result={ocrResult} />
          </div>
        )}

        {showPhasePanels && validationResult && (
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ExtractedFieldsCard result={validationResult} />
            <ValidationChecklist result={validationResult} mode="phase2" />
          </div>
        )}

        {showPhasePanels && forensicsResult && (
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

        {showPhasePanels && faceResult && (
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
      </div>
    </div>
  )
}
