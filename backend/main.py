import os
import json
import base64
import httpx
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
PATIENT_RECORD_PATH = "patient_record.json"

# ── helpers ──────────────────────────────────────────────────────────────────

def load_prompt(name: str) -> str:
    with open(f"prompts/{name}.txt") as f:
        return f.read()


def load_patient_record() -> dict:
    if os.path.exists(PATIENT_RECORD_PATH):
        with open(PATIENT_RECORD_PATH) as f:
            return json.load(f)
    return {}


def save_patient_record(record: dict):
    with open(PATIENT_RECORD_PATH, "w") as f:
        json.dump(record, f, indent=2, ensure_ascii=False)


def sarvam_stt(audio_bytes: bytes, filename: str, language_code: str = "unknown") -> str:
    files = {"file": (filename, audio_bytes, "audio/wav")}
    data = {"model": "saaras:v3", "language_code": language_code}
    resp = httpx.post(
        "https://api.sarvam.ai/speech-to-text",
        headers={"api-subscription-key": SARVAM_API_KEY},
        data=data,
        files=files,
        timeout=120.0,
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


# ── routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/doctor")
async def doctor_endpoint(audio: UploadFile = File(...)):
    """Receive doctor voice, extract structured care plan, save it."""
    audio_bytes = await audio.read()

    # 1. Transcribe doctor audio (English)
    transcript = sarvam_stt(audio_bytes, audio.filename or "doctor.wav", language_code="en-IN")
    if not transcript:
        raise HTTPException(status_code=400, detail="Could not transcribe audio")

    # 2. Extract structured care plan via LLM
    system_prompt = load_prompt("extract_care_plan")
    raw_json = sarvam_llm(system_prompt, transcript)

    # 3. Parse JSON
    try:
        # Strip markdown code fences if present
        clean = raw_json.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        care_plan = json.loads(clean)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail=f"LLM returned invalid JSON: {raw_json}")

    # 4. Save patient record
    save_patient_record(care_plan)

    return {"transcript": transcript, "care_plan": care_plan}


@app.post("/patient")
async def patient_endpoint(audio: UploadFile = File(...)):
    """Receive patient voice question, answer using care plan, return voice response."""
    record = load_patient_record()
    if not record:
        raise HTTPException(status_code=404, detail="No care plan found. Doctor must speak first.")

    audio_bytes = await audio.read()
    language_code = record.get("preferredLanguage", "kn-IN")

    # 1. Transcribe patient audio
    transcript = sarvam_stt(audio_bytes, audio.filename or "patient.wav", language_code=language_code)
    if not transcript:
        raise HTTPException(status_code=400, detail="Could not transcribe audio")

    # 2. Answer using care plan
    system_prompt = load_prompt("answer_patient").replace("{care_plan}", json.dumps(record, ensure_ascii=False))
    answer_text = sarvam_llm(system_prompt, transcript)

    # 3. Convert answer to speech
    audio_response = sarvam_tts(answer_text, language_code)
    audio_b64 = base64.b64encode(audio_response).decode()

    return {
        "transcript": transcript,
        "answer": answer_text,
        "audio_b64": audio_b64,
        "language": language_code,
    }


@app.get("/summary")
def summary_endpoint():
    """Return structured care plan + voice summary."""
    record = load_patient_record()
    if not record:
        raise HTTPException(status_code=404, detail="No care plan found.")

    language_code = record.get("preferredLanguage", "kn-IN")

    # Generate spoken summary
    system_prompt = load_prompt("explain_summary").replace(
        "{care_plan}", json.dumps(record, ensure_ascii=False)
    ).replace("{language}", language_code)

    summary_text = sarvam_llm(system_prompt, "Please explain the discharge plan to the patient.")
    audio_bytes = sarvam_tts(summary_text, language_code)
    audio_b64 = base64.b64encode(audio_bytes).decode()

    return {
        "care_plan": record,
        "summary_text": summary_text,
        "audio_b64": audio_b64,
        "language": language_code,
    }


@app.get("/record")
def get_record():
    """Return raw patient record (for frontend display)."""
    return load_patient_record()
