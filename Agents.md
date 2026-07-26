# AGENTS.md

# CareBridge
## AI Voice Discharge Companion

Mission:
Build a demo-winning hackathon project in under 4 hours.

The objective is NOT production quality.

The objective is to maximize the judging rubric:
- Job-to-be-Done
- Memory & Context
- Creativity
- Delight
- Voice Experience

Everything else is secondary.

---

# Project Vision

CareBridge is a multilingual voice assistant that helps patients understand and remember hospital discharge instructions.

The doctor speaks naturally.

The patient speaks in their preferred language.

The system maintains ONE canonical patient care plan.

The patient can return later and ask questions using voice.

The AI answers using the stored discharge plan.

The product is NOT a chatbot.

The product is a Voice Discharge Companion.

---

# Golden Demo

The entire application exists to demonstrate this flow.

Doctor

↓

Provides discharge instructions in English.

↓

AI extracts structured care plan.

↓

Patient speaks in Kannada.

↓

AI answers in Kannada using the stored care plan.

↓

Patient returns later.

↓

AI remembers previous instructions.

↓

AI explains the complete discharge plan using voice.

If a feature does not improve this flow,
DO NOT BUILD IT.

---

# Architecture

Frontend

- React
- Vite
- TailwindCSS

Backend

- FastAPI
- Python

Storage

- SQLite
or
- JSON file

AI

- Sarvam Speech To Text
- Sarvam Text To Speech
- Sarvam LLM / Translation

No additional infrastructure unless absolutely required.

---

# Engineering Philosophy

Prefer

Simple

over

Flexible

Prefer

Working

over

Elegant

Prefer

Hardcoded

over

Half Finished Dynamic

Never build abstractions for future features.

---

# Build Priority

Always follow this order.

Priority 1

Voice Conversation

Priority 2

Structured Patient Memory

Priority 3

Voice Response

Priority 4

Beautiful UI

Priority 5

Animations

Everything else is optional.

---

# Feature Priority

## P0 (Non Negotiable)

Doctor Voice Input

Patient Voice Input

Speech to Text

Structured Patient Record

Context-aware Question Answering

Voice Response

Patient Summary

One Demo Patient

These must all work.

Nothing else matters.

---

## P1

Beautiful discharge summary

Language selector

Play summary button

Status indicators

Loading animations

---

## P2

Multiple patients

Authentication

Database optimization

History

Settings

Hospital Dashboard

Admin Panel

Never implement P2 before P0 is complete.

---

# Explicit Non Goals

Do NOT build

Authentication

Authorization

Admin dashboard

Hospital management

Appointment booking

Doctor dashboard

Notification system

Analytics

Monitoring

QR code

Payments

User management

Cloud deployment

Complex database schema

Anything unrelated to the golden demo.

---

# Memory Model

Maintain ONE canonical patient record.

Example

{
  diagnosis,
  medicines,
  dosage,
  foodInstructions,
  restrictions,
  warningSigns,
  followUpDate,
  preferredLanguage
}

Never store only raw chat history.

Always answer using structured memory.

---

# UI Principles

One page.

Minimal.

Large buttons.

Voice first.

Readable from 2 meters away.

No nested navigation.

No hidden menus.

No sidebars.

The judge should understand the UI within 5 seconds.

---

# Required UI Sections

Header

Doctor Voice

Patient Voice

Patient Care Plan

AI Response

Play Voice Summary Button

Nothing more.

---

# Delight

At least one emotional moment.

When the patient presses

"Explain To Me"

The AI should calmly explain

Diagnosis

Medicines

Restrictions

Follow-up

in the patient's preferred language.

This is the signature moment.

Protect it.

---

# Coding Rules

Use TypeScript on frontend.

Keep components under 250 lines.

Backend routes should remain simple.

Avoid premature optimization.

Keep prompts in dedicated files.

Use environment variables.

Never hardcode API keys.

---

# API Design

POST /doctor

Processes doctor voice.

Updates patient record.

POST /patient

Processes patient question.

Uses patient memory.

Returns answer.

GET /summary

Returns structured discharge summary.

---

# Prompt Rules

LLM should always output structured JSON whenever updating the patient record.

Never rely on parsing natural language afterwards.

Use explicit schemas.

---

# Definition of Done

The project is done when the following demo succeeds.

Doctor

"Take Paracetamol after food twice daily."

↓

Patient

"Can I take it before food?"

↓

AI

"No. Your doctor instructed you to take it after food."

↓

Patient returns.

"I forgot my medicine."

↓

AI remembers.

↓

User clicks

Explain To Me

↓

AI explains the complete discharge plan in the patient's language.

If this works reliably,

STOP BUILDING FEATURES.

Spend remaining time polishing the demo.

---

# Rule for Every Coding Agent

Before implementing any feature ask:

Does this improve the 2-minute demo?

If NO,

do not implement it.

---

# Final Rule

A polished demo beats a feature-rich prototype.

Protect the golden path.

Never sacrifice the golden path for additional functionality.