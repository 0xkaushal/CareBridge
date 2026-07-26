import os
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
MOCK_PATIENTS_PATH = "mock_patients.json"

# ── Helpers ───────────────────────────────────────────────────────────────────

def load_prompt(name: str) -> str:
    with open(f"prompts/{name}.txt") as f:
        return f.read()


def load_mock_patients() -> dict:
    with open(MOCK_PATIENTS_PATH) as f:
        data = json.load(f)
    return {p["id"]: p for p in data["patients"]}


def get_patient(patient_id: str) -> dict:
    patients = load_mock_patients()
    if patient_id not in patients:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
    return patients[patient_id]


# ── Sarvam API calls (only used when MOCK_MODE=false) ────────────────────────

def sarvam_stt(audio_bytes: bytes, filename: str, language_code: str = "unknown") -> str:
    files = {"file": (filename, audio_bytes, "audio/wav")}
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
            "temperature": 0.3,
            "max_tokens": 512,
        },
        timeout=60.0,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


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


# ── Mock responses (no API calls) ────────────────────────────────────────────

def mock_answer(question: str, patient: dict) -> str:
    q = question.lower()
    plan = patient

    if any(w in q for w in ["medicine", "tablet", "pill", "drug", "paracetamol", "metformin", "ಮಾತ್ರೆ", "दवाई"]):
        meds = ", ".join(plan.get("medicines", []))
        return f"Your medicines are: {meds}. {plan.get('dosage', '')}"
    if any(w in q for w in ["food", "eat", "diet", "ಆಹಾರ", "खाना"]):
        return plan.get("foodInstructions", "Follow a light and healthy diet.")
    if any(w in q for w in ["avoid", "restrict", "not", "ಬೇಡ", "नहीं"]):
        r = ", ".join(plan.get("restrictions", []))
        return f"Please avoid: {r}"
    if any(w in q for w in ["follow", "visit", "doctor", "appointment", "ಮರಳಿ", "वापस"]):
        return f"Your follow-up is: {plan.get('followUpDate', 'as advised by your doctor')}"
    if any(w in q for w in ["warning", "danger", "emergency", "ಅಪಾಯ", "खतरा"]):
        w = ", ".join(plan.get("warningSigns", []))
        return f"Watch out for these warning signs: {w}"

    # Default: summarise
    meds = ", ".join(plan.get("medicines", []))
    return (
        f"You have been diagnosed with {plan.get('diagnosis', 'a condition')}. "
        f"Your medicines are {meds}. {plan.get('dosage', '')} "
        f"Follow-up: {plan.get('followUpDate', '')}."
    )


def mock_summary(patient: dict) -> str:
    meds = ", ".join(patient.get("medicines", []))
    restrictions = ", ".join(patient.get("restrictions", []))
    warnings = ", ".join(patient.get("warningSigns", []))
    return (
        f"Hello {patient['name']}, here is your discharge summary. "
        f"You were treated for {patient['diagnosis']}. "
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
    """Return all patient IDs and names for the selector."""
    with open(MOCK_PATIENTS_PATH) as f:
        data = json.load(f)
    return [{"id": p["id"], "name": p["name"], "age": p["age"]} for p in data["patients"]]


@app.get("/record")
def get_record(patient_id: str = Query("P001")):
    """Return structured care plan for a patient."""
    return get_patient(patient_id)


@app.post("/doctor")
async def doctor_endpoint(
    patient_id: str = Query("P001"),
    audio: UploadFile = File(...),
):
    """Doctor voice → updates care plan. In mock mode, just returns existing record."""
    patient = get_patient(patient_id)

    if MOCK_MODE:
        return {
            "transcript": "[Mock] Doctor instructions recorded. Care plan loaded from mock data.",
            "care_plan": patient,
        }

    audio_bytes = await audio.read()
    transcript = sarvam_stt(audio_bytes, audio.filename or "doctor.webm", "en-IN")
    system_prompt = load_prompt("extract_care_plan")
    raw_json = sarvam_llm(system_prompt, transcript)
    clean = raw_json.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    care_plan = json.loads(clean)
    return {"transcript": transcript, "care_plan": care_plan}


@app.post("/patient")
async def patient_endpoint(
    patient_id: str = Query("P001"),
    audio: UploadFile = File(...),
):
    """Patient voice question → answer using care plan."""
    patient = get_patient(patient_id)
    language_code = patient.get("preferredLanguage", "kn-IN")

    if MOCK_MODE:
        # Simulate a typed question via filename as a hack — just return a canned answer
        answer = mock_summary(patient)
        return {
            "transcript": "[Mock] Patient question received.",
            "answer": answer,
            "audio_b64": "",
            "language": language_code,
        }

    audio_bytes = await audio.read()
    transcript = sarvam_stt(audio_bytes, audio.filename or "patient.webm", language_code)
    system_prompt = load_prompt("answer_patient").replace("{care_plan}", json.dumps(patient, ensure_ascii=False))
    answer = sarvam_llm(system_prompt, transcript)
    audio_bytes_out = sarvam_tts(answer, language_code)
    return {
        "transcript": transcript,
        "answer": answer,
        "audio_b64": base64.b64encode(audio_bytes_out).decode(),
        "language": language_code,
    }


@app.get("/summary")
def summary_endpoint(patient_id: str = Query("P001")):
    """Return full care plan + spoken summary."""
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

    audio_bytes = sarvam_tts(summary_text, language_code)
    return {
        "care_plan": patient,
        "summary_text": summary_text,
        "audio_b64": base64.b64encode(audio_bytes).decode(),
        "language": language_code,
    }
