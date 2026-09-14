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
 *
 * Idempotent — safe to re-run, skips already-cached entries.
 * Processes sequentially to respect ElevenLabs rate limits.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Load env before anything else
import { config } from "dotenv";
config({ path: resolve(process.cwd(), ".env.local") });

// Now import modules that need env vars
import dbConnect from "../src/lib/mongodb";
import { getCachedAudio } from "../src/services/ttsService";
import { getAllPersonas, getSupportedRegions } from "../src/config/voiceConfig";
import type { Persona } from "../src/config/voiceConfig";

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

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║     TTS Cache Pre-Warming Script         ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  // 1. Load question bank
  const bankPath = resolve(process.cwd(), "src/engine/data/questionBank.json");
  const raw = readFileSync(bankPath, "utf-8");
  const questions: BankQuestion[] = JSON.parse(raw);
  console.log(`📚 Loaded ${questions.length} questions from question bank`);

  // 2. Get all persona × region combos
  const personas = getAllPersonas();
  const combos: Array<{ question: BankQuestion; persona: Persona; region: string }> = [];

  for (const persona of personas) {
    const regions = getSupportedRegions(persona);
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
  const startTime = Date.now();

  for (let i = 0; i < totalCombos; i++) {
    const { question, persona, region } = combos[i];

    try {
      const result = await getCachedAudio(question.question, persona, region);

      if (result.cacheHit) {
        cacheHits++;
      } else {
        newSyntheses++;
        // Small delay between new syntheses to respect rate limits (free plan)
        await sleep(500);
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
