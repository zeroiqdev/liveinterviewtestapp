"use client";

import { useRef, useState, useCallback } from "react";

interface MediaRecorderHook {
    isRecording: boolean;
    isStreamReady: boolean;
    startStream: () => Promise<boolean>;
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

    // Only request camera/mic when user explicitly triggers it
    const startStream = useCallback(async (): Promise<boolean> => {
        // If stream already exists, just return true
        if (streamRef.current && streamRef.current.active) {
            return true;
        }

        try {
            setError(null);

            // Request with simple constraints for maximum compatibility
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });

            streamRef.current = stream;
            setPreviewStream(stream);
            setIsStreamReady(true);
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
