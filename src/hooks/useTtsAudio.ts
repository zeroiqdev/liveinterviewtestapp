"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface PlayTtsOptions {
  persona?: "recruiter" | "coach";
  jobRegion?: string;
  onStart?: () => void;
  onEnd?: () => void;
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

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
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
    (texts: string[], options?: { persona?: "recruiter" | "coach"; jobRegion?: string }) => {
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
          headers: { "Content-Type": "application/json" },
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
        if (thisPlayId !== currentPlayIdRef.current) return;

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
        if (thisPlayId !== currentPlayIdRef.current) return;
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

  return {
    playTts,
    prefetchTts,
    stopAudio,
    replayCurrentAudio,
    isPlaying,
    isLoadingAudio,
    voiceLabel,
    currentAudioUrl,
    activeText,
  };
}
