export interface UploadResponse {
  id: string
  filename: string
}

export interface ScanResult {
  scan_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  extracted: {
    raw_text: string
    pan_number: string | null
    aadhaar_number: string | null
    passport_number: string | null
    name: string | null
    dob: string | null
    preprocessed_url?: string | null
  }
  phase?: string | null
  inference_ms?: number | null
  validations: {
    pan_format: boolean | null
    verhoeff: boolean | null
    mrz_valid: boolean | null
  }
  penalties: {
    P_mrz: number
    P_ela: number
    P_face: number
    P_graph: number
  }
  forensics: {
    ela_url: string | null
    anomaly_score: number | null
  }
  biometrics: {
    verified: boolean | null
    distance: number | null
    threshold?: number | null
    liveness_passed: boolean | null
    liveness_score?: number | null
    liveness_method?: string | null
    spoof_reason?: string | null
    id_face_url?: string | null
    face_inference_ms?: number | null
    liveness_inference_ms?: number | null
  }
  graph: {
    fraud_loop_detected: boolean
    graph_status?:
      | 'clear'
      | 'duplicate_rescan'
      | 'same_identity'
      | 'linked_profile'
      | 'fraud_loop'
      | null
    matched_alias_docs: string[]
    matched_face_id?: string | null
    similarity?: number | null
    nodes_in_graph?: number | null
  }
  risk: {
    score: number
    band: 'LOW' | 'MEDIUM' | 'HIGH'
    breakdown: {
      mrz_contribution: number
      ela_contribution: number
      face_contribution: number
      graph_contribution: number
    }
  }
}

export interface JobStatusResponse {
  job_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  step: string
  result: ScanResult | null
  error: string | null
}

const API_BASE = ''

function parseApiError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return detail.map(String).join(', ')
  }
  return fallback
}

export async function uploadFile(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('Upload failed')
  return res.json()
}

export async function scanOcr(file: File): Promise<ScanResult> {
  const form = new FormData()
  form.append('document', file)
  const res = await fetch(`${API_BASE}/api/scan/ocr`, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(parseApiError(body, 'OCR scan failed'))
  }
  return res.json()
}

export async function scanDocument(file: File): Promise<ScanResult> {
  const form = new FormData()
  form.append('document', file)
  const res = await fetch(`${API_BASE}/api/scan/document`, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(parseApiError(body, 'Validation scan failed'))
  }
  return res.json()
}

export async function scanForensics(file: File): Promise<ScanResult> {
  const form = new FormData()
  form.append('document', file)
  const res = await fetch(`${API_BASE}/api/scan/forensics`, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(parseApiError(body, 'Forensics scan failed'))
  }
  return res.json()
}

export async function scanFace(document: File, selfie: File): Promise<ScanResult> {
  const form = new FormData()
  form.append('document', document)
  form.append('selfie', selfie)
  const res = await fetch(`${API_BASE}/api/scan/face`, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(parseApiError(body, 'Face match scan failed'))
  }
  return res.json()
}

export interface GraphAlert {
  face_id: string
  matched_face: string
  docs: string[]
  similarity: number
}

export interface GraphStats {
  documents: number
  faces: number
  biometric_links: number
  alerts: number
}

export async function scanGraph(document: File, selfie: File): Promise<ScanResult> {
  const form = new FormData()
  form.append('document', document)
  form.append('selfie', selfie)
  const res = await fetch(`${API_BASE}/api/scan/graph`, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(parseApiError(body, 'Graph scan failed'))
  }
  return res.json()
}

export async function scanLiveness(document: File, selfie: File): Promise<ScanResult> {
  const form = new FormData()
  form.append('document', document)
  form.append('selfie', selfie)
  const res = await fetch(`${API_BASE}/api/scan/liveness`, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(parseApiError(body, 'Liveness scan failed'))
  }
  return res.json()
}

export function isScanResult(value: unknown): value is ScanResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'scan_id' in value &&
    'risk' in value &&
    !('job_id' in value)
  )
}

export async function scanFull(
  document: File,
  selfie?: File,
  asyncMode = false,
): Promise<ScanResult> {
  const form = new FormData()
  form.append('document', document)
  if (selfie) form.append('selfie', selfie)
  const url = asyncMode ? `${API_BASE}/api/scan/full?async=true` : `${API_BASE}/api/scan/full`
  const res = await fetch(url, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(parseApiError(body, 'Full scan failed'))
  }
  const data = await res.json()
  if (!isScanResult(data)) {
    throw new Error('Unexpected async job response — enable Async mode or disable Redis auto-queue')
  }
  return data
}

export async function submitScanJob(
  document: File,
  selfie?: File,
): Promise<{ job_id: string } | ScanResult> {
  const form = new FormData()
  form.append('document', document)
  if (selfie) form.append('selfie', selfie)
  const res = await fetch(`${API_BASE}/api/scan/full?async=true`, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(parseApiError(body, 'Failed to submit scan job'))
  }
  return res.json()
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const res = await fetch(`${API_BASE}/api/scan/${jobId}/status`)
  if (!res.ok) throw new Error('Failed to fetch job status')
  return res.json()
}

export async function getGraphAlerts(): Promise<{ alerts: GraphAlert[] }> {
  const res = await fetch(`${API_BASE}/api/graph/alerts`)
  if (!res.ok) throw new Error('Failed to fetch graph alerts')
  return res.json()
}

export async function getGraphStats(): Promise<GraphStats> {
  const res = await fetch(`${API_BASE}/api/graph/stats`)
  if (!res.ok) throw new Error('Failed to fetch graph stats')
  return res.json()
}

export async function resetGraph(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/graph/reset`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to reset graph')
}
