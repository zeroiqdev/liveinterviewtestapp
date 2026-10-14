/** How the interviewer is named on screen, from the voice speaking for them. */

/** "Nigerian recruiter (Azure - Abeo)" → "Abeo"; falls back to "Interviewer". */
export function interviewerNameFromVoice(voiceLabel: string | null | undefined): string {
    const name = voiceLabel?.match(/-\s*([A-Za-z][A-Za-z' ]*?)\)?\s*$/)?.[1]?.trim();
    return name || "Interviewer";
}

export function initialsOf(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join("");
}
