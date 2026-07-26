import os
import re
import json
import base64
import httpx
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

# ── Patient store (read / write mock_patients.json) ───────────────────────────

def load_all_patients() -> list[dict]:
    with open(PATIENTS_PATH) as f:
        return json.load(f)["patients"]


def get_patient(patient_id: str) -> dict:
    for p in load_all_patients():
        if p["id"] == patient_id:
            return p
    raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")


def save_patient(patient_id: str, updated: dict):
    """Overwrite one patient's record in mock_patients.json."""
    with open(PATIENTS_PATH) as f:
        data = json.load(f)

    for i, p in enumerate(data["patients"]):
        if p["id"] == patient_id:
            # preserve id, name, age, preferredLanguage — merge updated fields on top
            merged = {**p, **updated, "id": p["id"], "name": p["name"], "age": p["age"]}
            data["patients"][i] = merged
            break

    with open(PATIENTS_PATH, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# ── Prompts ───────────────────────────────────────────────────────────────────

def load_prompt(name: str) -> str:
    with open(f"prompts/{name}.txt") as f:
        return f.read()


# ── Sarvam API ────────────────────────────────────────────────────────────────

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


def sarvam_llm(system_prompt: str, user_message: str) -> str:
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
            "max_tokens": 2048,
        },
        timeout=60.0,
    )
    resp.raise_for_status()
    data = resp.json()
    print(f"LLM raw response: {json.dumps(data)[:500]}")
    message = data.get("choices", [{}])[0].get("message", {})
    content = message.get("content") or ""
    # sarvam-30b sometimes puts output in reasoning_content when max_tokens is tight
    if not content:
        content = message.get("reasoning_content") or ""
    if not content:
        raise HTTPException(status_code=500, detail=f"LLM returned empty content. Full response: {data}")
    return content


def sarvam_tts(text: str, language_code: str = "kn-IN") -> bytes:
    resp = httpx.post(
        "https://api.sarvam.ai/text-to-speech",
        headers={"api-subscription-key": SARVAM_API_KEY},
        json={
            "inputs": [text],
            "target_language_code": language_code,
            "speaker": "priya",
            "model": "bulbul:v3",
            "speech_sample_rate": 24000,
            "enable_preprocessing": True,
        },
        timeout=60.0,
    )
    resp.raise_for_status()
    return base64.b64decode(resp.json()["audios"][0])


# ── Mock helpers (no API calls) ───────────────────────────────────────────────

def mock_summary(patient: dict) -> str:
    meds = ", ".join(patient.get("medicines", []))
    restrictions = ", ".join(patient.get("restrictions", []))
    warnings = ", ".join(patient.get("warningSigns", []))
    return (
        f"Hello {patient['name']}, here is your discharge summary. "
        f"You were treated for {patient.get('diagnosis', 'your condition')}. "
        f"Your medicines are {meds}. {patient.get('dosage', '')} "
        f"Regarding food: {patient.get('foodInstructions', '')} "
        f"Please avoid: {restrictions}. "
        f"Watch out for: {warnings}. "
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


@app.post("/doctor")
async def doctor_endpoint(
    patient_id: str = Query("P001"),
    audio: UploadFile = File(...),
):
    """
    Doctor records voice instructions.
    1. Sarvam STT → transcript
    2. Sarvam LLM → structured care plan JSON
    3. Save to mock_patients.json (overwrites that patient's fields)
    4. Return transcript + updated care plan
    """
    patient = get_patient(patient_id)  # verify patient exists
    audio_bytes = await audio.read()

    if MOCK_MODE:
        return {
            "transcript": "[Mock mode] Voice not sent to Sarvam. Set MOCK_MODE=false to enable.",
            "care_plan": patient,
        }

    # 1. Transcribe doctor audio (English)
    transcript = sarvam_stt(audio_bytes, audio.filename or "doctor.webm", language_code="en-IN")
    print(f"Transcribed doctor audio: {transcript[:200]}")
    if not transcript:
        raise HTTPException(status_code=400, detail="Could not transcribe audio. Please speak clearly and try again.")

    # 2. Extract structured care plan from transcript
    system_prompt = load_prompt("extract_care_plan")
    raw_json = sarvam_llm(system_prompt, transcript)

    # 3. Extract JSON — strip fences, then find first {...} block
    if not raw_json:
        raise HTTPException(status_code=500, detail="LLM returned empty response.")

    print(f"LLM raw:\n{raw_json}")
    clean = raw_json.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    # find first complete JSON object in the string
    match = re.search(r'\{.*\}', clean, re.DOTALL)
    if not match:
        raise HTTPException(status_code=500, detail=f"No JSON found in LLM response: {raw_json[:300]}")
    try:
        extracted = json.loads(match.group())
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"JSON parse error: {e}. Raw: {raw_json[:300]}")

    # 4. Write back to mock_patients.json
    save_patient(patient_id, extracted)

    # 5. Return fresh record
    updated_patient = get_patient(patient_id)
    return {"transcript": transcript, "care_plan": updated_patient}


@app.post("/patient")
async def patient_endpoint(
    patient_id: str = Query("P001"),
    audio: UploadFile = File(...),
):
    """Patient voice question → answer using stored care plan."""
    patient = get_patient(patient_id)
    language_code = patient.get("preferredLanguage", "kn-IN")

    if MOCK_MODE:
        return {
            "transcript": "[Mock mode] Voice not sent to Sarvam.",
            "answer": mock_summary(patient),
            "audio_b64": "",
            "language": language_code,
        }

    audio_bytes = await audio.read()
    transcript = sarvam_stt(audio_bytes, audio.filename or "patient.webm", language_code=language_code)
    if not transcript:
        raise HTTPException(status_code=400, detail="Could not transcribe your question. Please try again.")

    system_prompt = load_prompt("answer_patient").replace("{care_plan}", json.dumps(patient, ensure_ascii=False))
    answer = sarvam_llm(system_prompt, transcript)
    audio_out = sarvam_tts(answer, language_code)

    return {
        "transcript": transcript,
        "answer": answer,
        "audio_b64": base64.b64encode(audio_out).decode(),
        "language": language_code,
    }


@app.get("/summary")
def summary_endpoint(patient_id: str = Query("P001")):
    """Full discharge summary as text + voice."""
    patient = get_patient(patient_id)
    language_code = patient.get("preferredLanguage", "kn-IN")
    summary_text = mock_summary(patient)

    if MOCK_MODE:
        return {
            "care_plan": patient,
            "summary_text": summary_text,
            "audio_b64": "",
            "language": language_code,
        }

    audio_out = sarvam_tts(summary_text, language_code)
    return {
        "care_plan": patient,
        "summary_text": summary_text,
        "audio_b64": base64.b64encode(audio_out).decode(),
        "language": language_code,
    }
