// =============================================================
// QuestRehab — server.js
// A tiny Express server with ONE job: take the child's game
// state + today's completed exercises, and ask the AI agent to
// write the next story chapter and design tomorrow's quest.
// =============================================================

import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Simple persistent state (a JSON file on disk) ----------
// For a hackathon this is perfect: no database setup needed.
const DATA_DIR = path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
}

function saveState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---------- The agent's "brain": the system prompt ----------
// This is the most important file in your project. Iterate here!
const SYSTEM_PROMPT = `
You are the Storyteller, a game-master agent for QuestRehab, a game that
turns a child's physical therapy exercises into an adventure story.

You will receive the full GAME STATE as JSON: the hero's name, age, the
chosen story theme, the exercise plan from their physiotherapist, the
history of completed quests, days missed, and a running summary of the
story so far.

Your job, every turn:
1. Write the NEXT CHAPTER of the story (90-140 words, age-appropriate,
   vivid, warm, funny when possible). The chapter must react to what the
   child actually did:
   - Completed exercises = heroic actions in the story (10 heel raises
     might power the hero up the castle stairs).
   - A missed day is NEVER punished. The story pauses kindly: the hero
     rested at camp, a friendly character kept watch. Re-entry is easy
     and welcoming.
2. Design TOMORROW'S QUEST using ONLY exercises from the provided
   exercise plan (never invent new exercises or change reps/duration —
   that is the physiotherapist's job, not yours).
3. Keep long-term story coherence using the running summary, and return
   an UPDATED summary (max 120 words) that includes any new characters
   or plot threads.

Safety rules (non-negotiable):
- Never give medical advice. Never modify the exercise plan.
- If the input mentions pain or injury, the story gently says the hero
  should tell a grown-up and their physiotherapist, and you set the
  "flag_for_adult" field to true.
- Content must be gentle: no violence, no scary peril, no death.

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{
  "chapter_title": "string",
  "story_text": "string",
  "next_quest": { "exercise": "string", "amount": "string", "story_reason": "string" },
  "encouragement": "one short cheerful line",
  "updated_summary": "string",
  "flag_for_adult": false
}
`.trim();

// ---------- Call the model (Azure OpenAI) ----------
async function callAgent(gameState, todaysLog) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  // MOCK MODE: lets you run the game before Azure is set up.
  if (!endpoint || !apiKey || !deployment) {
    return {
      chapter_title: "The Meadow of Beginnings (mock mode)",
      story_text: `${gameState.hero.name} stretched tall in the morning sun. Somewhere beyond the hills, an adventure was waiting — but every hero trains first! (You are in MOCK MODE: add your Azure OpenAI keys to .env to wake up the real Storyteller.)`,
      next_quest: {
        exercise: gameState.exercisePlan[0]?.exercise || "Heel raises",
        amount: gameState.exercisePlan[0]?.amount || "10 reps",
        story_reason: "to climb the Great Oak and spot the path ahead",
      },
      encouragement: "Every hero starts with a single stretch!",
      updated_summary: "The hero began their journey in the meadow.",
      flag_for_adult: false,
    };
  }

  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-06-01`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `GAME STATE:\n${JSON.stringify(gameState, null, 2)}\n\n` +
            `TODAY'S LOG (what the child just completed):\n${JSON.stringify(todaysLog, null, 2)}`,
        },
      ],
      temperature: 0.9,
      max_tokens: 800,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Model call failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const raw = data.choices[0].message.content;
  // Strip accidental markdown fences before parsing.
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

// ---------- API routes ----------

// Create a new hero / new game
app.post("/api/new-game", (req, res) => {
  const { heroName, age, theme, exercisePlan } = req.body;
  const state = {
    hero: { name: heroName, age },
    theme,
    exercisePlan, // [{ exercise: "Heel raises", amount: "10 reps" }, ...]
    chaptersCompleted: 0,
    questLog: [], // history of every completed day
    storySummary: "The adventure has not begun yet.",
    lastPlayedDate: null,
    currentQuest: {
      exercise: exercisePlan[0]?.exercise || "",
      amount: exercisePlan[0]?.amount || "",
      story_reason: "to begin the adventure",
    },
  };
  saveState(state);
  res.json(state);
});

// Get current state (or null if no game yet)
app.get("/api/state", (req, res) => {
  res.json(loadState());
});

// The core agent turn: child completed today's quest -> next chapter
app.post("/api/complete-quest", async (req, res) => {
  try {
    const state = loadState();
    if (!state) return res.status(400).json({ error: "No game started yet." });

    const today = new Date().toISOString().slice(0, 10);
    const todaysLog = {
      date: today,
      completed: req.body.completed, // [{ exercise, amount }]
      childNote: req.body.childNote || "", // optional "how did it feel?"
      daysSinceLastPlay: state.lastPlayedDate
        ? Math.round((new Date(today) - new Date(state.lastPlayedDate)) / 86400000)
        : 0,
    };

    const agentReply = await callAgent(state, todaysLog);

    // Update game state with the agent's output
    state.chaptersCompleted += 1;
    state.questLog.push(todaysLog);
    state.storySummary = agentReply.updated_summary;
    state.lastPlayedDate = today;
    state.currentQuest = agentReply.next_quest;
    saveState(state);

    res.json({ agentReply, state });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Reset (handy during development)
app.post("/api/reset", (req, res) => {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🗺️  QuestRehab running at http://localhost:${PORT}`)
);
