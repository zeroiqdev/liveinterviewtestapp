"use client";

import { useEffect } from "react";
import { startFeedbackCapture } from "@/lib/feedbackContext";

/** Starts the in-memory record of recent steps and errors that feedback is sent with. */
export function FeedbackCapture() {
    useEffect(() => startFeedbackCapture(), []);
    return null;
}
