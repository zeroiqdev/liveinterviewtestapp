import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { plainWords } from "../src/lib/plainWords";

describe("resume wording", () => {
    it("swaps inflated or odd verbs for standard resume ones", () => {
        assert.equal(
            plainWords("Authored detailed PRDs. Spearheaded the launch, utilizing Mixpanel. Orchestrated 3 teams."),
            "Wrote detailed PRDs. Led the launch, using Mixpanel. Coordinated 3 teams."
        );
        assert.equal(plainWords("Proven track record in scaling payments."), "Experienced in scaling payments.");
    });

    it("leaves ordinary wording alone", () => {
        const line = "Led delivery of a checkout redesign that raised conversion by 12% across 3 markets.";
        assert.equal(plainWords(line), line);
    });
});
