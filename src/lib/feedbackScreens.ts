/** The screens feedback can be sent from, and the one-tap reasons offered on each. */

/**
 * One-tap reasons for each screen, so most feedback needs no typing. They are
 * the things people most often want to say about that screen.
 */
export const QUICK_PICKS: Record<string, string[]> = {
    "Interview set-up": [
        "My microphone isn't being detected",
        "The mic test won't pass",
        "My camera isn't working",
        "I can't hear the test sound",
        "The Start interview button won't work",
        "I don't know what to do next",
    ],
    Interview: [
        "It cut me off before I finished",
        "It took too long to reply",
        "It didn't reply after I stopped talking",
        "It misheard what I said",
        "I couldn't hear the interviewer",
        "The voice sounds unnatural",
        "This question doesn't fit my role",
        "It asked the same question twice",
        "The question on screen doesn't match what was said",
    ],
    "Interview feedback": [
        "The score is too low for how I did",
        "The score is too high for how I did",
        "It quotes something I didn't say",
        "Part of my interview is missing",
        "The advice is too general to use",
        "A suggested answer doesn't fit my field",
        "The report took too long to appear",
    ],
    Dashboard: [
        "The suggested interviews don't fit my role",
        "The jobs don't match my experience",
        "My Prep Score looks wrong",
        "I can't find how to start an interview",
        "The coach's messages aren't useful",
        "I can't update my resume or details",
    ],
    Jobs: [
        "These jobs aren't in my country",
        "These jobs don't match my role",
        "A job here has already closed",
        "A job's description is missing",
        "A company's logo is wrong",
        "The match score looks wrong",
        "Search or filters didn't find it",
    ],
    "Update credentials": [
        "My resume won't upload",
        "My resume wasn't read correctly",
        "My changes didn't save",
        "I can't delete an old resume",
        "I can't change my role",
        "My LinkedIn or portfolio link isn't accepted",
    ],
    "Starting an interview": [
        "My resume isn't in the list",
        "A resume I uploaded here didn't appear",
        "The resume match score looks wrong",
        "The resume match is taking too long",
        "I don't understand the difference between the modes",
        "It won't let me continue",
    ],
    "Job description": [
        "The description is cut off or empty",
        "This job has already closed",
        "The link to apply is broken",
        "The match feedback doesn't fit my resume",
        "The company or location shown is wrong",
        "The Practice button doesn't work",
    ],
    Profile: [
        "My details here are wrong",
        "I can't change my role or experience",
        "My pass isn't showing",
        "I paid but still can't start an interview",
        "I can't sign out",
        "I can't delete my account",
    ],
    "Resume feedback": [
        "It couldn't read my file",
        "Text from my resume is missing or jumbled",
        "The score doesn't match my experience",
        "A suggestion is wrong for my field",
        "A rewritten line changed my meaning",
        "It missed keywords I already have",
    ],
};
export const GENERAL_PICKS = ["Something didn't load", "It felt confusing", "It was slow"];

/** The screen someone is on, in words, from its address. */
export function sectionForPath(path: string): string {
    if (path.startsWith("/interview")) return "Interview";
    if (path.startsWith("/feedback")) return "Interview feedback";
    if (path.startsWith("/resume-feedback")) return "Resume feedback";
    if (path.startsWith("/jobs")) return "Jobs";
    if (path.startsWith("/dashboard")) return "Dashboard";
    if (path.startsWith("/profile")) return "Profile";
    if (path.startsWith("/pricing")) return "Pricing";
    if (path.startsWith("/admin")) return "Admin";
    return "Other";
}
