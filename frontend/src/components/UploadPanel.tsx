import { useRef, useState } from 'react'
import { Camera, Upload, X } from 'lucide-react'

interface UploadPanelProps {
  onDocumentSelect: (file: File) => void
  documentFile: File | null
  disabled?: boolean
}

export function UploadPanel({ onDocumentSelect, documentFile, disabled }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6">
      <div className="mb-4 flex items-center gap-2">
        <Upload className="h-5 w-5 text-cyan-400" />
        <h2 className="text-lg font-semibold text-white">Document Upload</h2>
      </div>
      <p className="mb-4 text-sm text-slate-400">Upload PAN card or identity document (JPG, PNG)</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onDocumentSelect(file)
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-lg border border-dashed border-slate-600 bg-slate-900/50 px-4 py-8 text-slate-300 transition hover:border-cyan-500 hover:text-cyan-400 disabled:opacity-50"
      >
        {documentFile ? documentFile.name : 'Click to select document image'}
      </button>
    </div>
  )
}

interface WebcamCaptureProps {
  onCapture: (file: File) => void
  selfieFile: File | null
  disabled?: boolean
}

export function WebcamCapture({ onCapture, selfieFile, disabled }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [active, setActive] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setActive(true)
    } catch {
      alert('Camera access denied. Please allow webcam permission.')
    }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setActive(false)
  }

  const capture = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' })
      onCapture(file)
      setPreview(canvas.toDataURL('image/jpeg'))
      stopCamera()
    }, 'image/jpeg', 0.95)
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6">
      <div className="mb-4 flex items-center gap-2">
        <Camera className="h-5 w-5 text-cyan-400" />
        <h2 className="text-lg font-semibold text-white">Live Selfie Capture</h2>
      </div>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-900">
        {preview || selfieFile ? (
          <img src={preview || (selfieFile ? URL.createObjectURL(selfieFile) : '')} alt="Selfie" className="h-full w-full object-cover" />
        ) : (
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        )}
      </div>
      <div className="mt-4 flex gap-2">
        {!active && !selfieFile && (
          <button type="button" disabled={disabled} onClick={startCamera} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50">
            Start Camera
          </button>
        )}
        {active && (
          <>
            <button type="button" onClick={capture} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500">
              Capture
            </button>
            <button type="button" onClick={stopCamera} className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500">
              <X className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
