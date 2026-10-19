import Link from "next/link";
import styles from "./legal.module.css";
import { CookieSettingsButton } from "@/components/CookieSettingsButton";

export const metadata = {
    title: "Privacy Policy",
    description: "What get prepped collects, why, who helps us run it, and how to change or delete your data.",
    alternates: { canonical: "/privacy" },
};

// Set NEXT_PUBLIC_CONTACT_EMAIL to the address people should write to about their data.
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

export default function PrivacyPage() {
    return (
        <main className={styles.page}>
            <Link href="/" className={styles.back}>← Back to Home</Link>
            <h1 className={styles.title}>Privacy Policy</h1>
            <p className={styles.meta}>Last updated: 19 October 2026 · get prepped is run by Zero and One Solutions Limited</p>
            <p className={styles.lead}>
                This page explains what we collect when you use get prepped, why we need it, who helps us run the service, how long we keep it, and how you can change or delete it.
                We don&rsquo;t sell your data and we don&rsquo;t show ads.
            </p>

            <div className={styles.sections}>
                <section className={styles.section}>
                    <h2>1. What we collect</h2>
                    <h3>Your account</h3>
                    <ul>
                        <li>Your name and email address. If you sign up with a password, we store it scrambled so that nobody, including us, can read it.</li>
                        <li>If you sign in with Google, the name, email address and profile picture Google shares with us.</li>
                        <li>The role you&rsquo;re preparing for, your years of experience, and any LinkedIn or portfolio address you add.</li>
                    </ul>
                    <h3>Your resumes</h3>
                    <ul>
                        <li>The resumes you upload, the text we read from them, and the suggestions and scores we give you. If you upload a Word file, we keep the file itself so you can download your edits in its own formatting; deleting the resume deletes it.</li>
                    </ul>
                    <h3>Your interviews</h3>
                    <ul>
                        <li>The questions you were asked, your answers as text, your scores and your interview reports.</li>
                        <li>If you try an interview before signing up, the job description you paste and your two answers. If you don&rsquo;t sign up, these are deleted after seven days.</li>
                    </ul>
                    <h3>Your microphone and camera</h3>
                    <ul>
                        <li>
                            We use your microphone to turn what you say into text. We don&rsquo;t keep recordings of your voice. Your browser&rsquo;s own speech service does the
                            transcribing, and some browsers (Chrome, for example) send the audio to their maker to do it.
                        </li>
                        <li>Your camera picture is shown only to you, on your own screen. It is never recorded or sent to us.</li>
                    </ul>
                    <h3>How you use the app</h3>
                    <ul>
                        <li>Your approximate location (country, region and city), worked out from your internet connection when you open the app. We don&rsquo;t use GPS.</li>
                        <li>When you last used the app, and which coach messages you opened.</li>
                        <li>
                            When you send feedback: your message, the screen you were on, your type of device and browser, your last few steps in the app and any errors it
                            showed, so we can find the problem.
                        </li>
                    </ul>
                    <h3 id="analytics">Website visits (Google Analytics)</h3>
                    <ul>
                        <li>
                            Only if you accept cookies: Google Analytics records which pages you visit, how long you stay, your type of device and browser, and roughly
                            where you are (city level). It never receives your name, email, resumes, answers or reports.
                        </li>
                        <li>If you decline, Google Analytics isn&rsquo;t loaded at all. You can change your choice at any time: <CookieSettingsButton className={styles.inlineButton} />.</li>
                    </ul>
                    <h3>Payments</h3>
                    <ul>
                        <li>What you bought, how much you paid, when, and the payment reference. Your card or bank details go straight to our payment provider and never reach us.</li>
                    </ul>
                </section>

                <section className={styles.section}>
                    <h2>2. How we use it</h2>
                    <ul>
                        <li>To run your interviews: choosing and asking questions, following up on your answers, and writing your feedback and reports.</li>
                        <li>To match you with open jobs, review your resume and send you weekly tips for your role.</li>
                        <li>To send account emails: sign-up codes, password resets and payment receipts.</li>
                        <li>To give you passes you pay for and keep a record of payments.</li>
                        <li>To fix problems you report, and to understand how the app is used overall, such as how many people finish an interview, so we can improve it.</li>
                    </ul>
                </section>

                <section className={styles.section}>
                    <h2>3. Who helps us run get prepped</h2>
                    <p>These companies process data for us, only to provide their service to us:</p>
                    <dl className={styles.providers}>
                        <dt>Vercel</dt>
                        <dd>Hosts the website and app.</dd>
                        <dt>MongoDB Atlas</dt>
                        <dd>Stores your account, interviews, reports and resumes.</dd>
                        <dt>Cloudflare</dt>
                        <dd>Stores files such as company logos and the interviewer&rsquo;s recorded voice.</dd>
                        <dt>Microsoft Azure</dt>
                        <dd>Turns the interviewer&rsquo;s and coach&rsquo;s words into speech.</dd>
                        <dt>Google (Gemini)</dt>
                        <dd>Reads your answers, resumes and job descriptions to write questions, follow-ups and feedback.</dd>
                        <dt>Google Analytics</dt>
                        <dd>Counts visits to the website, only if you accept cookies.</dd>
                        <dt>Google sign-in</dt>
                        <dd>Signs you in, if you choose Continue with Google.</dd>
                        <dt>Resend</dt>
                        <dd>Sends our emails.</dd>
                        <dt>Bachs</dt>
                        <dd>Takes payments for passes.</dd>
                    </dl>
                </section>

                <section className={styles.section}>
                    <h2>4. How long we keep it</h2>
                    <ul>
                        <li>Your account and everything in it, until you delete your account.</li>
                        <li>Interviews tried before signing up: seven days, unless you sign up and carry on.</li>
                        <li>Website visit data in Google Analytics: 14 months.</li>
                        <li>Payment records: kept after you delete your account, because we need them for our accounts.</li>
                    </ul>
                </section>

                <section className={styles.section}>
                    <h2>5. Your choices</h2>
                    <ul>
                        <li>Change your name, email, role, experience, links and password at any time in <Link href="/profile">your settings</Link>.</li>
                        <li>
                            Delete your account in <Link href="/profile#account">your settings</Link>. This removes your profile, resumes, interviews, reports, feedback and
                            everything else we keep about you, except payment records.
                        </li>
                        <li>
                            For anything else about your data
                            {CONTACT ? (
                                <>
                                    , email us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
                                </>
                            ) : (
                                <>, use Send feedback in the app and we&rsquo;ll reply by email.</>
                            )}
                        </li>
                    </ul>
                </section>

                <section className={styles.section}>
                    <h2>6. Keeping it safe</h2>
                    <p>
                        Everything is sent over an encrypted connection, passwords are stored scrambled, and only the people who run get prepped can see account data,
                        when they need to in order to help you or fix a problem.
                    </p>
                </section>

                <section className={styles.section}>
                    <h2>7. Changes</h2>
                    <p>If we change how we use your data, we&rsquo;ll update this page and the date at the top. For bigger changes we&rsquo;ll tell you by email.</p>
                </section>
            </div>
        </main>
    );
}
