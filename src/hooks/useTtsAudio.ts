"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { CONVERSATIONAL_FILLERS, getContextualFiller, type FillerLength } from "@/config/fillerConfig";

export interface PlayTtsOptions {
  persona?: "recruiter" | "coach";
  jobRegion?: string;
  /** Use browser speech after a short TTS wait instead of leaving a turn silent. */
  preferImmediate?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface PlayFillerOptions extends PlayTtsOptions {
  /** Recent candidate turns give a brief acknowledgement optional context. */
  recentCandidateTurns?: string[];
  /** Longer bridges are used only when the next response is still unresolved. */
  length?: FillerLength;
}

// Natural speed. Speeding playback up also shortened the pauses at punctuation;
// pacing is set at synthesis time instead (see voiceConfig prosody).
const TTS_PLAYBACK_SPEED = 1.0;

// How long to wait for real TTS before falling back to browser speech. The
// browser voice sounds different from the interviewer, so it is a last resort
// for synthesis that is genuinely unavailable, not merely slow: switching at
// 3.5s gave long or cold lines (often the opening question) a second voice.
const TTS_FALLBACK_WAIT_MS = 15000;

function fallbackBrowserSpeech(
  text: string,
  onStart?: () => void,
  onEnd?: () => void
) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd?.();
    return;
  }

  // Strip emotion tags like [happy], [slow], [thoughtful] so browser speech doesn't read brackets
  const cleanedText = text.replace(/\[[a-zA-Z0-9_\s]+\]/g, "").replace(/\*\*(.*?)\*\*/g, "$1").trim();
  if (!cleanedText) {
    onEnd?.();
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[voice] Browser speech fallback (synthesized audio unavailable or too slow)");
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(cleanedText);
  const voices = window.speechSynthesis.getVoices();

  // Try to find a Nigerian or natural English voice
  const preferredVoice =
    voices.find((v) => v.lang === "en-NG" || v.lang.includes("NG") || v.name.includes("Nigeria")) ||
    voices.find((v) => v.name.includes("Google UK English Male") || v.name.includes("Natural")) ||
    voices.find((v) => v.lang.startsWith("en"));

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  utterance.rate = TTS_PLAYBACK_SPEED;

  // Chrome sometimes never fires onend (notably for utterances over ~15s, or
  // after a cancel/speak race), which used to leave the interview stuck on
  // "speaking". Report the end exactly once, from whichever signal comes first.
  const isChromium = /Chrome\//.test(navigator.userAgent);
  let ended = false;
  let started = false;
  let quietPolls = 0;
  const finish = () => {
    if (ended) return;
    ended = true;
    clearInterval(monitor);
    onEnd?.();
  };
  const monitor = setInterval(() => {
    const synth = window.speechSynthesis;
    // Keep Chrome's synthesizer from silently timing out on long utterances.
    if (isChromium && synth.speaking && !synth.paused) {
      synth.pause();
      synth.resume();
    }
    if (!started || synth.paused) return;
    quietPolls = synth.speaking || synth.pending ? 0 : quietPolls + 1;
    if (quietPolls >= 2) finish();
  }, 5000);

  utterance.onstart = () => {
    started = true;
    onStart?.();
  };
  utterance.onend = finish;
  utterance.onerror = finish;

  window.speechSynthesis.speak(utterance);
}

// In-memory cache of pre-fetched and synthesized TTS audio URLs
const ttsUrlCache = new Map<string, { audioUrl: string; voiceLabel?: string }>();
const ttsPrefetchInFlight = new Set<string>();

/*
 * Pre-loaded audio elements, keyed by URL. Creating `new Audio(url)` at play
 * time downloads the clip right then (~0.5s from storage), which was the gap
 * after fillers and between sentences. Clips are loaded into elements ahead
 * of time and played from here; a used one is replaced with a fresh preload
 * so lines that repeat (fillers) stay instant.
 */
