import os
import re
import json
import base64
import asyncio
import httpx
from functools import partial
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY", "")
MOCK_MODE = os.environ.get("MOCK_MODE", "true").lower() == "true"
PATIENTS_PATH = "mock_patients.json"

# ── In-memory conversation history ───────────────────────────────────────────
# Keyed by patient_id. Each entry is a list of {role, content} dicts.
# Cleared when the server restarts (intentional — session-scoped memory).

conversation_store: dict[str, list[dict]] = {}

MAX_HISTORY = 10  # keep last N turns (user+assistant pairs) to stay within token budget


def get_history(patient_id: str) -> list[dict]:
    return conversation_store.get(patient_id, [])


def append_history(patient_id: str, role: str, content: str):
    if patient_id not in conversation_store:
        conversation_store[patient_id] = []
    conversation_store[patient_id].append({"role": role, "content": content})
    # trim to last MAX_HISTORY messages
    if len(conversation_store[patient_id]) > MAX_HISTORY * 2:
        conversation_store[patient_id] = conversation_store[patient_id][-(MAX_HISTORY * 2):]


def clear_history(patient_id: str):
    conversation_store[patient_id] = []


# ── Patient store ─────────────────────────────────────────────────────────────

def load_all_patients() -> list[dict]:
    with open(PATIENTS_PATH) as f:
        return json.load(f)["patients"]


def get_patient(patient_id: str) -> dict:
    for p in load_all_patients():
        if p["id"] == patient_id:
            return p
    raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")


def save_patient(patient_id: str, updated: dict):
    with open(PATIENTS_PATH) as f:
        data = json.load(f)
    for i, p in enumerate(data["patients"]):
        if p["id"] == patient_id:
            merged = {**p, **updated, "id": p["id"], "name": p["name"], "age": p["age"], "preferredLanguage": p["preferredLanguage"]}
            data["patients"][i] = merged
            break
    with open(PATIENTS_PATH, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# ── Prompts ───────────────────────────────────────────────────────────────────

def load_prompt(name: str) -> str:
    with open(f"prompts/{name}.txt") as f:
        return f.read()


# ── Sarvam STT ────────────────────────────────────────────────────────────────

def sarvam_stt(audio_bytes: bytes, filename: str, language_code: str = "en-IN") -> str:
    files = {"file": (filename, audio_bytes, "audio/webm")}
    data = {"model": "saaras:v3", "language_code": language_code}
    resp = httpx.post(
        "https://api.sarvam.ai/speech-to-text",
        headers={"api-subscription-key": SARVAM_API_KEY},
        data=data, files=files, timeout=120.0,
    )
    resp.raise_for_status()
    return resp.json().get("transcript", "")


# ── Sarvam LLM — simple (no history) ─────────────────────────────────────────

def sarvam_llm(system_prompt: str, user_message: str) -> str:
    """Single-turn LLM call. Used for care plan extraction and summary."""
    resp = httpx.post(
        "https://api.sarvam.ai/v1/chat/completions",
        headers={"api-subscription-key": SARVAM_API_KEY},
        json={
            "model": "sarvam-30b",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.1,
        },
        timeout=60.0,
    )
    resp.raise_for_status()
    data = resp.json()
    message = data.get("choices", [{}])[0].get("message", {})
    content = message.get("content") or message.get("reasoning_content") or ""
    if not content:
        raise HTTPException(status_code=500, detail=f"LLM empty response: {data}")
    return content


# ── Sarvam LLM — with conversation history ────────────────────────────────────

def sarvam_llm_with_history(system_prompt: str, history: list[dict], new_user_message: str) -> str:
    """
    Multi-turn LLM call.
    - system_prompt: grounded care plan context (never changes per session)
    - history: list of previous {role, content} turns
    - new_user_message: the latest patient question
    """
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": new_user_message})

    print(f"[LLM] Sending {len(messages)} messages ({len(history)} history turns)")

    resp = httpx.post(
        "https://api.sarvam.ai/v1/chat/completions",
        headers={"api-subscription-key": SARVAM_API_KEY},
        json={
            "model": "sarvam-105b",  # better instruction-following, no reasoning bleed
            "messages": messages,
            "temperature": 0.2
        },
        timeout=60.0,
    )
    resp.raise_for_status()
    data = resp.json()
    message = data.get("choices", [{}])[0].get("message", {})
    content = message.get("content") or ""

    # Strip any chain-of-thought reasoning that leaks through
    # The actual answer always comes after the last numbered step or "**" block
    if content:
        # If model leaked reasoning (contains "Analyze" or numbered steps), extract last paragraph
        if any(marker in content for marker in ["**Analyze", "1.  **", "2.  **", "Consult the Care"]):
            # grab everything after the last '---' or last double newline block
            parts = re.split(r'\n{2,}|\*\*Final Answer\*\*:?|---', content)
            # take the last non-empty part that looks like a real answer (not a header)
            for part in reversed(parts):
                part = part.strip().lstrip('*').strip()
                if len(part) > 20 and not part.startswith(('1.', '2.', '3.', 'Analyze', 'Consult', 'Synth')):
                    content = part
                    break

    if not content:
        raise HTTPException(status_code=500, detail=f"LLM empty response: {data}")
    return content


# ── Sarvam TTS ────────────────────────────────────────────────────────────────

def sarvam_tts(text: str, language_code: str = "hi-IN") -> bytes:
    sentences = [s.strip() for s in re.split(r'(?<=[।.!?])\s+', text) if s.strip()]
    chunks, current = [], ""
    for sentence in sentences:
        if len(current) + len(sentence) + 1 <= 450:
            current = (current + " " + sentence).strip()
        else:
            if current:
                chunks.append(current)
            current = sentence[:450]
    if current:
        chunks.append(current)
    if not chunks:
        chunks = [text[:450]]

    audio_parts = []
    for chunk in chunks:
        resp = httpx.post(
            "https://api.sarvam.ai/text-to-speech",
            headers={"api-subscription-key": SARVAM_API_KEY},
            json={
                "inputs": [chunk],
                "target_language_code": language_code,
                "speaker": "priya",
                "model": "bulbul:v3",
                "speech_sample_rate": 24000,
                "enable_preprocessing": True,
            },
            timeout=60.0,
        )
        resp.raise_for_status()
        audio_parts.append(base64.b64decode(resp.json()["audios"][0]))
    return b"".join(audio_parts)


# ── Strip reasoning leakage from LLM output ──────────────────────────────────

def clean_llm_answer(text: str) -> str:
    """
    Remove chain-of-thought reasoning that leaks into the content field.
    The model sometimes outputs numbered analysis steps before the actual answer.
    We extract only the final spoken answer.
    """
    if not text:
        return text

    # If it contains reasoning markers, extract the last clean paragraph
    reasoning_markers = [
        "**Analyze", "1.  **", "2.  **", "3.  **",
        "Consult the Care", "Synthesize", "**Final Answer",
        "The user's question", "This translates to",
    ]
    if any(marker in text for marker in reasoning_markers):
        # Split on double newlines or section markers
        parts = re.split(r'\n{2,}', text)
        # Walk from the end, find first part that looks like a real answer
        for part in reversed(parts):
            part = part.strip()
            # Strip markdown bold markers
            part = re.sub(r'\*+', '', part).strip()
            # Skip reasoning headers and short fragments
            if (len(part) > 15
                and not re.match(r'^\d+\.', part)
                and not any(m.replace('**','') in part for m in reasoning_markers)):
                print(f"[clean_llm_answer] Extracted: {part[:100]}")
                return part

    # No reasoning detected — return as-is but strip markdown
    return re.sub(r'\*+', '', text).strip()


# ── Async wrappers (run blocking httpx in thread pool) ───────────────────────

async def async_stt(audio_bytes: bytes, filename: str, language_code: str) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(sarvam_stt, audio_bytes, filename, language_code))

