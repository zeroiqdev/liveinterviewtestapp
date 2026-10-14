/** The two ways to do an interview, named as the landing page names them. */
export type InterviewMode = "live_coaching" | "post_interview";

export const MODE_LABEL: Record<InterviewMode, string> = {
    live_coaching: "Interactive Practice",
    post_interview: "Real Interview",
};

export function modeLabel(mode: unknown): string {
    return mode === "post_interview" ? MODE_LABEL.post_interview : MODE_LABEL.live_coaching;
}
