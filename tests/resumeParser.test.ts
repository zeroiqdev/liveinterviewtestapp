import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasReadableResumeText, isEmptyResume, parseResumeTextToStructured, structuredToText, type StructuredResume } from "../src/lib/resumeParser";

const sample = readFileSync("tests/fixtures/resume-customer-service.txt", "utf-8");
const read = (text: string) => parseResumeTextToStructured(text, "", "Customer Service Representative", "").structured;
/** The parts of a resume a person would notice changing. */
const shape = (resume: StructuredResume) => ({
    name: resume.name,
    contact: resume.contact,
    summary: resume.summary,
    jobs: resume.jobs.map((job) => ({ title: job.title, company: job.company, date: job.date, bullets: job.bullets.map((bullet) => bullet.text) })),
    education: (resume.education || []).map((school) => ({ institution: school.institution, date: school.date, degree: school.degree || "" })),
    skills: resume.skills,
});

/** Dates in brackets after the company, a common way to write them. */
const bracketed = `Amara Okafor
amara.okafor@example.test

EXPERIENCE
Customer Service Representative, Konga, Lagos (Jan 2022 to Present)
- Answered 70 customer calls and chats a day and kept satisfaction at 94%
- Settled 30 billing disputes a week by checking order records with the finance team

Customer Support Associate, MTN Nigeria, Lagos (Mar 2020 to Dec 2021)
- Replied to 120 email and social media enquiries a day within 2 hours
- Trained 6 new hires on the knowledge base in their first month

EDUCATION
BSc Mass Communication, University of Lagos, 2019`;

