import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { companyKey, guessedWebsites, iconCandidates, pageNamesCompany, tidyLogo, websiteFromJobUrl } from "../src/lib/companyLogos";
import { listingLogo } from "../src/services/careerPageScraper";
import { companyInitial } from "../src/components/jobs/CompanyLogo";

describe("company logos", () => {
    it("treats spellings of one company as the same company", () => {
        assert.equal(companyKey("Moniepoint (TeamApt)"), "moniepoint teamapt");
        assert.equal(companyKey("  R &amp; R "), "r r");
    });

    it("reads the company's own website from a job link, never a shared jobs host", () => {
        assert.equal(websiteFromJobUrl("https://www.fivetran.com/careers/job?gh_jid=1"), "fivetran.com");
        assert.equal(websiteFromJobUrl("https://careers.kuda.com/role/1"), "kuda.com");
        assert.equal(websiteFromJobUrl("https://job-boards.greenhouse.io/stripe/jobs/1"), null);
        assert.equal(websiteFromJobUrl("https://www.jobberman.com/listings/x"), null);
        assert.equal(websiteFromJobUrl("https://ng.linkedin.com/jobs/view/1"), null);
    });

    it("guesses an address only from a name long enough to be distinctive", () => {
        assert.deepEqual(guessedWebsites("snorkel ai"), ["snorkel.ai", "snorkelai.com"]);
        assert.deepEqual(guessedWebsites("chowdeck"), ["chowdeck.com"]);
        assert.deepEqual(guessedWebsites("omegi autos limited"), ["omegiautos.com"]);
        assert.deepEqual(guessedWebsites("r r"), []);
    });

    it("trusts a guessed address only when the page names the company", () => {
        const page = (title: string) => `<html><head><title>${title}</title></head></html>`;
        assert.equal(pageNamesCompany(page("Kuda | The money app for Africans"), "kuda bank"), true);
        assert.equal(pageNamesCompany(page("Snorkel – data development"), "snorkel ai"), true);
        assert.equal(pageNamesCompany(page("Domain for sale"), "chowdeck"), false);
        assert.equal(pageNamesCompany(page("Kudatech solutions"), "kuda bank"), false);
        assert.equal(pageNamesCompany(`<footer>© 2026 Chowdeck Technologies</footer>`, "chowdeck"), true);
    });

    it("prefers the app icon and large icons, and skips tiny ones", () => {
        const html = `
            <link rel="icon" href="/favicon.ico">
            <link rel="icon" type="image/png" sizes="32x32" href="/small.png">
            <link rel="icon" sizes="192x192" href="/big.png">
            <link rel="apple-touch-icon" href="https://cdn.example.com/touch.png">
            <link rel="mask-icon" href="/mask.svg">
            <link rel="stylesheet" id="flaticon-css" href="/flaticon.css">`;
        assert.deepEqual(iconCandidates(html, "https://example.com/"), [
            "https://example.com/big.png",
            "https://cdn.example.com/touch.png",
            "https://example.com/apple-touch-icon.png",
        ]);
    });

    it("reads the employer's logo from a job board's listing card", () => {
        const linkedIn = `<img class="artdeco-entity-image" data-delayed-url="https://media.licdn.com/dms/image/v2/abc/company-logo_100_100/0/1/acme_logo?e=2147483647&amp;v=beta&amp;t=xyz" data-ghost-url="https://static.licdn.com/ghost" alt>`;
        assert.equal(listingLogo(linkedIn), "https://media.licdn.com/dms/image/v2/abc/company-logo_100_100/0/1/acme_logo?e=2147483647&v=beta&t=xyz");
        const jobberman = `<img width="64" height="64" class="object-contain rounded" src="https://i.roamcdn.net/kazi/ng/hq/abc/-/def" alt="Acme Ltd" loading="lazy" />`;
        assert.equal(listingLogo(jobberman), "https://i.roamcdn.net/kazi/ng/hq/abc/-/def");
        // A card with no uploaded logo shows a coloured initial, and a promo banner is not a logo.
        assert.equal(listingLogo(`<span style="background-color:#224F55">I</span><img src="/static-assets/img/banner.webp">`), undefined);
    });

    it("re-centres a mark lost in empty margin, and leaves a well-framed logo alone", async () => {
        const square = (side: number, mark: number) =>
            sharp({ create: { width: side, height: side, channels: 3, background: "#ffffff" } })
                .composite([{ input: { create: { width: mark, height: mark, channels: 3, background: "#1d4ed8" } }, left: (side - mark) / 2, top: (side - mark) / 2 }])
                .png()
                .toBuffer();
        const markShare = async (bytes: Buffer) => {
            const whole = await sharp(bytes).metadata();
            const mark = await sharp(bytes).trim({ threshold: 16 }).toBuffer({ resolveWithObject: true });
            return mark.info.width / whole.width!;
        };

        const lost = await tidyLogo({ bytes: await square(600, 150), contentType: "image/png", extension: "png" });
        assert.equal((await sharp(lost.bytes).metadata()).width, 256);
        assert.ok(Math.abs((await markShare(lost.bytes)) - 0.8) < 0.03);

        const framed = await square(128, 96);
        assert.equal((await tidyLogo({ bytes: framed, contentType: "image/png", extension: "png" })).bytes, framed);

        const large = await tidyLogo({ bytes: await square(600, 420), contentType: "image/png", extension: "png" });
        assert.equal((await sharp(large.bytes).metadata()).width, 256);
        assert.ok(Math.abs((await markShare(large.bytes)) - 0.7) < 0.03);
    });

    it("falls back to the company's initial", () => {
        assert.equal(companyInitial("Leaders Network"), "L");
        assert.equal(companyInitial("(Kwik) Delivery"), "K");
        assert.equal(companyInitial("3M Nigeria"), "3");
        assert.equal(companyInitial(""), "•");
    });
});
