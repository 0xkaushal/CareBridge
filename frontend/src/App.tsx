import { useState, useRef } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface CarePlan {
  diagnosis: string
  medicines: string[]
  dosage: string
  foodInstructions: string
  restrictions: string[]
  warningSigns: string[]
  followUpDate: string
  preferredLanguage: string
}

// ── Voice Recorder Hook ──────────────────────────────────────────────────────

function useRecorder() {
  const [recording, setRecording] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mr = new MediaRecorder(stream)
    chunksRef.current = []
    mr.ondataavailable = (e) => chunksRef.current.push(e.data)
    mr.start()
    mediaRef.current = mr
    setRecording(true)
  }

  const stop = (): Promise<Blob> =>
    new Promise((resolve) => {
      const mr = mediaRef.current!
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        mr.stream.getTracks().forEach((t) => t.stop())
        resolve(blob)
      }
      mr.stop()
      setRecording(false)
    })

  return { recording, start, stop }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function playAudioB64(b64: string) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'audio/wav' })
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.play()
}

// ── Sub Components ───────────────────────────────────────────────────────────

function MicButton({
  recording,
  onStart,
  onStop,
  label,
  color,
}: {
  recording: boolean
  onStart: () => void
  onStop: () => void
  label: string
  color: string
}) {
  return (
    <button
      onClick={recording ? onStop : onStart}
      className={`flex flex-col items-center gap-3 px-10 py-6 rounded-2xl text-white font-semibold text-lg transition-all duration-200 shadow-lg ${
        recording
          ? 'bg-red-500 scale-105 shadow-red-500/40'
          : `${color} hover:scale-105 hover:shadow-xl`
      }`}
    >
      <span className="text-4xl">{recording ? '⏹' : '🎙'}</span>
      <span>{recording ? 'Stop Recording' : label}</span>
      {recording && (
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 bg-white rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      )}
    </button>
  )
}

function CarePlanCard({ plan }: { plan: CarePlan }) {
  const rows: { label: string; value: string | string[] }[] = [
    { label: 'Diagnosis', value: plan.diagnosis },
    { label: 'Medicines', value: plan.medicines },
    { label: 'Dosage', value: plan.dosage },
    { label: 'Food', value: plan.foodInstructions },
    { label: 'Restrictions', value: plan.restrictions },
    { label: 'Warning Signs', value: plan.warningSigns },
    { label: 'Follow-up', value: plan.followUpDate },
  ]

  return (
    <div className="bg-slate-800 rounded-2xl p-6 space-y-4">
      {rows.map(({ label, value }) => {
        if (!value || (Array.isArray(value) && value.length === 0)) return null
        return (
          <div key={label}>
            <p className="text-xs uppercase tracking-widest text-slate-400 mb-1">{label}</p>
            {Array.isArray(value) ? (
              <ul className="space-y-1">
                {value.map((v, i) => (
                  <li key={i} className="text-slate-100 flex gap-2">
                    <span className="text-emerald-400">•</span> {v}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-100">{value}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [carePlan, setCarePlan] = useState<CarePlan | null>(null)
  const [doctorTranscript, setDoctorTranscript] = useState('')
  const [patientTranscript, setPatientTranscript] = useState('')
  const [aiAnswer, setAiAnswer] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const doctorRec = useRecorder()
  const patientRec = useRecorder()

  // Doctor flow
  const handleDoctorStop = async () => {
    const blob = await doctorRec.stop()
    setLoading(true)
    setStatus('Transcribing doctor instructions...')
    try {
      const form = new FormData()
      form.append('audio', blob, 'doctor.webm')
      const res = await fetch('/doctor', { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setDoctorTranscript(data.transcript)
      setCarePlan(data.care_plan)
      setStatus('Care plan updated.')
    } catch (e: any) {
      setStatus('Error: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  // Patient flow
  const handlePatientStop = async () => {
    const blob = await patientRec.stop()
    setLoading(true)
    setStatus('Processing your question...')
    try {
      const form = new FormData()
      form.append('audio', blob, 'patient.webm')
      const res = await fetch('/patient', { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setPatientTranscript(data.transcript)
      setAiAnswer(data.answer)
      setStatus('Answer ready.')
      playAudioB64(data.audio_b64)
    } catch (e: any) {
      setStatus('Error: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  // Explain To Me
  const handleExplain = async () => {
    setLoading(true)
    setStatus('Preparing your full discharge summary...')
    try {
      const res = await fetch('/summary')
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setAiAnswer(data.summary_text)
      setStatus('Playing your discharge summary...')
      playAudioB64(data.audio_b64)
    } catch (e: any) {
      setStatus('Error: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">CareBridge</h1>
          <p className="text-slate-400 text-sm mt-0.5">AI Voice Discharge Companion</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className={`w-2 h-2 rounded-full ${carePlan ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          {carePlan ? 'Care plan active' : 'Awaiting doctor input'}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        {/* Status bar */}
        {(loading || status) && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl px-5 py-3 flex items-center gap-3">
            {loading && (
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            )}
            <p className="text-slate-300 text-sm">{status}</p>
          </div>
        )}

        {/* Two column layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

          {/* Doctor Section */}
          <section className="bg-slate-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-white">Doctor</h2>
              <p className="text-slate-400 text-sm">Speak discharge instructions in English</p>
            </div>
            <MicButton
              recording={doctorRec.recording}
              onStart={doctorRec.start}
              onStop={handleDoctorStop}
              label="Record Instructions"
              color="bg-blue-600"
            />
            {doctorTranscript && (
              <div className="bg-slate-700 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Transcript</p>
                <p className="text-slate-100 text-sm leading-relaxed">{doctorTranscript}</p>
              </div>
            )}
          </section>

          {/* Patient Section */}
          <section className="bg-slate-800 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-white">Patient</h2>
              <p className="text-slate-400 text-sm">Ask a question in your language</p>
            </div>
            <MicButton
              recording={patientRec.recording}
              onStart={patientRec.start}
              onStop={handlePatientStop}
              label="Ask a Question"
              color="bg-emerald-600"
            />
            {patientTranscript && (
              <div className="bg-slate-700 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Your question</p>
                <p className="text-slate-100 text-sm leading-relaxed">{patientTranscript}</p>
              </div>
            )}
          </section>
        </div>

        {/* AI Response */}
        {aiAnswer && (
          <section className="bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600 rounded-2xl p-6 space-y-3">
            <p className="text-xs uppercase tracking-widest text-slate-400">CareBridge Response</p>
            <p className="text-slate-100 text-lg leading-relaxed">{aiAnswer}</p>
          </section>
        )}

        {/* Care Plan */}
        {carePlan && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Patient Care Plan</h2>
              {/* Explain To Me — the signature delight moment */}
              <button
                onClick={handleExplain}
                disabled={loading}
                className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl text-base transition-all hover:scale-105 shadow-lg shadow-violet-500/30 flex items-center gap-2"
              >
                <span>✨</span>
                Explain To Me
              </button>
            </div>
            <CarePlanCard plan={carePlan} />
          </section>
        )}

        {/* Empty state */}
        {!carePlan && !loading && (
          <div className="text-center py-20 text-slate-500">
            <p className="text-6xl mb-4">🏥</p>
            <p className="text-lg">Press "Record Instructions" to begin</p>
            <p className="text-sm mt-2">The doctor speaks first, then the patient can ask questions</p>
          </div>
        )}
      </main>
    </div>
  )
}