describe("reading a resume", () => {
    it("doesn't turn the bracket after a date into a line of its own", () => {
        const resume = read(bracketed);
        assert.deepEqual(resume.jobs.map((job) => job.bullets.length), [2, 2]);
        assert.ok(resume.jobs.every((job) => job.bullets.every((bullet) => /[a-z]/i.test(bullet.text))));
        assert.match(resume.jobs[0].date || "", /Jan 2022/);
    });

    it("cleans up resumes already saved with the stray bracket", () => {
        const saved = bracketed.replace("Konga, Lagos (Jan 2022 to Present)", "Konga, Lagos ( — Jan 2022 to Present\n- )");
        const resume = read(saved);
        assert.equal(resume.jobs[0].bullets.length, 2);
        assert.doesNotMatch(JSON.stringify(resume.jobs[0]), /\(\s*—|"\)"/);
    });

    it("keeps each job, its company, its dates and its lines apart", () => {
        const resume = read(sample);
        assert.deepEqual(resume.jobs.map((job) => [job.title, job.company, job.date, job.bullets.length]), [
            ["Customer Service Representative", "BrightLine Telecoms, Lagos", "March 2023 to Present", 4],
            ["Sales Assistant", "Mama Nkechi Supermarket, Ikeja", "June 2021 to February 2023", 3],
        ]);
        assert.deepEqual(resume.education, [{ institution: "BSc Mass Communication, University of Lagos", date: "2021", degree: "" }]);
        assert.equal(resume.skills[0].items, "Microsoft Excel, Zendesk, Communication, Yoruba, English");
    });

    it("doesn't invent a headline the person never wrote", () => {
        assert.equal(read(sample).headline, "");
    });

    it("gives an empty resume, never a made-up one, when there is nothing to read", () => {
        for (const nothing of ["", "   ", "Resume document: cv.pdf", "%PDF-1.7 binary", "PK\x03\x04 zipped"]) {
            assert.equal(hasReadableResumeText(nothing), false, nothing);
            const { structured, suggestions } = parseResumeTextToStructured(nothing, "Ada", "Product Manager", "ada@example.test");
            assert.ok(isEmptyResume(structured), nothing);
            assert.equal(suggestions.length, 0);
            assert.doesNotMatch(JSON.stringify(structured), /TechScale|Results-driven|Senior Product Manager/);
        }
    });
});

describe("saving an edited resume", () => {
    it("reads back exactly as it was saved", () => {
        const first = read(sample);
        const saved = structuredToText(first);
        assert.deepEqual(shape(read(saved)), shape(first));
        // And again: saving twice must not drift.
        assert.equal(structuredToText(read(saved)), saved);
    });

    it("survives an edit to a line and a long job header", () => {
        const resume = read(sample);
        resume.jobs[0].bullets[0].text = "Answered 60 customer calls and emails a day, resolving most on first contact.";
        resume.jobs[1].title = "Senior Sales Assistant and Weekend Shift Supervisor";
        resume.jobs[1].company = "Mama Nkechi Supermarket and Wholesale Stores Limited, Ikeja";
        const reread = read(structuredToText(resume));
        assert.deepEqual(shape(reread), shape(resume));
    });

    it("keeps a job that has no company or no dates as a job", () => {
        const resume = read(sample);
        resume.jobs[0].date = "";
        resume.jobs[1].company = "";
        const reread = read(structuredToText(resume));
        assert.deepEqual(reread.jobs.map((job) => [job.title, job.company, job.date, job.bullets.length]), [
            ["Customer Service Representative", "BrightLine Telecoms, Lagos", "", 4],
            ["Sales Assistant", "", "June 2021 to February 2023", 3],
        ]);
    });

    it("never turns a bulleted line into a job, even one ending in dates", () => {
        const resume = read(sample);
        resume.jobs[0].bullets.push({ id: "x", text: "Covered the Abuja desk, March 2024 to June 2024" });
        const reread = read(structuredToText(resume));
        assert.equal(reread.jobs.length, 2);
        assert.equal(reread.jobs[0].bullets.length, 5);
    });
});

describe("rewrites", () => {
    const rewrite = { category: "Impact & Metrics", feedback: "No result.", recommendation: "Say how many calls you handled.", targetSnippet: "Responsible for answering customer calls and emails", proposedText: "Answered 60+ customer calls and emails a day." };

    it("attach to the line they were written for", () => {
        const { structured, suggestions } = parseResumeTextToStructured(sample, "", "Customer Service Representative", "", [rewrite]);
        assert.equal(suggestions.length, 1);
        assert.equal(structured.jobs[0].bullets[0].suggestionId, suggestions[0].id);
    });

    it("are dropped when their line isn't in the resume or they have no new wording", () => {
        const stray = { ...rewrite, targetSnippet: "Led a team of twelve engineers across three time zones" };
        const blank = { ...rewrite, proposedText: "" };
        const { structured, suggestions } = parseResumeTextToStructured(sample, "", "Customer Service Representative", "", [stray, blank]);
        assert.equal(suggestions.length, 0);
        assert.ok(structured.jobs.every((job) => job.bullets.every((bullet) => !bullet.suggestionId)));
    });

    it("only ever come from the scan: none are made up when it gave none", () => {
        assert.equal(parseResumeTextToStructured(sample, "", "Customer Service Representative", "").suggestions.length, 0);
    });
});

describe("resume score", () => {
    it("is the same whether the scan or the editor works it out", async () => {
        const { calculateAtsScore, scoreStructuredResume } = await import("../src/lib/atsScorer");
        const role = "Customer Service Representative";
        const fromScan = calculateAtsScore(sample, role).overallScore;
        const structured = parseResumeTextToStructured(sample, "Chiamaka Obi", role, "c@example.test").structured;
        assert.equal(scoreStructuredResume(structured, role).overallScore, fromScan);
        // And after the editor has saved and re-read it.
        const reread = parseResumeTextToStructured(structuredToText(structured), "", role, "").structured;
        assert.equal(scoreStructuredResume(reread, role).overallScore, fromScan);
    });

    it("knows when a rewrite brings in numbers the line never had", async () => {
        const { introducesNumbers } = await import("../src/lib/atsScorer");
        assert.equal(introducesNumbers("Responsible for answering customer calls", "Answered 60+ calls a day at a 95% resolution rate"), true);
        assert.equal(introducesNumbers("Cut response time by 30% across 4 teams", "Reduced response time by 30% across 4 teams"), false);
        assert.equal(introducesNumbers("Helped new staff learn the system", "Trained new staff on the system"), false);
    });

    it("doesn't rise for numbers a rewrite made up, but does once they are the person's own", async () => {
        const { scoreStructuredResume } = await import("../src/lib/atsScorer");
        const role = "Customer Service Representative";
        const before = parseResumeTextToStructured(sample, "", role, "").structured;
        const withExamples = parseResumeTextToStructured(sample, "", role, "").structured;
        const owned = parseResumeTextToStructured(sample, "", role, "").structured;
        const rewrites = [
            "Answered 60+ customer calls and emails a day, resolving 95% on first contact.",
            "Resolved 40+ billing and network complaints a day, cutting escalations by 15%.",
            "Trained 5 new hires on the support system, cutting their ramp-up time by 20%.",
            "Worked with the technical team to fix customer issues 2 hours faster on average.",
        ];
        rewrites.forEach((text, i) => {
            withExamples.jobs[0].bullets[i] = { ...withExamples.jobs[0].bullets[i], text, exampleNumbers: true };
            owned.jobs[0].bullets[i] = { ...owned.jobs[0].bullets[i], text };
        });
        const impact = (resume: StructuredResume) => scoreStructuredResume(resume, role).metrics.impactScore;
        assert.equal(impact(withExamples), impact(before));
        assert.ok(impact(owned) > impact(before));
    });

    it("never offers fill-in lines of its own", async () => {
        const { calculateAtsScore } = await import("../src/lib/atsScorer");
        assert.deepEqual(calculateAtsScore(sample, "Backend Engineer").extraBulletSuggestions, []);
    });

    it("lists a fix for every part of the score that's below full", async () => {
        const { calculateAtsScore, scoreGaps } = await import("../src/lib/atsScorer");
        const result = calculateAtsScore(bracketed, "Customer Service Representative");
        const gaps = scoreGaps(result);
        const m = result.metrics;
        const lost = 100 - (m.impactPoints + m.roleAlignmentPoints + m.brevityPoints + m.structurePoints + m.contactPoints);
        assert.ok(result.overallScore < 75, `score ${result.overallScore}`);
        assert.ok(gaps.length > 0);
        // Every point lost is accounted for by a listed fix, biggest first.
        assert.equal(gaps.reduce((sum, gap) => sum + gap.points, 0), lost);
        assert.deepEqual(gaps.map((gap) => gap.points), [...gaps.map((gap) => gap.points)].sort((a, b) => b - a));
        assert.ok(gaps.some((gap) => gap.area === "layout" && /Summary/.test(gap.detail)));
        assert.doesNotMatch(gaps.map((gap) => `${gap.title} ${gap.detail}`).join(" "), /ATS|AI\b|leverage/);
    });

    it("counts everyday verbs from service and sales work as strong", async () => {
        const { startsWithStrongActionVerb } = await import("../src/lib/atsScorer");
        for (const line of ["Trained 6 new hires", "Settled 30 billing disputes a week", "Increased sales by 12%", "Managed a team of 4"]) {
            assert.equal(startsWithStrongActionVerb(line), true, line);
        }
        assert.equal(startsWithStrongActionVerb("Responsible for customer calls"), false);
    });

    it("explains itself in plain words", async () => {
        const { calculateAtsScore } = await import("../src/lib/atsScorer");
        const result = calculateAtsScore(sample, "Customer Service Representative");
        assert.doesNotMatch(`${result.summary} ${result.verdict} ${result.strengths.join(" ")}`, /ATS|FAANG|index|parseab|executive/i);
        assert.match(result.summary, /out of 100/);
    });
});