async def async_llm(system_prompt: str, user_message: str) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(sarvam_llm, system_prompt, user_message))

async def async_llm_with_history(system_prompt: str, history: list, user_message: str) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(sarvam_llm_with_history, system_prompt, history, user_message))

async def async_tts(text: str, language_code: str) -> bytes:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(sarvam_tts, text, language_code))


# ── Mock helpers ──────────────────────────────────────────────────────────────

def mock_summary(patient: dict) -> str:
    meds = ", ".join(patient.get("medicines", []))
    restrictions = ", ".join(patient.get("restrictions", []))
    warnings = ", ".join(patient.get("warningSigns", []))
    return (
        f"Hello {patient['name']}, here is your discharge summary. "
        f"You were treated for {patient.get('diagnosis', 'your condition')}. "
        f"Your medicines are {meds}. {patient.get('dosage', '')} "
        f"Regarding food: {patient.get('foodInstructions', '')} "
        f"Please avoid: {restrictions}. Watch out for: {warnings}. "
        f"Your next appointment is: {patient.get('followUpDate', '')}. "
        f"Take care and get well soon."
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "mock_mode": MOCK_MODE}


@app.get("/patients")
def list_patients():
    return [{"id": p["id"], "name": p["name"], "age": p["age"]} for p in load_all_patients()]


@app.get("/record")
def get_record(patient_id: str = Query("P001")):
    return get_patient(patient_id)


@app.get("/history")
def get_history_endpoint(patient_id: str = Query("P001")):
    """Return conversation history for a patient."""
    return {"patient_id": patient_id, "history": get_history(patient_id)}


@app.delete("/history")
def clear_history_endpoint(patient_id: str = Query("P001")):
    """Clear conversation history (new session)."""
    clear_history(patient_id)
    return {"status": "cleared", "patient_id": patient_id}


