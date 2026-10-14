import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeDevice } from "../src/lib/feedbackContext";
import { QUICK_PICKS, sectionForPath } from "../src/lib/feedbackScreens";

describe("feedback context", () => {
    it("names the device in plain words", () => {
        assert.equal(
            describeDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36", 412),
            "Chrome 122 on Android (phone)"
        );
        assert.equal(
            describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Mobile/15E148 Safari/604.1", 390),
            "Safari 17 on iOS (phone)"
        );
        assert.equal(
            describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0", 1440),
            "Edge 122 on macOS (computer)"
        );
        assert.equal(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0", 1280), "Firefox 124 on Windows (computer)");
    });

    it("knows which screen an address is", () => {
        assert.equal(sectionForPath("/feedback"), "Interview feedback");
        assert.equal(sectionForPath("/resume-feedback/abc"), "Resume feedback");
        assert.equal(sectionForPath("/jobs"), "Jobs");
        assert.equal(sectionForPath("/dashboard"), "Dashboard");
        assert.equal(sectionForPath("/somewhere"), "Other");
    });

    it("has one-tap reasons for every screen with a feedback button", () => {
        const screens = ["Interview set-up", "Interview", "Interview feedback", "Dashboard", "Jobs", "Resume feedback", "Update credentials", "Starting an interview", "Job description"];
        for (const screen of screens) assert.ok(QUICK_PICKS[screen].length >= 5, screen);
        // Each screen's reasons are its own: nothing generic shared between them.
        const all = screens.flatMap((screen) => QUICK_PICKS[screen]);
        assert.equal(new Set(all).size, all.length);
    });
});

describe("coach messages", () => {
    it("are counted by kind, whatever week or resume they are for", async () => {
        const { coachMessageKind } = await import("../src/models/CoachRead");
        assert.equal(coachMessageKind("coach-welcome"), "Welcome");
        assert.equal(coachMessageKind("coach-tip-week-146"), "Weekly tip");
        assert.equal(coachMessageKind("coach-tip-week-147"), "Weekly tip");
        assert.equal(coachMessageKind("coach-resume-feedback-cv_123"), "Resume review");
        assert.equal(coachMessageKind("coach-interview-feedback"), "Interview report");
        assert.equal(coachMessageKind("coach-something-new"), "Other");
    });
});
