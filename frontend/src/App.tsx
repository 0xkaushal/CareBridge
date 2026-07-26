import { useState, useRef, useEffect } from 'react'

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

// ── Recorder ──────────────────────────────────────────────────────────────────

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

function playAudioB64(b64: string) {
  if (!b64) return
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  new Audio(URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))).play()
}

function langName(code: string) {
  const map: Record<string, string> = { 'hi-IN': 'Hindi', 'kn-IN': 'Kannada', 'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'mr-IN': 'Marathi', 'en-IN': 'English' }
  return map[code] ?? code
}

// ── Care Plan Card ────────────────────────────────────────────────────────────

function CarePlanCard({ plan }: { plan: CarePlan }) {
  const sections = [
    { icon: '🔬', label: 'Diagnosis', value: plan.diagnosis, color: 'text-blue-400' },
    { icon: '💊', label: 'Medicines', value: plan.medicines, color: 'text-purple-400' },
    { icon: '📋', label: 'Dosage', value: plan.dosage, color: 'text-indigo-400' },
    { icon: '🥗', label: 'Food Instructions', value: plan.foodInstructions, color: 'text-green-400' },
    { icon: '🚫', label: 'Restrictions', value: plan.restrictions, color: 'text-orange-400' },
    { icon: '⚠️', label: 'Warning Signs', value: plan.warningSigns, color: 'text-red-400' },
    { icon: '📅', label: 'Follow-up', value: plan.followUpDate, color: 'text-teal-400' },
  ]

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-700/50">
      {sections.map(({ icon, label, value, color }, idx) => {
        if (!value || (Array.isArray(value) && value.length === 0)) return null
        return (
          <div key={label} className={`px-5 py-4 flex gap-4 ${idx % 2 === 0 ? 'bg-slate-800/60' : 'bg-slate-800/30'}`}>
            <span className="text-xl shrink-0 mt-0.5">{icon}</span>
            <div className="min-w-0">
              <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${color}`}>{label}</p>
              {Array.isArray(value) ? (
                <ul className="space-y-0.5">
                  {value.map((v, i) => <li key={i} className="text-slate-200 text-sm">{v}</li>)}
                </ul>
              ) : (
                <p className="text-slate-200 text-sm">{value}</p>
              )}
            </div>
          </div>
        )
      })}
      {plan.doctorNote && (
        <div className="px-5 py-4 bg-amber-900/20 border-t border-amber-700/30 flex gap-4">
          <span className="text-xl shrink-0">📝</span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1">Doctor's Note</p>
            <p className="text-amber-100/80 text-sm italic">{plan.doctorNote}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Role Select ───────────────────────────────────────────────────────────────

function RoleSelect({ onSelect }: { onSelect: (r: Role) => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center px-6">
      {/* Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative text-center mb-14">
        <div className="inline-flex items-center gap-2 bg-slate-800/60 border border-slate-700/50 rounded-full px-4 py-1.5 text-slate-400 text-xs tracking-widest uppercase mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          AI Voice Discharge Companion
        </div>
        <h1 className="text-6xl font-bold text-white tracking-tight">CareBridge</h1>
        <p className="text-slate-400 mt-3 text-lg">Bridging care, one voice at a time.</p>
      </div>

      <p className="relative text-slate-500 text-xs uppercase tracking-widest mb-5">Continue as</p>

      <div className="relative flex flex-col sm:flex-row gap-5 w-full max-w-md">
        <button onClick={() => onSelect('doctor')}
          className="group flex-1 flex flex-col items-center gap-5 bg-slate-800/80 hover:bg-blue-600 border border-slate-700/50 hover:border-blue-500 text-white rounded-3xl px-8 py-10 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/20">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/20 group-hover:bg-white/20 flex items-center justify-center text-3xl transition-all">🩺</div>
          <div className="text-center">
            <p className="text-xl font-bold">Doctor</p>
            <p className="text-slate-400 group-hover:text-blue-100 text-sm mt-1 transition-colors">Record discharge instructions</p>
          </div>
        </button>

        <button onClick={() => onSelect('patient')}
          className="group flex-1 flex flex-col items-center gap-5 bg-slate-800/80 hover:bg-emerald-600 border border-slate-700/50 hover:border-emerald-500 text-white rounded-3xl px-8 py-10 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-emerald-500/20">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 group-hover:bg-white/20 flex items-center justify-center text-3xl transition-all">🧑‍⚕️</div>
          <div className="text-center">
            <p className="text-xl font-bold">Patient</p>
            <p className="text-slate-400 group-hover:text-emerald-100 text-sm mt-1 transition-colors">Ask questions in your language</p>
          </div>
        </button>
      </div>
    </div>
  )
}

interface UnansweredQuestion {
  question_original: string
  question_english: string
  asked_at: string
}

// ── Doctor View ───────────────────────────────────────────────────────────────

function DoctorView({ onSwitchRole }: { onSwitchRole: () => void }) {
  const [patients, setPatients] = useState<PatientStub[]>([])
  const [selectedId, setSelectedId] = useState('P001')
  const [carePlan, setCarePlan] = useState<CarePlan | null>(null)
  const [transcript, setTranscript] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [unanswered, setUnanswered] = useState<UnansweredQuestion[]>([])
  const rec = useRecorder()

  useEffect(() => {
    fetch('/patients').then(r => r.json()).then(setPatients).catch(() => setStatus('Could not load patients'))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setCarePlan(null); setTranscript(''); setUnanswered([])
    fetch(`/record?patient_id=${selectedId}`).then(r => r.json()).then(setCarePlan).catch(() => setStatus('Could not load care plan'))
    fetch(`/questions?patient_id=${selectedId}`).then(r => r.json()).then(d => setUnanswered(d.questions || [])).catch(() => {})
  }, [selectedId])

  // Poll for new unanswered questions every 8 seconds
  useEffect(() => {
    if (!selectedId) return
    const interval = setInterval(() => {
      fetch(`/questions?patient_id=${selectedId}`)
        .then(r => r.json())
        .then(d => setUnanswered(d.questions || []))
        .catch(() => {})
    }, 8000)
    return () => clearInterval(interval)
  }, [selectedId])

  const refreshQuestions = () => {
    fetch(`/questions?patient_id=${selectedId}`)
      .then(r => r.json())
      .then(d => setUnanswered(d.questions || []))
      .catch(() => {})
  }

  const handleStop = async () => {
    const blob = await rec.stop()
    setLoading(true); setStatus('Transcribing and extracting care plan...')
    try {
      const form = new FormData()
      form.append('audio', blob, 'doctor.webm')
      const res = await fetch(`/doctor?patient_id=${selectedId}`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setTranscript(data.transcript)
      setCarePlan(data.care_plan)
      setStatus('Care plan updated successfully.')
    } catch (e: any) {
      setStatus('Error: ' + e.message)
    } finally { setLoading(false) }
  }

  const handleClearQuestions = async () => {
    await fetch(`/questions?patient_id=${selectedId}`, { method: 'DELETE' })
    setUnanswered([])
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-sm">🩺</div>
          <div>
            <span className="font-bold text-white">CareBridge</span>
            <span className="text-blue-400 text-sm ml-2">Doctor</span>
          </div>
        </div>
        <button onClick={onSwitchRole}
          className="text-slate-400 hover:text-white text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-1.5 rounded-lg transition-all">
          Switch Role
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-7">

        {/* Status */}
        {(loading || status) && (
          <div className={`rounded-xl px-5 py-3 flex items-center gap-3 border ${
            status.startsWith('Error') ? 'bg-red-900/20 border-red-700/40 text-red-300' : 'bg-slate-800/80 border-slate-700/50 text-slate-300'
          }`}>
            {loading && <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />}
            <p className="text-sm">{status}</p>
          </div>
        )}

        {/* Patient switcher */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Select Patient</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {patients.map((p) => (
              <button key={p.id} onClick={() => setSelectedId(p.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-200
                  ${selectedId === p.id
                    ? 'bg-blue-600/20 border-blue-500/60 text-white shadow-lg shadow-blue-500/10'
                    : 'bg-slate-800/50 border-slate-700/50 text-slate-300 hover:border-slate-600 hover:bg-slate-800'}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0
                  ${selectedId === p.id ? 'bg-blue-500' : 'bg-slate-700'}`}>
                  {p.name[0]}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{p.name}</p>
                  <p className={`text-xs ${selectedId === p.id ? 'text-blue-300' : 'text-slate-500'}`}>{p.id} · {p.age}y</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Record section */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Record Instructions</h2>
              <p className="text-slate-400 text-sm mt-0.5">
                Speaking for <span className="text-blue-400">{carePlan?.name ?? '...'}</span>
              </p>
            </div>
            {carePlan && (
              <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full">
                {langName(carePlan.preferredLanguage)}
              </span>
            )}
          </div>

          <button
            onClick={rec.recording ? handleStop : rec.start}
            disabled={loading}
            className={`w-full flex flex-col items-center gap-3 py-7 rounded-xl font-semibold text-white transition-all duration-200
              ${rec.recording
                ? 'bg-red-500/90 shadow-lg shadow-red-500/30 scale-[1.02]'
                : loading
                ? 'bg-slate-700/50 opacity-50 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 hover:scale-[1.02] shadow-lg shadow-blue-500/20'}`}
          >
            <span className="text-4xl">{rec.recording ? '⏹' : '🎙'}</span>
            <span className="text-base">{rec.recording ? 'Stop Recording' : 'Start Recording Instructions'}</span>
            {rec.recording && (
              <span className="flex gap-1.5 items-end h-5">
                {[0,1,2,3,4].map(i => (
                  <span key={i} className="w-1 bg-white/80 rounded-full animate-bounce"
                    style={{ height: `${8 + (i % 3) * 5}px`, animationDelay: `${i * 0.1}s` }} />
                ))}
              </span>
            )}
          </button>

          {transcript && (
            <div className="bg-slate-900/50 border border-slate-700/30 rounded-xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Transcript</p>
              <p className="text-slate-200 text-sm leading-relaxed">{transcript}</p>
            </div>
          )}
        </div>

        {/* Unanswered patient questions */}
        {unanswered.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <p className="text-sm font-semibold text-amber-400">Patient Questions Needing Your Attention</p>
                <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">{unanswered.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={refreshQuestions}
                  className="text-xs text-slate-500 hover:text-slate-300 border border-slate-700 px-3 py-1 rounded-lg transition-all">
                  Refresh
                </button>
                <button onClick={handleClearQuestions}
                  className="text-xs text-slate-500 hover:text-red-400 border border-slate-700 px-3 py-1 rounded-lg transition-all">
                  Clear all
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {unanswered.map((q, i) => (
                <div key={i} className="bg-amber-900/10 border border-amber-700/30 rounded-xl px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-amber-500 uppercase tracking-wider">Question {i + 1}</p>
                    <p className="text-xs text-slate-600">{q.asked_at}</p>
                  </div>
                  <p className="text-white text-sm font-medium">{q.question_english}</p>
                  {q.question_original !== q.question_english && (
                    <p className="text-slate-500 text-xs italic">"{q.question_original}"</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Care plan */}
        {carePlan && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-300">Care Plan</h2>
              <span className="text-xs text-slate-500">{carePlan.name} · {carePlan.id}</span>
            </div>
            <CarePlanCard plan={carePlan} />
          </div>
        )}
      </main>
    </div>
  )
}

// ── Patient Login ─────────────────────────────────────────────────────────────

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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center px-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-600/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-4xl mx-auto mb-6">🏥</div>
          <h1 className="text-3xl font-bold text-white">Welcome</h1>
          <p className="text-slate-400 mt-2 text-sm leading-relaxed">Enter your Patient ID to access<br />your personal discharge instructions</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest text-slate-500 block mb-2">Patient ID</label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="P001"
              autoFocus
              className="w-full bg-slate-800/80 border border-slate-700/60 focus:border-emerald-500/60 text-white text-2xl text-center rounded-xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 placeholder-slate-600 uppercase tracking-widest transition-all"
            />
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-700/40 rounded-xl px-4 py-3">
              <p className="text-red-300 text-sm text-center">{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading || !input.trim()}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl text-lg transition-all hover:scale-[1.02] shadow-lg shadow-emerald-500/20">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Verifying...
              </span>
            ) : 'Continue →'}
          </button>
        </form>

        <p className="text-slate-600 text-xs text-center">Your ID is on your hospital discharge slip</p>
      </div>
    </div>
  )
}

// ── Patient View ──────────────────────────────────────────────────────────────

interface HistoryTurn { role: 'user' | 'assistant'; content: string }

function PatientView({ onSwitchRole }: { onSwitchRole: () => void }) {
  const [patientId, setPatientId] = useState<string | null>(null)
  const [carePlan, setCarePlan] = useState<CarePlan | null>(null)
  const [history, setHistory] = useState<HistoryTurn[]>([])
  const [lastAudioB64, setLastAudioB64] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const rec = useRecorder()
  const bottomRef = useRef<HTMLDivElement>(null)

  const handleLogin = (id: string) => {
    setPatientId(id)
    fetch(`/record?patient_id=${id}`).then(r => r.json()).then(setCarePlan).catch(() => setStatus('Could not load care plan'))
    // load existing history if any
    fetch(`/history?patient_id=${id}`).then(r => r.json()).then(d => setHistory(d.history || [])).catch(() => {})
  }

  // auto-scroll to bottom when history updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  const handleStop = async () => {
    if (!patientId) return
    const blob = await rec.stop()
    setLoading(true); setStatus('Listening...'); setLastAudioB64('')
    try {
      const form = new FormData()
      form.append('audio', blob, 'patient.webm')
      const res = await fetch(`/patient?patient_id=${patientId}`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      // update local history from backend (source of truth)
      setHistory(h => [...h, { role: 'user', content: data.transcript }, { role: 'assistant', content: data.answer }])
      setLastAudioB64(data.audio_b64)
      setStatus('')
      playAudioB64(data.audio_b64)
    } catch (e: any) { setStatus('Error: ' + e.message) }
    finally { setLoading(false) }
  }

  const handleExplain = async () => {
    if (!patientId) return
    setLoading(true); setStatus('Preparing your summary...'); setLastAudioB64('')
    try {
      const res = await fetch(`/summary?patient_id=${patientId}`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setHistory(h => [...h, { role: 'assistant', content: data.summary_text }])
      setLastAudioB64(data.audio_b64)
      setStatus('')
      playAudioB64(data.audio_b64)
    } catch (e: any) { setStatus('Error: ' + e.message) }
    finally { setLoading(false) }
  }

  const handleClearHistory = async () => {
    if (!patientId) return
    await fetch(`/history?patient_id=${patientId}`, { method: 'DELETE' })
    setHistory([])
  }

  if (!patientId) return <PatientLogin onLogin={handleLogin} />

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-sm">🧑‍⚕️</div>
          <div>
            <span className="font-bold text-white">CareBridge</span>
            <span className="text-emerald-400 text-sm ml-2">Patient</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button onClick={handleClearHistory}
              className="text-slate-500 hover:text-red-400 text-xs bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg transition-all">
              Clear Chat
            </button>
          )}
          <button onClick={() => { setPatientId(null); setCarePlan(null); setHistory([]) }}
            className="text-slate-400 hover:text-white text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition-all">
            Change
          </button>
          <button onClick={onSwitchRole}
            className="text-slate-400 hover:text-white text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition-all">
            Switch Role
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto w-full px-5 py-6 flex flex-col gap-5 flex-1">

        {/* Patient card */}
        {carePlan && (
          <div className="bg-gradient-to-r from-emerald-900/30 to-slate-800/50 border border-emerald-700/30 rounded-2xl px-5 py-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-emerald-600 flex items-center justify-center text-lg font-bold shrink-0">
              {carePlan.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white">{carePlan.name}</p>
              <p className="text-emerald-300/70 text-sm truncate">{carePlan.diagnosis}</p>
            </div>
            <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
              {langName(carePlan.preferredLanguage)}
            </span>
          </div>
        )}

        {/* Explain button */}
        {carePlan && (
          <button onClick={handleExplain} disabled={loading}
            className="w-full group bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold px-6 py-4 rounded-2xl text-base transition-all hover:scale-[1.02] shadow-xl shadow-violet-500/20 flex items-center justify-center gap-3">
            <span className="text-xl group-hover:scale-110 transition-transform">✨</span>
            Explain My Full Discharge Plan
          </button>
        )}

        {/* ── Conversation thread ── */}
        {history.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Conversation</p>
              <span className="text-xs text-slate-600">· {Math.ceil(history.length / 2)} turn{history.length > 2 ? 's' : ''}</span>
            </div>

            <div className="space-y-2">
              {history.map((turn, i) => (
                <div key={i} className={`flex gap-3 ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {turn.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-xs shrink-0 mt-0.5">✦</div>
                  )}
                  <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    turn.role === 'user'
                      ? 'bg-slate-700 text-slate-100 rounded-tr-sm'
                      : 'bg-emerald-900/40 border border-emerald-700/30 text-white rounded-tl-sm'
                  }`}>
                    {turn.content}
                    {/* Play button on last assistant turn */}
                    {turn.role === 'assistant' && i === history.length - 1 && lastAudioB64 && (
                      <button onClick={() => playAudioB64(lastAudioB64)}
                        className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 text-xs mt-2 transition-colors">
                        <span>🔊</span> Play
                      </button>
                    )}
                  </div>
                  {turn.role === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs shrink-0 mt-0.5">
                      {carePlan?.name[0] ?? 'P'}
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>
        )}

        {/* Status */}
        {(loading || status) && (
          <div className={`rounded-xl px-4 py-3 flex items-center gap-3 border ${
            status.startsWith('Error') ? 'bg-red-900/20 border-red-700/40 text-red-300' : 'bg-slate-800/60 border-slate-700/40 text-slate-300'
          }`}>
            {loading && <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />}
            <p className="text-sm">{status || 'Processing...'}</p>
          </div>
        )}

        {/* Mic button — sticky at bottom */}
        {carePlan && (
          <div className="sticky bottom-5">
            <button
              onClick={rec.recording ? handleStop : rec.start}
              disabled={loading}
              className={`w-full flex items-center justify-center gap-4 py-5 rounded-2xl font-bold text-white text-lg transition-all duration-200
                ${rec.recording
                  ? 'bg-red-500/90 shadow-lg shadow-red-500/30 scale-[1.02]'
                  : loading
                  ? 'bg-slate-700/40 opacity-50 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 hover:scale-[1.02] shadow-xl shadow-emerald-500/20'}`}
            >
              <span className="text-3xl">{rec.recording ? '⏹' : '🎙'}</span>
              <span>{rec.recording ? 'Tap to stop' : history.length === 0 ? 'Tap & Speak' : 'Ask another question'}</span>
              {rec.recording && (
                <span className="flex gap-1 items-end h-5">
                  {[0,1,2,3,4].map(i => (
                    <span key={i} className="w-1 bg-white/70 rounded-full animate-bounce"
                      style={{ height: `${8 + (i % 3) * 5}px`, animationDelay: `${i * 0.1}s` }} />
                  ))}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Care plan — collapsed at bottom */}
        {carePlan && (
          <div className="space-y-3 pb-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Your Care Plan</p>
            <CarePlanCard plan={carePlan} />
          </div>
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
