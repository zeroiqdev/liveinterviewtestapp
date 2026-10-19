/** Stock phrases the model still reaches for, swapped for plain words. */
export function plainWords(text: string): string {
    return text
        .replace(/\bproven track record (?:of|in)\s+/gi, "Experienced in ")
        .replace(/\bproven track record\b/gi, "record")
        .replace(/\bresults-driven\s+/gi, "")
        .replace(/\bspearhead(?:ed|ing)?\b/gi, (m) => (/ing$/i.test(m) ? "leading" : "led"))
        .replace(/\bauthor(?:ed|ing)\b/gi, (m) => (/ing$/i.test(m) ? "writing" : "wrote"))
        .replace(/\butili[sz](?:e|ed|ing)\b/gi, (m) => (/ing$/i.test(m) ? "using" : /ed$/i.test(m) ? "used" : "use"))
        .replace(/\borchestrat(?:ed|ing)\b/gi, (m) => (/ing$/i.test(m) ? "coordinating" : "coordinated"))
        .replace(/\bchampion(?:ed|ing)\b/gi, (m) => (/ing$/i.test(m) ? "leading" : "led"))
        .replace(/\bhelm(?:ed|ing)\b/gi, (m) => (/ing$/i.test(m) ? "leading" : "led"))
        .replace(/\bleverag(e|ed|ing)\b/gi, (_m, end: string) => (end === "e" ? "use" : end === "ed" ? "used" : "using"))
        .replace(/\s{2,}/g, " ")
        .replace(/(^|[.!?]\s+)([a-z])/g, (_m, before: string, letter: string) => before + letter.toUpperCase());
}
