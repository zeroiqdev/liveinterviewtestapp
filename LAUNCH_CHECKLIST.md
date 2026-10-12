# Launch checklist

Written 10 October 2026. "Known" means it was seen while working on the code; "Check" means nobody has confirmed it either way yet.

## 1. Must fix before launch

### Ship the code
- [ ] **Run a production build locally** (`npm run build`). Not run since `sharp` and `@breezystack/lamejs` were added. Known gap.
- [ ] **Commit and deploy the work on `main`.** About 60 changed files are uncommitted, so the live site is still the old version: old voices, old landing page, no automatic job scraping, no stored logos.
- [ ] **Jobs list is too big for the live site.** The old `/api/jobs` response is about 7 MB and Vercel's limit is 4.5 MB. The fix is written but not deployed. Known.
- [ ] **Decide on PR #4** (friendlier email errors): merge or close.
- [ ] **Delete `voice-samples/`** before committing. It holds test recordings only.

### Accounts and secrets
- [ ] **Rotate the Resend key and the Spitch key.** Both were pasted into a chat. Known.
- [ ] **Set production environment variables in Vercel:** `ADMIN_EMAILS`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, and the same `MONGODB_URI` and `R2_*` values used locally. Do not set `NIGERIAN_VOICE_PROVIDER`.
- [ ] **Google sign-in:** add the live domain to "Authorised JavaScript origins" in Google Cloud. It currently fails with `origin_mismatch`. Known.
- [ ] **Sign out and back in** after `ADMIN_EMAILS` is set, to get admin access.

### Things that can break for real users
- [ ] **Database drops connections.** MongoDB Atlas timed out several times today ("ReplicaSetNoPrimary"). When it does, the jobs page shows nothing and sign-in can fail. Check the cluster tier, and that network access allows Vercel. Known, cause not confirmed.
- [ ] **Email delivery.** Check: is the sending domain verified in Resend, so sign-up codes reach any address and not only your own?
- [ ] **Vercel plan.** The job scraper is scheduled three times a day and runs for up to five minutes. Check that your plan allows both (the free plan allows one scheduled run a day and shorter runs).
- [ ] **Payments.** Check: live keys set, one real payment made end to end, and the pass actually unlocks afterwards.
- [ ] **Azure voice costs.** Ethan (the coach voice) is a preview voice on Azure, so its price and availability can change. Check the price for Ava and Ethan and set a spending alert.

### Test on the live site, as a new user
- [ ] Sign up with email, receive the code, finish onboarding (including the new years-of-experience dropdown).
- [ ] Sign up with Google.
- [ ] Full mock interview with the interviewer voice, start to finish, then read the feedback report.
- [ ] Full live-coaching interview with the coach voice.
- [ ] Ask the interviewer a question mid-interview and confirm the reply sounds natural.
- [ ] Start an interview without a resume (now optional).
- [ ] Do one interview on a real phone (iPhone Safari and Android Chrome): microphone permission, audio playback, layout.
- [ ] Forgot password and reset.

## 2. Should fix soon after

### Jobs board
- [ ] Nigerian jobs mostly have no real description (25 of about 710), because Jobberman and LinkedIn detail pages are not read yet. Resume matching on those jobs works from a short summary.
- [ ] 226 of 501 companies have no logo and show an initial. Almost all are small Jobberman employers.
- [ ] Paystack and Nomba job sources return "not found".
- [ ] The interview set-up modal matches your resume against the job summary, not the full posting.
- [ ] Many sources are US portfolio companies. Decide whether they belong on the board.

### Voices
- [ ] After deploying, delete the stored recordings for the old Nigerian voices (Ezinne and Abeo). They are kept for now because the live site still uses them.
- [ ] `server/voiceLiveRelay.ts` still uses the Ezinne voice. Check whether that path is used in production.

### Search and sharing
- [ ] Submit `sitemap.xml` in Google Search Console once the domain is live.
- [ ] Paste the live URL into WhatsApp, X and LinkedIn to check the preview image and title.

### Operations
- [ ] Error tracking (for example Sentry) so you hear about failures before users tell you. Check: none seen in the code.
- [ ] Uptime check on the home page and `/api/jobs`.
- [ ] Database backups switched on in Atlas.
- [ ] Privacy policy and terms: confirm they mention voice and camera recording, what is stored, and a contact address.

## 3. Housekeeping
- [ ] About 290 unused logo files are left in storage from the first logo pass.
- [ ] Existing users have old experience values ("professional", "internship"). New sign-ups store years. Nothing breaks, but old users are treated as mid-level.
