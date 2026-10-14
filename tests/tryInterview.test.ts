import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAnswerFeedback, checkJobReading, cleanAnswer, cleanDescription, cleanRoleRequest, descriptionProblem } from "../src/lib/tryInterview";
import { continueUrl } from "../src/lib/tryClient";

const LONG = "We are hiring a Product Manager to own the roadmap for our payments app. ".repeat(6);

test("a pasted description is tidied and capped", () => {
    assert.equal(cleanDescription("  <p>Own the   roadmap</p>\n\n\n\nShip  "), "Own the roadmap \n\nShip");
    assert.equal(cleanDescription(123), "");
    assert.equal(cleanDescription("x".repeat(20000)).length, 8000);
});

test("links and short text are turned away, a real description is accepted", () => {
    assert.match(descriptionProblem("https://jobs.example.com/pm-123") ?? "", /not a link/);
    assert.match(descriptionProblem("Product manager wanted") ?? "", /too short/);
    assert.equal(descriptionProblem(cleanDescription(LONG)), null);
});

test("a job reading needs themes and enough questions to carry on after sign-up", () => {
    const questions = ["Tell me about a time you owned a launch from start to finish?", "How would you handle two urgent requests at once?", "Tell me about a time a release went wrong."];
    const themes = ["Owning a roadmap", "Working with engineers", "Using data to decide"];
    const reading = checkJobReading({ company: "Not stated", title: "", themes, questions }, "Product Manager");
    assert.ok(reading);
    assert.equal(reading.company, "");
    assert.equal(reading.title, "Product Manager");
    assert.equal(checkJobReading({ themes, questions: questions.slice(0, 2) }, "Product Manager"), null);
    assert.equal(checkJobReading({ themes: themes.slice(0, 2), questions }, "Product Manager"), null);
    assert.equal(checkJobReading(null, "Product Manager"), null);
});

test("markup is stripped from what will be spoken", () => {
    const reading = checkJobReading(
        { company: "Moniepoint", title: "PM", themes: ["**Roadmap** ownership", "Stakeholders", "Metrics"], questions: ["**Tell me** about a launch you led?", "How do you prioritise competing requests?", "Describe a decision you made with data."] },
        "Product Manager"
    );
    assert.equal(reading?.themes[0], "Roadmap ownership");
    assert.equal(reading?.questions[0], "Tell me about a launch you led?");
});

test("feedback is kept within range and needs something to fix", () => {
    assert.deepEqual(checkAnswerFeedback({ score: 140, working: "Clear example.", fix: "End with the result." }), { score: 100, working: "Clear example.", fix: "End with the result." });
    assert.equal(checkAnswerFeedback({ score: 50, working: "Good", fix: "" }), null);
    assert.equal(checkAnswerFeedback({ score: Number.NaN, fix: "Add a result." }), null);
});

test("answers and role requests are tidied", () => {
    assert.equal(cleanAnswer("  I led\n the   launch "), "I led the launch");
    assert.equal(cleanRoleRequest("  Registered   Nurse "), "Registered Nurse");
    assert.equal(cleanRoleRequest("<script>"), "script");
    assert.equal(cleanRoleRequest("12"), "");
    assert.equal(cleanRoleRequest(null), "");
});

test("a finished try carries on in the interview for the same job", () => {
    const url = continueUrl({ role: "Product Manager", company: "", title: "Senior PM" });
    assert.ok(url.startsWith("/interview?"));
    const params = new URLSearchParams(url.split("?")[1]);
    assert.equal(params.get("try"), "1");
    assert.equal(params.get("company"), "General");
    assert.equal(params.get("interviewType"), "Senior PM Interview");
});