const AUDIO_POOL_MAX = 80;
const audioPool = new Map<string, HTMLAudioElement>();

export function preloadAudio(url: string) {
  if (typeof window === "undefined" || !url || audioPool.has(url)) return;
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = url;
  audio.load();
  audioPool.set(url, audio);
  if (audioPool.size > AUDIO_POOL_MAX) {
    const oldest = audioPool.keys().next().value;
    if (oldest) audioPool.delete(oldest);
  }
}

/**
 * Resolves once the clip is buffered enough to play through (or on error or
 * timeout, so a slow network can't block anything that waits on it).
 */
export function waitForAudio(url: string, timeoutMs: number): Promise<void> {
  if (typeof window === "undefined" || !url) return Promise.resolve();
  preloadAudio(url);
  const audio = audioPool.get(url);
  if (!audio || audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      audio.removeEventListener("canplaythrough", done);
      audio.removeEventListener("error", done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    audio.addEventListener("canplaythrough", done);
    audio.addEventListener("error", done);
  });
}

/** True when the clip is pre-loaded and buffered enough to start right away. */
export function isAudioReady(url: string): boolean {
  const audio = audioPool.get(url);
  return Boolean(audio && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA);
}

/** A ready-to-play element for the URL: the pre-loaded one if available. */
function takeAudio(url: string): HTMLAudioElement {
  const pooled = audioPool.get(url);
  audioPool.delete(url);
  // Keep the next play of this clip instant too (fillers repeat).
  preloadAudio(url);
  if (pooled) {
    pooled.currentTime = 0;
    return pooled;
  }
  return new Audio(url);
}

/**
 * Voice region fixed for the current interview (set from the session). While
 * set, every clip — questions, prefetches, replays — uses this one voice.
 */
let lockedVoiceRegion: string | null = null;

export function lockVoiceRegion(region: string | null) {
  lockedVoiceRegion = region;
}

function voiceRegion(): string {
  return lockedVoiceRegion || getStoredJobRegion();
}

export function getStoredJobRegion(): string {
  if (typeof window !== "undefined") {
    try {
      const loc = localStorage.getItem("useladder_user_location");
      if (loc) {
        const parsed = JSON.parse(loc);
        return parsed.country || parsed.continent || "nigeria";
      }
    } catch {
      // Ignore
    }
  }
  return "nigeria";
}

/**
 * useTtsAudio Hook
 *
 * Plays AI interviewer speech via the ElevenLabs + Cloudflare R2 + MongoDB TTS pipeline.
 * Uses playId concurrency guards to strictly prevent multiple simultaneous audio streams.
 */
