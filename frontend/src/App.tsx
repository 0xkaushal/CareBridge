import { useState, useRef, useEffect } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = 'doctor' | 'patient'

interface CarePlan {
  id: string
  name: string
  age: number
  diagnosis: string
  medicines: string[]
  dosage: string
  foodInstructions: string
  restrictions: string[]
  warningSigns: string[]
  followUpDate: string
  preferredLanguage: string
  doctorNote?: string
}

interface PatientStub {
  id: string
  name: string
  age: number
}

// ── Voice Recorder Hook ───────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function playAudioB64(b64: string) {
  if (!b64) return
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'audio/wav' })
  new Audio(URL.createObjectURL(blob)).play()
}

// ── Sub Components ────────────────────────────────────────────────────────────

function MicButton({ recording, onStart, onStop, label, color, disabled }: {
  recording: boolean; onStart: () => void; onStop: () => void
  label: string; color: string; disabled?: boolean
}) {
  return (
    <button
      onClick={recording ? onStop : onStart}
      disabled={disabled && !recording}
      className={`flex flex-col items-center gap-3 px-8 py-5 rounded-2xl text-white font-semibold text-base transition-all duration-200 shadow-lg w-full
        ${recording ? 'bg-red-500 scale-105 shadow-red-500/40'
          : disabled ? 'bg-slate-700 opacity-40 cursor-not-allowed'
          : `${color} hover:scale-105 hover:shadow-xl`}`}
    >
      <span className="text-3xl">{recording ? '⏹' : '🎙'}</span>
      <span>{recording ? 'Stop Recording' : label}</span>
      {recording && (
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-2 h-2 bg-white rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
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
    { label: 'Food Instructions', value: plan.foodInstructions },
    { label: 'Restrictions', value: plan.restrictions },
    { label: 'Warning Signs', value: plan.warningSigns },
    { label: 'Follow-up Date', value: plan.followUpDate },
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
      {plan.doctorNote && (
        <div className="border-t border-slate-700 pt-4">
          <p className="text-xs uppercase tracking-widest text-slate-400 mb-1">Doctor's Note</p>
          <p className="text-slate-300 italic text-sm">{plan.doctorNote}</p>
        </div>
      )}
    </div>
  )
}

// ── Role Select Screen ────────────────────────────────────────────────────────

function RoleSelect({ onSelect }: { onSelect: (r: Role) => void }) {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-6">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-white mb-2">CareBridge</h1>
        <p className="text-slate-400">AI Voice Discharge Companion</p>
      </div>
      <p className="text-slate-400 text-sm uppercase tracking-widest mb-6">I am a</p>
      <div className="flex flex-col sm:flex-row gap-6 w-full max-w-lg">
        <button
          onClick={() => onSelect('doctor')}
          className="flex-1 flex flex-col items-center gap-4 bg-blue-600 hover:bg-blue-500 text-white rounded-3xl px-10 py-10 transition-all hover:scale-105 shadow-xl shadow-blue-500/30"
        >
          <span className="text-6xl">🩺</span>
          <span className="text-2xl font-bold">Doctor</span>
          <span className="text-blue-200 text-sm text-center">Record discharge instructions and manage patient care plans</span>
        </button>
        <button
          onClick={() => onSelect('patient')}
          className="flex-1 flex flex-col items-center gap-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-3xl px-10 py-10 transition-all hover:scale-105 shadow-xl shadow-emerald-500/30"
        >
          <span className="text-6xl">🧑‍⚕️</span>
          <span className="text-2xl font-bold">Patient</span>
          <span className="text-emerald-200 text-sm text-center">Ask questions and hear your discharge instructions in your language</span>
        </button>
      </div>
    </div>
  )
}

// ── Doctor View ───────────────────────────────────────────────────────────────

function DoctorView({ onSwitchRole }: { onSwitchRole: () => void }) {
  const [patients, setPatients] = useState<PatientStub[]>([])
  const [selectedId, setSelectedId] = useState('P001')
  const [carePlan, setCarePlan] = useState<CarePlan | null>(null)
  const [transcript, setTranscript] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const rec = useRecorder()

  useEffect(() => {
    fetch('/patients').then(r => r.json()).then(setPatients)
      .catch(() => setStatus('Could not load patients'))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setCarePlan(null); setTranscript('')
    fetch(`/record?patient_id=${selectedId}`).then(r => r.json()).then(setCarePlan)
      .catch(() => setStatus('Could not load care plan'))
  }, [selectedId])

  const handleStop = async () => {
    const blob = await rec.stop()
    setLoading(true); setStatus('Processing instructions...')
    try {
      const form = new FormData()
      form.append('audio', blob, 'doctor.webm')
      const res = await fetch(`/doctor?patient_id=${selectedId}`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setTranscript(data.transcript)
      setCarePlan(data.care_plan)
      setStatus('Care plan updated.')
    } catch (e: any) {
      setStatus('Error: ' + e.message)
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="border-b border-slate-700 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">CareBridge <span className="text-blue-400 text-lg font-normal">— Doctor</span></h1>
          <p className="text-slate-400 text-sm">Manage patient discharge instructions</p>
        </div>
        <button onClick={onSwitchRole}
          className="text-slate-400 hover:text-white text-sm border border-slate-700 hover:border-slate-500 px-4 py-2 rounded-lg transition-all">
          Switch Role
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {(loading || status) && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl px-5 py-3 flex items-center gap-3">
            {loading && <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
            <p className="text-slate-300 text-sm">{status}</p>
          </div>
        )}

        {/* Patient switcher */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-slate-400">Select Patient</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {patients.map((p) => (
              <button key={p.id} onClick={() => setSelectedId(p.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all
                  ${selectedId === p.id
                    ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/30 scale-105'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-slate-700'}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0
                  ${selectedId === p.id ? 'bg-blue-500' : 'bg-slate-600'}`}>
                  {p.name[0]}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{p.name}</p>
                  <p className={`text-xs ${selectedId === p.id ? 'text-blue-200' : 'text-slate-500'}`}>{p.id} · {p.age}y</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Record section */}
        <section className="bg-slate-800 rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Record Instructions</h2>
            <p className="text-slate-400 text-sm">Speak discharge instructions for {carePlan?.name ?? '...'}</p>
          </div>
          <MicButton recording={rec.recording} onStart={rec.start} onStop={handleStop}
            label="Record Instructions" color="bg-blue-600" />
          {transcript && (
            <div className="bg-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Transcript</p>
              <p className="text-slate-100 text-sm leading-relaxed">{transcript}</p>
            </div>
          )}
        </section>

        {/* Care plan */}
        {carePlan && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Care Plan — {carePlan.name}</h2>
            <CarePlanCard plan={carePlan} />
          </section>
        )}
      </main>
    </div>
  )
}

// ── Patient ID Entry Screen ───────────────────────────────────────────────────

function PatientLogin({ onLogin }: { onLogin: (id: string) => void }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = input.trim().toUpperCase()
    if (!id) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`/record?patient_id=${id}`)
      if (!res.ok) throw new Error('Patient ID not found. Please check and try again.')
      onLogin(id)
    } catch (e: any) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="text-6xl mb-4">🏥</div>
          <h1 className="text-3xl font-bold text-white">Welcome</h1>
          <p className="text-slate-400 mt-2">Enter your Patient ID to view your discharge instructions</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-widest text-slate-400 block mb-2">
              Patient ID
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. P001"
              autoFocus
              className="w-full bg-slate-800 border border-slate-600 text-white text-xl text-center rounded-xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder-slate-600 uppercase tracking-widest"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold py-4 rounded-xl text-lg transition-all hover:scale-105 shadow-lg shadow-emerald-500/30"
          >
            {loading ? 'Verifying...' : 'Continue'}
          </button>
        </form>

        <p className="text-slate-600 text-xs text-center">
          Your ID is printed on your discharge slip
        </p>
      </div>
    </div>
  )
}

// ── Patient View ──────────────────────────────────────────────────────────────

function PatientView({ onSwitchRole }: { onSwitchRole: () => void }) {
  const [patientId, setPatientId] = useState<string | null>(null)
  const [carePlan, setCarePlan] = useState<CarePlan | null>(null)
  const [transcript, setTranscript] = useState('')
  const [aiAnswer, setAiAnswer] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const rec = useRecorder()

  // Once patient logs in, fetch their record
  const handleLogin = (id: string) => {
    setPatientId(id)
    fetch(`/record?patient_id=${id}`)
      .then(r => r.json())
      .then(setCarePlan)
      .catch(() => setStatus('Could not load your care plan'))
  }

  const handleStop = async () => {
    if (!patientId) return
    const blob = await rec.stop()
    setLoading(true); setStatus('Processing your question...')
    try {
      const form = new FormData()
      form.append('audio', blob, 'patient.webm')
      const res = await fetch(`/patient?patient_id=${patientId}`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setTranscript(data.transcript)
      setAiAnswer(data.answer)
      setStatus('Answer ready.')
      playAudioB64(data.audio_b64)
    } catch (e: any) {
      setStatus('Error: ' + e.message)
    } finally { setLoading(false) }
  }

  const handleExplain = async () => {
    if (!patientId) return
    setLoading(true); setStatus('Preparing your discharge summary...')
    try {
      const res = await fetch(`/summary?patient_id=${patientId}`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setAiAnswer(data.summary_text)
      setStatus('Summary ready.')
      playAudioB64(data.audio_b64)
    } catch (e: any) {
      setStatus('Error: ' + e.message)
    } finally { setLoading(false) }
  }

  // Step 1: ask for patient ID
  if (!patientId) return <PatientLogin onLogin={handleLogin} />

  // Step 2: show their personal view
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="border-b border-slate-700 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">CareBridge <span className="text-emerald-400 text-lg font-normal">— Patient</span></h1>
          {carePlan && <p className="text-slate-400 text-sm">Hello, {carePlan.name}</p>}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setPatientId(null); setCarePlan(null) }}
            className="text-slate-400 hover:text-white text-sm border border-slate-700 hover:border-slate-500 px-4 py-2 rounded-lg transition-all">
            Change Patient
          </button>
          <button onClick={onSwitchRole}
            className="text-slate-400 hover:text-white text-sm border border-slate-700 hover:border-slate-500 px-4 py-2 rounded-lg transition-all">
            Switch Role
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {(loading || status) && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl px-5 py-3 flex items-center gap-3">
            {loading && <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />}
            <p className="text-slate-300 text-sm">{status}</p>
          </div>
        )}

        {/* Diagnosis highlight — only their own */}
        {carePlan && (
          <div className="bg-slate-800 rounded-2xl px-6 py-5 flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-600 rounded-full flex items-center justify-center text-xl font-bold shrink-0">
              {carePlan.name[0]}
            </div>
            <div>
              <p className="text-white font-semibold text-lg">{carePlan.name}</p>
              <p className="text-slate-400 text-sm">{carePlan.diagnosis}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-slate-500">Patient ID</p>
              <p className="text-slate-300 font-mono font-semibold">{carePlan.id}</p>
            </div>
          </div>
        )}

        {/* Explain To Me — the big moment */}
        {carePlan && (
          <button onClick={handleExplain} disabled={loading}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold px-6 py-6 rounded-2xl text-xl transition-all hover:scale-105 shadow-xl shadow-violet-500/30 flex items-center justify-center gap-3">
            <span className="text-3xl">✨</span>
            Explain My Discharge Plan
          </button>
        )}

        {/* Ask question */}
        <section className="bg-slate-800 rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Ask a Question</h2>
            <p className="text-slate-400 text-sm">Speak in your language — we'll answer in your language</p>
          </div>
          <MicButton recording={rec.recording} onStart={rec.start} onStop={handleStop}
            label="Ask a Question" color="bg-emerald-600" disabled={!carePlan} />
          {transcript && (
            <div className="bg-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Your question</p>
              <p className="text-slate-100 text-sm">{transcript}</p>
            </div>
          )}
        </section>

        {/* AI Answer */}
        {aiAnswer && (
          <section className="bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600 rounded-2xl p-6 space-y-2">
            <p className="text-xs uppercase tracking-widest text-slate-400">CareBridge</p>
            <p className="text-slate-100 text-lg leading-relaxed">{aiAnswer}</p>
          </section>
        )}

        {/* Their care plan only */}
        {carePlan && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Your Care Plan</h2>
            <CarePlanCard plan={carePlan} />
          </section>
        )}
      </main>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [role, setRole] = useState<Role | null>(null)

  if (!role) return <RoleSelect onSelect={setRole} />
  if (role === 'doctor') return <DoctorView onSwitchRole={() => setRole(null)} />
  return <PatientView onSwitchRole={() => setRole(null)} />
}
