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

// Default playback speed: 1.15x for crisper, more natural interview pacing
const TTS_PLAYBACK_SPEED = 1.15;

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
  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utterance);
}

// In-memory cache of pre-fetched and synthesized TTS audio URLs
const ttsUrlCache = new Map<string, { audioUrl: string; voiceLabel?: string }>();
const ttsPrefetchInFlight = new Set<string>();

function getStoredJobRegion(): string {
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
  const currentPlayIdRef = useRef<number>(0);

  const stopAudio = useCallback(() => {
    // Invalidate any in-flight requests
    currentPlayIdRef.current++;

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
    (texts: string[], options?: { persona?: "recruiter" | "coach"; jobRegion?: string; turnId?: string }) => {
      if (typeof window === "undefined" || !texts || texts.length === 0) return;
      const persona = options?.persona || "recruiter";
      const jobRegion = options?.jobRegion || getStoredJobRegion();

      texts.forEach((rawText) => {
        const text = rawText?.trim();
        if (!text) return;
        const cacheKey = `${persona}:${jobRegion}:${text}`;
        if (ttsUrlCache.has(cacheKey) || ttsPrefetchInFlight.has(cacheKey)) return;

        ttsPrefetchInFlight.add(cacheKey);

        fetch("/api/tts", {
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
              // Pre-warm browser native media cache (<20 KB memory)
              const audioPreload = new Audio();
              audioPreload.preload = "auto";
              audioPreload.src = data.audioUrl;
            }
          })
          .catch(() => {
            // Non-fatal prefetch failure
          })
          .finally(() => {
            ttsPrefetchInFlight.delete(cacheKey);
          });
      });
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
        jobRegion = getStoredJobRegion();
      }
      jobRegion = jobRegion || "nigeria";

      const playMainAudio = (url: string) => {
        if (thisPlayId !== currentPlayIdRef.current) return;

        const audio = new Audio(url);
        audio.defaultPlaybackRate = TTS_PLAYBACK_SPEED;
        audio.playbackRate = TTS_PLAYBACK_SPEED;
        audio.preservesPitch = true;
        audioRef.current = audio;

        audio.onplay = () => {
          audio.playbackRate = TTS_PLAYBACK_SPEED;
          if (thisPlayId !== currentPlayIdRef.current) return;
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
        instantFallbackTimer = setTimeout(startInstantFallback, 280);
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
    if (currentAudioUrl) {
      stopAudio();
      const thisPlayId = currentPlayIdRef.current;
      const audio = new Audio(currentAudioUrl);
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

  const playFiller = useCallback(
    async (candidateTranscript?: string, options?: PlayFillerOptions) => {
      const fillerText = getContextualFiller(candidateTranscript, options?.recentCandidateTurns, options?.length);
      const persona = options?.persona || "recruiter";
      let jobRegion = options?.jobRegion;
      if (!jobRegion && typeof window !== "undefined") {
        jobRegion = getStoredJobRegion();
      }
      jobRegion = jobRegion || "nigeria";

      const cacheKey = `${persona}:${jobRegion}:${fillerText.trim()}`;
      const cached = ttsUrlCache.get(cacheKey);

      // 1. If pre-cached, play high-fidelity synthesized audio
      if (cached?.audioUrl) {
        return playTts(fillerText, options);
      }

      // 2. If not pre-cached, DO NOT block on a remote API call! Speak immediately via Web Speech with 0ms latency.
      stopAudio();
      const thisPlayId = currentPlayIdRef.current;
      fallbackBrowserSpeech(
        fillerText,
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
    },
    [playTts, stopAudio]
  );

  const primeAudioCache = useCallback(
    (text: string, audioUrl: string, voiceLabel?: string | null, persona: string = "recruiter", jobRegion?: string) => {
      if (!text || !audioUrl) return;
      const region = jobRegion || (typeof window !== "undefined" ? getStoredJobRegion() : "nigeria");
      const cacheKey = `${persona}:${region}:${text.trim()}`;
      ttsUrlCache.set(cacheKey, {
        audioUrl,
        voiceLabel: voiceLabel || undefined,
      });

      if (typeof window !== "undefined") {
        const audioPreload = new Audio();
        audioPreload.preload = "auto";
        audioPreload.src = audioUrl;
      }
    },
    []
  );

  const prefetchFillers = useCallback(
    (options?: { persona?: "recruiter" | "coach"; jobRegion?: string }) => {
      prefetchTts(CONVERSATIONAL_FILLERS, options);
    },
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
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, []);

  const resumeAudio = useCallback(() => {
    if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
    }
  }, []);

  const playPipelinedSpeech = useCallback(
    async (segments: Array<{ text: string; audioUrl?: string }>, options?: PlayTtsOptions) => {
      if (!segments || segments.length === 0) {
        options?.onEnd?.();
        return;
      }

      if (segments.length === 1) {
        if (segments[0].audioUrl) {
          stopAudio();
          const thisPlayId = currentPlayIdRef.current;
          const audio = new Audio(segments[0].audioUrl);
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

      const playNextSegment = async () => {
        if (thisPlayId !== currentPlayIdRef.current) return;
        if (currentIndex >= segments.length) {
          setIsPlaying(false);
          options?.onEnd?.();
          return;
        }

        const seg = segments[currentIndex];
        currentIndex++;

        let url = seg.audioUrl;
        if (!url) {
          const persona = options?.persona || "recruiter";
          const jobRegion = options?.jobRegion || getStoredJobRegion();
          const cacheKey = `${persona}:${jobRegion}:${seg.text.trim()}`;
          const cached = ttsUrlCache.get(cacheKey);
          if (cached?.audioUrl) {
            url = cached.audioUrl;
          } else {
            try {
              const res = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: seg.text.trim(), persona, jobRegion }),
              });
              if (res.ok) {
                const data = await res.json();
                url = data.audioUrl;
              }
            } catch {}
          }
        }

        if (thisPlayId !== currentPlayIdRef.current) return;

        if (url) {
          const audio = new Audio(url);
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

  return {
    playTts,
    playPipelinedSpeech,
    playFiller,
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
