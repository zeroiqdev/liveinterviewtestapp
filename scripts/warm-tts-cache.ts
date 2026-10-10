/**
 * TTS Cache Pre-Warming Script
 *
 * Reads the question bank and crosses every question with each supported
 * (persona, region) combination, running each through getCachedAudio.
 *
 * Usage:
 *   npm run warm-tts-cache               # Full warm
 *   npm run warm-tts-cache -- --dry-run   # Count combos without synthesizing
 *   npm run warm-tts-cache -- --limit 10  # Warm only first N combos
 *   npm run warm-tts-cache -- --persona recruiter --region nigeria  # One voice only
 *
 * Idempotent — safe to re-run, skips already-cached entries.
 * Processes sequentially to respect ElevenLabs rate limits.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Load env before anything else
import { config } from "dotenv";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") }); // fills anything .env.local did not set

// Now import modules that need env vars
import dbConnect from "../src/lib/mongodb";
import { getCachedAudio, resetVoiceCooldowns } from "../src/services/ttsService";
import { getAllPersonas, getSupportedRegions, getVoiceForContext } from "../src/config/voiceConfig";
import type { Persona } from "../src/config/voiceConfig";
import { CONVERSATIONAL_FILLERS } from "../src/config/fillerConfig";
import { OPENERS, openerFamily, openingGreeting, openingIntro } from "../src/engine/openers";
import { KNOWN_ROLES } from "../src/engine/roleMapping";
import { cleanSpokenAudioText } from "../src/engine/conversationalEngine";

// ─── Types ──────────────────────────────────────────────────────────

interface BankQuestion {
  id: string;
  role_family: string;
  question: string;
  category: string;
}

// ─── CLI args ───────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit"));
const limit = limitArg ? parseInt(limitArg.split("=")[1] || args[args.indexOf("--limit") + 1] || "0", 10) : 0;

function stringArg(name: string): string | null {
  const arg = args.find((a) => a.startsWith(`--${name}`));
  if (!arg) return null;
  return arg.split("=")[1] || args[args.indexOf(arg) + 1] || null;
}
// Narrow the warm to one voice, e.g. --persona recruiter --region nigeria
const personaFilter = stringArg("persona");
const regionFilter = stringArg("region");

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║     TTS Cache Pre-Warming Script         ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  // 1. Load question bank
  const bankPath = resolve(process.cwd(), "src/engine/data/questionBank.json");
  const raw = readFileSync(bankPath, "utf-8");
  const bankQuestions: BankQuestion[] = JSON.parse(raw);
  console.log(`📚 Loaded ${bankQuestions.length} questions from question bank`);
  // Fillers first: they only ever play from cache, so they matter most.
  // The welcome's fixed parts: the nameless greeting, each role's intro for
  // each of its rounds (and for a general round), and every opening question.
  // Spoken text is cleaned exactly as the session route cleans it.
  const opening = new Set<string>([openingGreeting(null)]);
  for (const family of Object.values(OPENERS)) {
    opening.add(family.general);
    for (const round of family.rounds) opening.add(round.opener);
  }
  for (const role of KNOWN_ROLES) {
    const family = OPENERS[openerFamily(null, role)];
    opening.add(openingIntro({ role }));
    for (const round of family.rounds) opening.add(openingIntro({ role, focus: round.focus }));
  }
  const openingLines = [...opening].map((text) => cleanSpokenAudioText(text)).filter(Boolean);
  const questions: BankQuestion[] = [
    ...CONVERSATIONAL_FILLERS.map((text) => ({ question: text }) as BankQuestion),
    ...openingLines.map((text) => ({ question: text }) as BankQuestion),
    ...bankQuestions,
  ];
  console.log(`💬 Plus ${CONVERSATIONAL_FILLERS.length} conversational fillers and ${openingLines.length} welcome lines`);

  // 2. Get all persona × region combos
  const personas = getAllPersonas();
  const combos: Array<{ question: BankQuestion; persona: Persona; region: string }> = [];

  for (const persona of personas) {
    if (personaFilter && persona !== personaFilter) continue;
    const regions = getSupportedRegions(persona).filter((r) => !regionFilter || r === regionFilter);
    for (const region of regions) {
      for (const question of questions) {
        combos.push({ question, persona, region });
      }
    }
  }

  const totalCombos = limit > 0 ? Math.min(limit, combos.length) : combos.length;
  console.log(
    `🎯 Total combos: ${combos.length} (${questions.length} questions × ${personas.length} personas × ${getSupportedRegions(personas[0]).length} regions)`
  );
  if (limit > 0) {
    console.log(`⚠️  Limited to first ${totalCombos} combos`);
  }
  console.log();

  if (isDryRun) {
    console.log("🏜️  DRY RUN — no synthesis will be performed.");
    console.log(`   Would process ${totalCombos} combos.`);
    console.log();

    // Show sample combos
    for (let i = 0; i < Math.min(5, totalCombos); i++) {
      const c = combos[i];
      console.log(
        `   [${i + 1}] ${c.persona}/${c.region}: "${c.question.question.slice(0, 60)}..."`
      );
    }
    if (totalCombos > 5) {
      console.log(`   ... and ${totalCombos - 5} more`);
    }

    process.exit(0);
  }

  // 3. Connect to database
  console.log("🔌 Connecting to MongoDB...");
  await dbConnect();
  console.log("✅ Connected.");
  console.log();

  // 4. Process sequentially
  let cacheHits = 0;
  let newSyntheses = 0;
  let errors = 0;
  let backupInARow = 0;
  const startTime = Date.now();

  for (let i = 0; i < totalCombos; i++) {
    const { question, persona, region } = combos[i];

    const clipStart = Date.now();
    try {
      const result = await getCachedAudio(question.question, persona, region);

      // The main voice failed and its backup answered. That keeps live
      // interviews talking, but here nothing new was recorded in the main
      // voice. Usually a per-minute limit: wait it out and retry this clip;
      // give up after several tries (e.g. a daily quota or no credit left).
      if (result.voiceLabel !== getVoiceForContext(persona, region).label) {
        if (++backupInARow >= 5) {
          console.error(`\n🛑 ${getVoiceForContext(persona, region).label} still isn't available after ${backupInARow} tries (quota or billing). Stopped at ${i + 1}/${totalCombos}; run again later to continue.`);
          break;
        }
        console.log(`⏳ ${getVoiceForContext(persona, region).label} is unavailable (rate limit or credit) — waiting 65s, then retrying (${backupInARow}/5)...`);
        await sleep(65_000);
        resetVoiceCooldowns();
        i--;
        continue;
      }
      backupInARow = 0;

      if (result.cacheHit) {
        cacheHits++;
      } else {
        newSyntheses++;
        // Stay under the provider's per-minute limit. Gemini allows 10
        // requests a minute on Tier 1: at most one every 6.5s. Spitch allows
        // 180 seconds of speech a minute: record at most ~120s a minute (half
        // a second per second of speech, ~2.6 words a second), leaving the
        // rest for live interviews running meanwhile.
        const provider = getVoiceForContext(persona, region).provider;
        const spokenSeconds = question.question.split(/\s+/).length / 2.6;
        const minGapMs = provider === "gemini" ? 6500 : provider === "spitch" ? spokenSeconds * 500 : 500;
        await sleep(Math.max(500, minGapMs - (Date.now() - clipStart)));
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `❌ [${i + 1}/${totalCombos}] Error for ${persona}/${region}: ${msg}`
      );

      // If rate limited, wait longer
      if (msg.includes("429") || msg.includes("Rate limit")) {
        console.log("⏳ Rate limited — waiting 30s...");
        await sleep(30_000);
      }
    }

    // Progress log every 50 items
    if ((i + 1) % 50 === 0 || i + 1 === totalCombos) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `📊 [${i + 1}/${totalCombos}] ` +
        `Hits: ${cacheHits} | New: ${newSyntheses} | Errors: ${errors} | ${elapsed}s elapsed`
      );
    }
  }

  // 5. Summary
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log();
  console.log("╔══════════════════════════════════════════╗");
  console.log("║              COMPLETE                    ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Total combos:   ${String(totalCombos).padStart(6)}               ║`);
  console.log(`║  Cache hits:     ${String(cacheHits).padStart(6)}               ║`);
  console.log(`║  New syntheses:  ${String(newSyntheses).padStart(6)}               ║`);
  console.log(`║  Errors:         ${String(errors).padStart(6)}               ║`);
  console.log(`║  Time:         ${totalElapsed.padStart(7)}s              ║`);
  console.log("╚══════════════════════════════════════════╝");

  process.exit(errors > 0 ? 1 : 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
