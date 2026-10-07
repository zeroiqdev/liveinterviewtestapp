"use client";

import { useRef, useState, useCallback } from "react";

export interface StreamDevices {
    audioDeviceId?: string;
    videoDeviceId?: string;
}

interface MediaRecorderHook {
    isRecording: boolean;
    isStreamReady: boolean;
    /** Opens (or reopens, when a different device is picked) camera + mic. */
    startStream: (devices?: StreamDevices) => Promise<boolean>;
    /** The current stream, readable right after startStream resolves. */
    getStream: () => MediaStream | null;
    startRecording: () => void;
    stopRecording: () => void;
    stopStream: () => void;
    toggleMute: () => void;
    toggleVideo: () => void;
    isMuted: boolean;
    isVideoOff: boolean;
    mediaBlob: Blob | null;
    previewStream: MediaStream | null;
    error: string | null;
}

export const useMediaRecorder = (): MediaRecorderHook => {
    const [isRecording, setIsRecording] = useState(false);
    const [isStreamReady, setIsStreamReady] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
    const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);

    // Device ids the current stream was opened with ("" = browser default).
    const openedDevicesRef = useRef<{ audio: string; video: string }>({ audio: "", video: "" });

    // Only request camera/mic when user explicitly triggers it
    const startStream = useCallback(async (devices?: StreamDevices): Promise<boolean> => {
        const audioId = devices?.audioDeviceId || "";
        const videoId = devices?.videoDeviceId || "";

        // Reuse the live stream unless a different device was picked.
        if (streamRef.current && streamRef.current.active) {
            const opened = openedDevicesRef.current;
            if ((!audioId || audioId === opened.audio) && (!videoId || videoId === opened.video)) {
                return true;
            }
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }

        // Echo cancellation keeps interviewer playback out of the mic so
        // barge-in detection reacts to the candidate, not the speakers.
        const audioConstraints: MediaTrackConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            ...(audioId ? { deviceId: { exact: audioId } } : {}),
        };
        const videoConstraints: MediaTrackConstraints | boolean = videoId
            ? { deviceId: { exact: videoId } }
            : true;

        try {
            setError(null);

            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: videoConstraints,
                    audio: audioConstraints,
                });
            } catch (err) {
                // A picked device may have been unplugged; fall back to defaults.
                const name = (err as { name?: string } | null)?.name;
                if (name !== "OverconstrainedError" && name !== "NotFoundError") throw err;
                stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                });
            }

            streamRef.current = stream;
            openedDevicesRef.current = {
                audio: stream.getAudioTracks()[0]?.getSettings().deviceId || audioId,
                video: stream.getVideoTracks()[0]?.getSettings().deviceId || videoId,
            };
            setPreviewStream(stream);
            setIsStreamReady(true);
            setIsMuted(false);
            return true;
        } catch (err: any) {
            console.error("Hardware Debug:", err);
            // Show the RAW error so we can diagnose it precisely
            const errorMessage = `${err.name}: ${err.message}`;
            setError(errorMessage);
            setIsStreamReady(false);
            return false;
        }
    }, []);

    const getStream = useCallback(() => streamRef.current, []);

    const stopStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        setPreviewStream(null);
        setIsStreamReady(false);
    }, []);

    const startRecording = useCallback(() => {
        if (!streamRef.current) return;

        chunksRef.current = [];

        // Find supported mime type
        const mimeTypes = [
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp8,opus",
            "video/webm",
            "video/mp4",
        ];
        const supportedType =
            mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";

        const recorder = new MediaRecorder(streamRef.current, {
            mimeType: supportedType || undefined,
        });

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                chunksRef.current.push(e.data);
            }
        };

        recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, {
                type: supportedType || "video/webm",
            });
            setMediaBlob(blob);
        };

        recorder.start(100);
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
    }, []);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    }, [isRecording]);

    const toggleMute = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getAudioTracks().forEach((track) => {
                track.enabled = !track.enabled;
            });
            setIsMuted((prev) => !prev);
        }
    }, []);

    const toggleVideo = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getVideoTracks().forEach((track) => {
                track.enabled = !track.enabled;
            });
            setIsVideoOff((prev) => !prev);
        }
    }, []);

    return {
        isRecording,
        isStreamReady,
        startStream,
        getStream,
        startRecording,
        stopRecording,
        stopStream,
        toggleMute,
        toggleVideo,
        isMuted,
        isVideoOff,
        mediaBlob,
        previewStream,
        error,
    };
};
