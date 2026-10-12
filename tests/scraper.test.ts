import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectATSProvider, jobbermanPostedDate } from "../src/services/careerPageScraper";

describe("Jobberman posting dates", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    const card = (label: string) => `<div><p class="text-sm">${label}</p></div>`;

    it("turns the card's relative date into a real one", () => {
        assert.equal(jobbermanPostedDate(card("Today"), now), "2026-10-10");
        assert.equal(jobbermanPostedDate(card("Yesterday"), now), "2026-10-09");
        assert.equal(jobbermanPostedDate(card("3 days ago"), now), "2026-10-07");
        assert.equal(jobbermanPostedDate(card("2 weeks ago"), now), "2026-09-26");
        assert.equal(jobbermanPostedDate(card("2 months ago"), now), "2026-08-11");
        assert.equal(jobbermanPostedDate(card("5 hours ago"), now), "2026-10-10");
    });

    it("returns null when the card shows no date", () => {
        assert.equal(jobbermanPostedDate(card("Lagos"), now), null);
    });
});

describe("careers system detection", () => {
    it("recognises Workable alongside the others", () => {
        assert.equal(detectATSProvider("https://apply.workable.com/kuda"), "workable");
        assert.equal(detectATSProvider("https://jobs.ashbyhq.com/andela"), "ashby");
        assert.equal(detectATSProvider("https://boards.greenhouse.io/moniepoint"), "greenhouse");
        assert.equal(detectATSProvider("https://example.com/careers"), "generic");
    });
});

describe("reading a posting's text", () => {
    const html = `
        <h2>Who we are</h2><p>Acme helps twenty million businesses get paid, and has done so for more than a decade across Africa.</p>
        <p><strong>About the role</strong></p><p>As an Analytics Manager you will own metrics and measurement for the payments business, working with product and finance every week.</p>
        <h3>What you&rsquo;ll do</h3>
        <ul><li>Build and lead a team of five analysts across two countries</li><li>Own the yearly forecast and budget for your product area</li><li>Short</li></ul>
        <h3>What you need to succeed</h3><ul><li>Five or more years in analytics or data science roles</li></ul>
        <h3>What we can offer you</h3><ul><li>Health insurance and a pension for you and your family</li></ul>`;

    it("keeps headings and bullets, and decodes double-encoded HTML", async () => {
        const { htmlToJobText } = await import("../src/services/careerPageScraper");
        const text = htmlToJobText(html);
        assert.match(text, /^## Who we are$/m);
        assert.match(text, /^## About the role$/m);
        assert.match(text, /^• Build and lead a team of five analysts across two countries$/m);
        assert.equal(htmlToJobText("&lt;p&gt;Hello &amp;amp; welcome to the team, we are glad you are here.&lt;/p&gt;").includes("<p>"), false);
    });

    it("summarises from the role section, not the company blurb", async () => {
        const { htmlToJobText, jobSummary } = await import("../src/services/careerPageScraper");
        assert.match(jobSummary(htmlToJobText(html)), /^As an Analytics Manager you will own metrics/);
    });

    it("takes duties from the duties section only", async () => {
        const { htmlToJobText, extractResponsibilities } = await import("../src/services/careerPageScraper");
        assert.deepEqual(extractResponsibilities(htmlToJobText(html)), [
            "Build and lead a team of five analysts across two countries",
            "Own the yearly forecast and budget for your product area",
        ]);
        // No duties section: nothing is guessed from requirements or benefits.
        const noDuties = "<h3>Requirements</h3><ul><li>Five or more years in analytics or data science</li></ul><h3>Benefits</h3><ul><li>Health insurance and a pension for you</li></ul>";
        assert.deepEqual(extractResponsibilities(htmlToJobText(noDuties)), []);
    });
});

describe("duplicate jobs in lists", () => {
    type Listed = { title: string; company: string; location: string; datePosted: string; moreLocations?: number };
    const job = (title: string, company: string, location: string, datePosted = "2026-10-01"): Listed => ({ title, company, location, datePosted });

    it("shows a role posted in several cities once, counting the others", async () => {
        const { collapseDuplicateJobs } = await import("../src/lib/jobDedupe");
        const shown = collapseDuplicateJobs([
            job("Account Executive", "Klaviyo", "Denver, CO"),
            job("Account Executive", "Klaviyo", "Lagos, Nigeria"),
            job("Account Executive", "Klaviyo", "London, UK"),
            job("Data Analyst", "Kuda", "Lagos, Nigeria"),
        ]);
        assert.equal(shown.length, 2);
        // The African location is the one shown.
        assert.equal(shown[0].location, "Lagos, Nigeria");
        assert.equal(shown[0].moreLocations, 2);
        assert.equal(shown[1].moreLocations, undefined);
    });

    it("drops an exact repeat, keeping the newer copy", async () => {
        const { collapseDuplicateJobs } = await import("../src/lib/jobDedupe");
        const shown = collapseDuplicateJobs([
            job("Systems Engineer", "Anduril", "Irvine, California", "2026-09-28"),
            job("Systems  Engineer", "ANDURIL", "Irvine, California", "2026-10-05"),
        ]);
        assert.equal(shown.length, 1);
        assert.equal(shown[0].datePosted, "2026-10-05");
        assert.equal(shown[0].moreLocations, undefined);
    });

    it("keeps different roles and different companies apart", async () => {
        const { collapseDuplicateJobs } = await import("../src/lib/jobDedupe");
        assert.equal(collapseDuplicateJobs([job("Product Manager", "Stripe", "Remote"), job("Product Manager", "Vercel", "Remote"), job("Senior Product Manager", "Stripe", "Remote")]).length, 3);
    });
});