export function useTtsAudio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [voiceLabel, setVoiceLabel] = useState<string | null>(null);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [activeText, setActiveText] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Clips of the last multi-sentence line, for "Replay".
  const lastSegmentsRef = useRef<Array<{ text: string; audioUrl?: string }> | null>(null);
  // playPipelinedSpeech is defined below replay; reach it through a ref.
  const playPipelinedRef = useRef<
    ((segments: Array<{ text: string; audioUrl?: string }>, options?: PlayTtsOptions) => Promise<void>) | null
  >(null);
  const currentPlayIdRef = useRef<number>(0);
  // Tracks what pauseAudio actually paused so resumeAudio never restarts an
  // ended clip (play() on an ended element replays it from the start).
  const pausedSourceRef = useRef<"element" | "speech" | null>(null);

  const stopAudio = useCallback(() => {
    // Invalidate any in-flight requests
    currentPlayIdRef.current++;
    pausedSourceRef.current = null;

    if (audioRef.current) {
      audioRef.current.onplay = null;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setIsLoadingAudio(false);
  }, []);

  /**
   * Pre-fetches TTS audio in the background for predicted upcoming interview questions.
   * Caches response URLs in memory and primes the browser's native HTTP/media cache.
   */
  const prefetchTts = useCallback(
    (
      texts: string[],
      options?: { persona?: "recruiter" | "coach"; jobRegion?: string; turnId?: string }
    ): Promise<void> => {
      if (typeof window === "undefined" || !texts || texts.length === 0) return Promise.resolve();
      const pending: Promise<unknown>[] = [];
      const persona = options?.persona || "recruiter";
      const jobRegion = options?.jobRegion || voiceRegion();

      texts.forEach((rawText) => {
        const text = rawText?.trim();
        if (!text) return;
        const cacheKey = `${persona}:${jobRegion}:${text}`;
        if (ttsUrlCache.has(cacheKey) || ttsPrefetchInFlight.has(cacheKey)) return;

        ttsPrefetchInFlight.add(cacheKey);

        const request = fetch("/api/tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(options?.turnId ? { "x-onscript-turn-id": options.turnId } : {}),
          },
          body: JSON.stringify({ text, persona, jobRegion }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`Prefetch status ${res.status}`);
            return res.json();
          })
          .then((data) => {
            if (data?.audioUrl) {
              ttsUrlCache.set(cacheKey, {
                audioUrl: data.audioUrl,
                voiceLabel: data.voiceLabel,
              });
              preloadAudio(data.audioUrl);
            }
          })
          .catch(() => {
            // Non-fatal prefetch failure
          })
          .finally(() => {
            ttsPrefetchInFlight.delete(cacheKey);
          });
        pending.push(request);
      });
      return Promise.allSettled(pending).then(() => undefined);
    },
    []
  );

  const playTts = useCallback(
    async (text: string, options?: PlayTtsOptions) => {
      if (!text || !text.trim()) {
        options?.onEnd?.();
        return;
      }

      // Stop any active audio and track this play request
      stopAudio();
      lastSegmentsRef.current = null;
      const thisPlayId = currentPlayIdRef.current;

      setIsLoadingAudio(true);
      setActiveText(text);

      const persona = options?.persona || "recruiter";
      let instantFallbackStarted = false;
      let instantFallbackTimer: ReturnType<typeof setTimeout> | null = null;

      const startInstantFallback = () => {
        if (instantFallbackStarted || thisPlayId !== currentPlayIdRef.current) return;
        instantFallbackStarted = true;
        setIsLoadingAudio(false);
        fallbackBrowserSpeech(
          text,
          () => {
            if (thisPlayId !== currentPlayIdRef.current) return;
            setIsPlaying(true);
            options?.onStart?.();
          },
          () => {
            if (thisPlayId !== currentPlayIdRef.current) return;
            setIsPlaying(false);
            options?.onEnd?.();
          }
        );
      };

      // Detect job/user region from options or localStorage
      let jobRegion = options?.jobRegion;
      if (!jobRegion && typeof window !== "undefined") {
        jobRegion = voiceRegion();
      }
      jobRegion = jobRegion || "nigeria";

      const playMainAudio = (url: string) => {
        if (thisPlayId !== currentPlayIdRef.current) return;

        const audio = takeAudio(url);
        audio.defaultPlaybackRate = TTS_PLAYBACK_SPEED;
        audio.playbackRate = TTS_PLAYBACK_SPEED;
        audio.preservesPitch = true;
        audioRef.current = audio;

        audio.onplay = () => {
          audio.playbackRate = TTS_PLAYBACK_SPEED;
          if (thisPlayId !== currentPlayIdRef.current) return;
          if (process.env.NODE_ENV !== "production") {
            console.info(`[voice] Playing synthesized audio: ${ttsUrlCache.get(cacheKey)?.voiceLabel || "unknown voice"}`);
          }
          setIsPlaying(true);
          options?.onStart?.();
        };

        audio.onended = () => {
          if (thisPlayId !== currentPlayIdRef.current) return;
          setIsPlaying(false);
          options?.onEnd?.();
        };

        audio.onerror = (err) => {
          if (thisPlayId !== currentPlayIdRef.current) return;
          console.warn("[useTtsAudio] Main audio playback error, falling back:", err);
          setIsPlaying(false);
          fallbackBrowserSpeech(text, options?.onStart, options?.onEnd);
        };

        audio.play().catch(() => {
          fallbackBrowserSpeech(text, options?.onStart, options?.onEnd);
        });
      };

      // Check client-side prefetch/memory cache first (0ms load time!)
      const cacheKey = `${persona}:${jobRegion}:${text.trim()}`;
      const cached = ttsUrlCache.get(cacheKey);
      if (cached?.audioUrl) {
        setVoiceLabel(cached.voiceLabel || null);
        setCurrentAudioUrl(cached.audioUrl);
        setIsLoadingAudio(false);
        playMainAudio(cached.audioUrl);
        return;
      }

      if (options?.preferImmediate) {
        instantFallbackTimer = setTimeout(startInstantFallback, TTS_FALLBACK_WAIT_MS);
      }

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.trim(),
            persona,
            jobRegion,
          }),
        });

        // If a new play request arrived while fetching, ignore this one
        if (instantFallbackTimer) clearTimeout(instantFallbackTimer);
        if (thisPlayId !== currentPlayIdRef.current || instantFallbackStarted) return;

        if (!res.ok) {
          throw new Error(`TTS API returned status ${res.status}`);
        }

        const data = await res.json();
        if (thisPlayId !== currentPlayIdRef.current) return;

        if (!data.audioUrl) {
          throw new Error("No audioUrl in TTS response");
        }

        // Cache for subsequent plays / replays
        ttsUrlCache.set(cacheKey, {
          audioUrl: data.audioUrl,
          voiceLabel: data.voiceLabel,
        });

        setVoiceLabel(data.voiceLabel || null);
        setCurrentAudioUrl(data.audioUrl);
        setIsLoadingAudio(false);
        playMainAudio(data.audioUrl);
      } catch (err) {
        if (instantFallbackTimer) clearTimeout(instantFallbackTimer);
        if (thisPlayId !== currentPlayIdRef.current) return;
        if (instantFallbackStarted) return;
        console.warn("[useTtsAudio] TTS API call failed, falling back to Web Speech:", err);
        setIsLoadingAudio(false);
        fallbackBrowserSpeech(
          text,
          () => {
            if (thisPlayId !== currentPlayIdRef.current) return;
            setIsPlaying(true);
            options?.onStart?.();
          },
          () => {
            if (thisPlayId !== currentPlayIdRef.current) return;
            setIsPlaying(false);
            options?.onEnd?.();
          }
        );
      }
    },
    [stopAudio]
  );

  const replayCurrentAudio = useCallback(() => {
    const segments = lastSegmentsRef.current;
    if (segments && playPipelinedRef.current) {
      void playPipelinedRef.current(segments);
      return;
    }
    if (currentAudioUrl) {
      stopAudio();
      const thisPlayId = currentPlayIdRef.current;
      const audio = takeAudio(currentAudioUrl);
      audio.defaultPlaybackRate = TTS_PLAYBACK_SPEED;
      audio.playbackRate = TTS_PLAYBACK_SPEED;
      audio.preservesPitch = true;
      audioRef.current = audio;
      audio.onplay = () => {
        audio.playbackRate = TTS_PLAYBACK_SPEED;
        if (thisPlayId !== currentPlayIdRef.current) return;
        setIsPlaying(true);
      };
      audio.onended = () => {
        if (thisPlayId !== currentPlayIdRef.current) return;
        setIsPlaying(false);
      };
      audio.play().catch((err) => {
        console.warn("[useTtsAudio] Replay failed:", err);
        if (activeText) {
          fallbackBrowserSpeech(activeText);
        }
      });
    } else if (activeText) {
      stopAudio();
      fallbackBrowserSpeech(activeText);
    }
  }, [currentAudioUrl, activeText, stopAudio]);

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  /**
   * Plays a line only if its audio is already cached in the interview voice;
   * returns false (and plays nothing) otherwise. Used for fillers, which must
   * start instantly and must never switch to the browser's voice.
   */
  const playIfCached = useCallback(
    (text: string, options?: PlayTtsOptions): boolean => {
      const persona = options?.persona || "recruiter";
      const jobRegion = options?.jobRegion || voiceRegion();
      if (!ttsUrlCache.get(`${persona}:${jobRegion}:${text.trim()}`)?.audioUrl) return false;
      void playTts(text, options);
      return true;
    },
    [playTts]
  );

  const playFiller = useCallback(
    (candidateTranscript?: string, options?: PlayFillerOptions): boolean =>
      playIfCached(getContextualFiller(candidateTranscript, options?.recentCandidateTurns, options?.length), options),
    [playIfCached]
  );

  const primeAudioCache = useCallback(
    (text: string, audioUrl: string, voiceLabel?: string | null, persona: string = "recruiter", jobRegion?: string) => {
      if (!text || !audioUrl) return;
      const region = jobRegion || (typeof window !== "undefined" ? voiceRegion() : "nigeria");
      const cacheKey = `${persona}:${region}:${text.trim()}`;
      ttsUrlCache.set(cacheKey, {
        audioUrl,
        voiceLabel: voiceLabel || undefined,
      });

      preloadAudio(audioUrl);
    },
    []
  );

  const prefetchFillers = useCallback(
    (options?: { persona?: "recruiter" | "coach"; jobRegion?: string }) =>
      prefetchTts(CONVERSATIONAL_FILLERS, options),
    [prefetchTts]
  );

  const duckAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.volume = 0.15;
    }
  }, []);

  const restoreAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.volume = 1.0;
    }
  }, []);

  const pauseAudio = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused && !audioRef.current.ended) {
      audioRef.current.pause();
      pausedSourceRef.current = "element";
    } else if (typeof window !== "undefined" && window.speechSynthesis?.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      pausedSourceRef.current = "speech";
    }
  }, []);

  const resumeAudio = useCallback(() => {
    const source = pausedSourceRef.current;
    pausedSourceRef.current = null;
    if (source === "element" && audioRef.current && audioRef.current.paused && !audioRef.current.ended) {
      audioRef.current.play().catch(() => {});
    } else if (source === "speech" && typeof window !== "undefined" && window.speechSynthesis?.paused) {
      window.speechSynthesis.resume();
    }
  }, []);

  const playPipelinedSpeech = useCallback(
    async (segments: Array<{ text: string; audioUrl?: string }>, options?: PlayTtsOptions) => {
      if (!segments || segments.length === 0) {
        options?.onEnd?.();
        return;
      }
      // Replay should repeat these exact clips, not re-voice the text.
      lastSegmentsRef.current = segments;
      setActiveText(segments.map((seg) => seg.text).join(" "));

      if (segments.length === 1) {
        if (segments[0].audioUrl) {
          stopAudio();
          const thisPlayId = currentPlayIdRef.current;
          const audio = takeAudio(segments[0].audioUrl);
          audio.defaultPlaybackRate = TTS_PLAYBACK_SPEED;
          audio.playbackRate = TTS_PLAYBACK_SPEED;
          audio.preservesPitch = true;
          audioRef.current = audio;
          audio.onplay = () => {
            if (thisPlayId !== currentPlayIdRef.current) return;
            setIsPlaying(true);
            options?.onStart?.();
          };
          audio.onended = () => {
            if (thisPlayId !== currentPlayIdRef.current) return;
            setIsPlaying(false);
            options?.onEnd?.();
          };
          // A clip that fails to load or breaks mid-play must still end the turn.
          audio.onerror = () => {
            if (thisPlayId !== currentPlayIdRef.current) return;
            setIsPlaying(false);
            fallbackBrowserSpeech(segments[0].text, options?.onStart, options?.onEnd);
          };
          audio.play().catch(() => {
            fallbackBrowserSpeech(segments[0].text, options?.onStart, options?.onEnd);
          });
          return;
        }
        return playTts(segments[0].text, options);
      }

      // Multi-segment sentence queue (LiveKit _speech_q model)
      stopAudio();
      const thisPlayId = currentPlayIdRef.current;
      let currentIndex = 0;
      const persona = options?.persona || "recruiter";
      const jobRegion = options?.jobRegion || voiceRegion();

      // Resolve every missing sentence URL up front, in parallel, so each
      // sentence is ready by the time the previous one finishes instead of
      // being requested only after it ends.
      const resolveUrl = async (text: string, attempt = 1): Promise<string | undefined> => {
        const cacheKey = `${persona}:${jobRegion}:${text.trim()}`;
        const cached = ttsUrlCache.get(cacheKey);
        if (cached?.audioUrl) return cached.audioUrl;
        // One retry before a sentence drops to the (different) browser voice.
        const retry = () => (attempt < 2 ? resolveUrl(text, attempt + 1) : Promise.resolve(undefined));
        try {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text.trim(), persona, jobRegion }),
          });
          if (!res.ok) return retry();
          const data = await res.json();
          if (!data.audioUrl) return retry();
          ttsUrlCache.set(cacheKey, { audioUrl: data.audioUrl, voiceLabel: data.voiceLabel });
          return data.audioUrl;
        } catch {
          return retry();
        }
      };
      const urlPromises = segments.map((seg) =>
        (seg.audioUrl ? Promise.resolve(seg.audioUrl) : resolveUrl(seg.text)).then((url) => {
          // Start loading every sentence now so each is buffered before its turn.
          if (url) preloadAudio(url);
          return url;
        })
      );

      const playNextSegment = async () => {
        if (thisPlayId !== currentPlayIdRef.current) return;
        if (currentIndex >= segments.length) {
          setIsPlaying(false);
          options?.onEnd?.();
          return;
        }

        const seg = segments[currentIndex];
        currentIndex++;

        const url = await urlPromises[currentIndex - 1];

        if (thisPlayId !== currentPlayIdRef.current) return;

        if (url) {
          const audio = takeAudio(url);
          audio.defaultPlaybackRate = TTS_PLAYBACK_SPEED;
          audio.playbackRate = TTS_PLAYBACK_SPEED;
          audio.preservesPitch = true;
          audioRef.current = audio;

          audio.onplay = () => {
            if (thisPlayId !== currentPlayIdRef.current) return;
            setIsPlaying(true);
            if (currentIndex === 1) options?.onStart?.();
          };

          audio.onended = () => {
            if (thisPlayId !== currentPlayIdRef.current) return;
            playNextSegment();
          };

          audio.onerror = () => {
            if (thisPlayId !== currentPlayIdRef.current) return;
            playNextSegment();
          };

          audio.play().catch(() => {
            playNextSegment();
          });
        } else {
          fallbackBrowserSpeech(
            seg.text,
            () => {
              if (thisPlayId !== currentPlayIdRef.current) return;
              setIsPlaying(true);
              if (currentIndex === 1) options?.onStart?.();
            },
            () => {
              if (thisPlayId !== currentPlayIdRef.current) return;
              playNextSegment();
            }
          );
        }
      };

      playNextSegment();
    },
    [playTts, stopAudio]
  );

  useEffect(() => {
    playPipelinedRef.current = playPipelinedSpeech;
  }, [playPipelinedSpeech]);

  return {
    playTts,
    playPipelinedSpeech,
    playFiller,
    playIfCached,
    prefetchTts,
    prefetchFillers,
    primeAudioCache,
    stopAudio,
    duckAudio,
    restoreAudio,
    pauseAudio,
    resumeAudio,
    replayCurrentAudio,
    isPlaying,
    isLoadingAudio,
    voiceLabel,
    currentAudioUrl,
    activeText,
  };
}