@app.post("/doctor")
async def doctor_endpoint(patient_id: str = Query("P001"), audio: UploadFile = File(...)):
    patient = get_patient(patient_id)
    audio_bytes = await audio.read()

    if MOCK_MODE:
        return {"transcript": "[Mock mode] Set MOCK_MODE=false to enable voice.", "care_plan": patient}

    transcript = await async_stt(audio_bytes, audio.filename or "doctor.webm", language_code="en-IN")
    print(f"[Doctor STT] {transcript[:200]}")
    if not transcript:
        raise HTTPException(status_code=400, detail="Could not transcribe. Please speak clearly.")

    system_prompt = load_prompt("extract_care_plan")
    raw_json = await async_llm(system_prompt, transcript)

    print(f"[Doctor LLM raw] {raw_json[:400]}")
    clean = raw_json.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    match = re.search(r'\{.*\}', clean, re.DOTALL)
    if not match:
        raise HTTPException(status_code=500, detail=f"No JSON in LLM response: {raw_json[:300]}")
    try:
        extracted = json.loads(match.group())
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"JSON parse error: {e}")

    save_patient(patient_id, extracted)

    # Clear old conversation history when care plan updates — fresh context
    clear_history(patient_id)

    return {"transcript": transcript, "care_plan": get_patient(patient_id)}


@app.post("/patient")
async def patient_endpoint(patient_id: str = Query("P001"), audio: UploadFile = File(...)):
    """
    Patient voice question → answer with full conversation memory.

    Flow:
    1. STT: transcribe patient audio
    2. Load care plan (system context — never drifts)
    3. Load conversation history for this patient
    4. Send system + history + new question to LLM
    5. Append question + answer to history
    6. TTS: speak answer in patient's language
    """
    patient = get_patient(patient_id)
    language_code = patient.get("preferredLanguage", "hi-IN")

    if MOCK_MODE:
        return {
            "transcript": "[Mock mode] Voice not sent to Sarvam.",
            "answer": mock_summary(patient),
            "audio_b64": "",
            "language": language_code,
            "history": get_history(patient_id),
        }

    # 1. Transcribe
    audio_bytes = await audio.read()
    transcript = await async_stt(audio_bytes, audio.filename or "patient.webm", language_code=language_code)
    if not transcript:
        raise HTTPException(status_code=400, detail="Could not transcribe. Please try again.")
    print(f"[Patient STT] {transcript}")

    # 2. Build grounded system prompt
    system_prompt = load_prompt("answer_patient").replace(
        "{care_plan}", json.dumps(patient, ensure_ascii=False, indent=2)
    )

    # 3. Get history
    history = get_history(patient_id)

    # 4. LLM with memory
    raw_answer = await async_llm_with_history(system_prompt, history, transcript)
    print(f"[Patient LLM raw] {raw_answer}")
    answer = clean_llm_answer(raw_answer)
    print(f"[Patient LLM clean] {answer}")

    # 5. Save to history
    append_history(patient_id, "user", transcript)
    append_history(patient_id, "assistant", answer)

    # 6. TTS
    audio_out = await async_tts(answer, language_code)

    return {
        "transcript": transcript,
        "answer": answer,
        "audio_b64": base64.b64encode(audio_out).decode(),
        "language": language_code,
        "turn": len(get_history(patient_id)) // 2,  # which turn number this is
    }


@app.get("/summary")
async def summary_endpoint(patient_id: str = Query("P001")):
    print(f"[Summary] START — patient_id={patient_id}")
    patient = get_patient(patient_id)
    language_code = patient.get("preferredLanguage", "hi-IN")
    print(f"[Summary] Patient loaded: {patient.get('name')} | language: {language_code}")

    if MOCK_MODE:
        print("[Summary] MOCK MODE — returning mock summary")
        summary_text = mock_summary(patient)
        return {"care_plan": patient, "summary_text": summary_text, "audio_b64": "", "language": language_code}

    print("[Summary] Loading prompt...")
    system_prompt = (
        load_prompt("explain_summary")
        .replace("{care_plan}", json.dumps(patient, ensure_ascii=False))
        .replace("{language}", language_code)
    )
    print(f"[Summary] Prompt ready ({len(system_prompt)} chars) — calling LLM...")

    summary_text = await async_llm(system_prompt, "Please explain the full discharge plan to the patient now.")
    print(f"[Summary] LLM done — response length: {len(summary_text)} chars")
    print(f"[Summary] LLM text: {summary_text[:200]}")

    print(f"[Summary] Calling TTS — language: {language_code}...")
    audio_out = await async_tts(summary_text, language_code)
    print(f"[Summary] TTS done — audio size: {len(audio_out)} bytes")

    print("[Summary] DONE — returning response")
    return {
        "care_plan": patient,
        "summary_text": summary_text,
        "audio_b64": base64.b64encode(audio_out).decode(),
        "language": language_code,
    }
