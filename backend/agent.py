"""
CareBridge Voice Agent — Vobiz + Pipecat + Sarvam

This agent handles outbound calls to patients via Vobiz telephony.
Vobiz dials the patient; audio is streamed here via WebSocket.
Sarvam handles STT, LLM (care plan QA), and TTS.

The call flow is handled by main.py:
  POST /call  → Vobiz dials patient
  POST /answer → returns XML pointing at /ws
  WS   /ws    → this bot runs the STT→LLM→TTS pipeline

Usage (standalone pipecat runner — optional alternative):
  python agent.py --transport vobiz --patient-id P001
"""

import os
import json
import argparse
from dotenv import load_dotenv
from loguru import logger
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.sarvam.stt import SarvamSTTService
from pipecat.services.sarvam.tts import SarvamTTSService
from pipecat.services.sarvam.llm import SarvamLLMService
from pipecat.transports.websocket.fastapi import FastAPIWebsocketParams

load_dotenv(override=True)

PATIENTS_PATH = os.path.join(os.path.dirname(__file__), "mock_patients.json")


def load_patient(patient_id: str) -> dict:
    with open(PATIENTS_PATH) as f:
        data = json.load(f)
    for p in data["patients"]:
        if p["id"] == patient_id:
            return p
    raise ValueError(f"Patient {patient_id} not found")


def build_system_prompt(patient: dict) -> str:
    meds = ", ".join(patient.get("medicines", []))
    restrictions = ", ".join(patient.get("restrictions", []))
    warnings = ", ".join(patient.get("warningSigns", []))
    lang = patient.get("preferredLanguage", "hi-IN")
    lang_name = {
        "hi-IN": "Hindi", "kn-IN": "Kannada", "ta-IN": "Tamil",
        "te-IN": "Telugu", "mr-IN": "Marathi", "en-IN": "English",
    }.get(lang, "Hindi")

    return f"""You are CareBridge, a caring hospital discharge voice assistant calling patient {patient['name']}.

IMPORTANT: Speak ONLY in {lang_name}. Every word must be in {lang_name}. Never switch languages.

This is a reminder call about their discharge from hospital.

PATIENT CARE PLAN:
- Name: {patient['name']}, Age: {patient['age']}
- Diagnosis: {patient.get('diagnosis', 'not specified')}
- Medicines: {meds}
- Dosage: {patient.get('dosage', 'as prescribed')}
- Food instructions: {patient.get('foodInstructions', 'none')}
- Restrictions: {restrictions or 'none'}
- Warning signs: {warnings or 'none'}
- Follow-up date: {patient.get('followUpDate', 'as advised')}

YOUR TASK:
1. Greet the patient warmly by name
2. Remind them of their follow-up appointment date
3. Briefly remind them of their medicines and dosage
4. Ask if they have any questions about their care plan
5. Answer ONLY from the care plan above — nothing from general knowledge
6. Keep the call short and warm — under 3 minutes
7. End the call politely after answering questions

RULES:
- Never give medical advice beyond the care plan
- If asked something not in care plan, say the doctor will answer at the follow-up visit
- Keep each response SHORT — this is a phone call, not a lecture
- Speak naturally and slowly — the patient may be elderly
"""


async def bot(runner_args: RunnerArguments, patient_id: str = "P001"):
    patient = load_patient(patient_id)
    language_code = patient.get("preferredLanguage", "hi-IN")
    logger.info(f"Starting call for patient: {patient['name']} ({patient_id}), language: {language_code}")

    transport = await create_transport(
        runner_args,
        {
            # Vobiz streams audio over WebSocket — FastAPIWebsocketParams handles this
            "vobiz": lambda: FastAPIWebsocketParams(
                audio_in_enabled=True, audio_out_enabled=True
            ),
            # Keep a local fallback for testing without a live call
            "local": lambda: FastAPIWebsocketParams(
                audio_in_enabled=True, audio_out_enabled=True
            ),
        },
    )

    stt = SarvamSTTService(
        api_key=os.getenv("SARVAM_API_KEY"),
        settings=SarvamSTTService.Settings(
            model="saaras:v3",
            language=language_code,
        ),
        mode="transcribe",
    )

    tts = SarvamTTSService(
        api_key=os.getenv("SARVAM_API_KEY"),
        settings=SarvamTTSService.Settings(
            model="bulbul:v3",
            voice="priya",
            target_language_code=language_code,
        ),
    )

    llm = SarvamLLMService(
        api_key=os.getenv("SARVAM_API_KEY"),
        settings=SarvamLLMService.Settings(model="sarvam-105b"),
    )

    messages = [{"role": "system", "content": build_system_prompt(patient)}]
    context = LLMContext(messages)
    context_aggregator = LLMContextAggregatorPair(context)

    pipeline = Pipeline([
        transport.input(),
        stt,
        context_aggregator.user(),
        llm,
        tts,
        transport.output(),
        context_aggregator.assistant(),
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=8000,
            audio_out_sample_rate=8000,
        ),
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info(f"Patient connected: {patient['name']}")
        # Trigger the opening greeting immediately
        messages.append({
            "role": "system",
            "content": "The patient has picked up the phone. Start the call now with a warm greeting."
        })
        await task.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Patient disconnected — call ended")
        await task.cancel()

    runner = PipelineRunner(handle_sigint=runner_args.handle_sigint)
    await runner.run(task)


if __name__ == "__main__":
    from pipecat.runner.run import main

    parser = argparse.ArgumentParser()
    parser.add_argument("--patient-id", default="P001", help="Patient ID to load care plan for")
    args, remaining = parser.parse_known_args()

    import sys
    sys.argv = [sys.argv[0]] + remaining

    # Pass patient_id into bot via closure
    import functools
    # Default transport is "vobiz" — Vobiz streams audio via WebSocket to /ws
    main(functools.partial(bot, patient_id=args.patient_id))
