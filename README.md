# 🗺️ QuestRehab

**A story-adventure game that turns kids' physical therapy exercises into quests — powered by an adaptive AI Storyteller agent.**

Built for the Microsoft Agents League Hackathon (Creative Apps track).

## The problem

Children in physical therapy (after fractures, surgery, or for conditions like
cerebral palsy) often struggle to stick with daily home exercises. Adherence to
home exercise programs is a well-known challenge in pediatric rehab — the
exercises are repetitive and boring, and nagging makes it worse.

## The idea

QuestRehab wraps the physiotherapist's exact exercise plan in an evolving,
personalized adventure story. An AI **Storyteller agent**:

- Writes a new story chapter after every completed exercise session, where the
  child's real effort becomes the hero's actions in the story.
- Designs tomorrow's quest using **only** the exercises prescribed by the
  physiotherapist (the agent never invents or modifies medical content).
- **Adapts when life happens** — a missed day is never punished. The story
  pauses kindly and welcomes the child back.
- Maintains long-term story coherence across weeks using a running summary
  (persistent agent memory).
- Flags notes about pain for a grown-up and the physiotherapist
  (responsible-AI handoff to humans).

## What makes it agentic (not just a chatbot)

- **Persistent state & memory** across sessions (story summary, quest log, streaks)
- **Multi-step reasoning each turn**: interpret the activity log → react
  narratively → plan the next quest within hard constraints → update memory
- **Guardrails**: the exercise plan is read-only for the agent; pain mentions
  trigger a human-escalation flag

## Quick start

```bash
npm install
cp .env.example .env   # optional — see mock mode below
npm start
# open http://localhost:3000
```

**Mock mode:** with no `.env` keys, the game runs with a canned story response
so you can test the full loop instantly. Add your Azure OpenAI credentials to
`.env` to wake up the real Storyteller.

## Azure setup (5 minutes)

1. In [Microsoft Foundry / Azure AI Foundry](https://ai.azure.com), create a
   project and deploy a chat model (e.g. `gpt-4o-mini` is cheap and fast).
2. Copy the endpoint, API key, and deployment name into `.env`.

## Architecture

```
Browser (public/index.html)
   │  REST
   ▼
Express server (server.js)
   │  state.json  ←— persistent game state (hero, plan, quest log, story memory)
   ▼
Azure OpenAI / Foundry model  ←— Storyteller agent (system prompt = agent policy)
```

## Roadmap (post-hackathon)

- 📷 Camera-based exercise verification with pose detection
- 🖼️ Generated chapter illustrations
- 👨‍⚕️ Physiotherapist dashboard with adherence insights
- 🔊 Read-aloud narration for pre-readers

## Important note

QuestRehab is a motivation and storytelling tool. It does not provide medical
advice, and never alters the exercise plan prescribed by a licensed
physiotherapist.

- [ ] Register before **June 12, 12:00 PM Pacific**
- [ ] Public GitHub repo with this README
- [ ] Record demo video (show: new game → complete quest → adaptive chapter →
      the "missed day" kindness moment → pain note triggering the adult flag)
- [ ] Submit before **June 14, 11:59 PM Pacific**
- [ ] Mention GitHub Copilot usage in the submission (Creative Apps track tool)
