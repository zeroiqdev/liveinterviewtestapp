import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { sendEmail } from "@/lib/email";
import { welcomeEmail } from "@/lib/emailTemplates";
import { SITE_URL } from "@/lib/site";

/**
 * Sends the welcome email the first time an account is ready to use. The
 * account is marked first, so it can't go out twice, even if verifying and
 * a Google sign-in happen at the same moment.
 */
export async function sendWelcomeOnce(email: string): Promise<void> {
    try {
        await dbConnect();
        const user = await User.findOneAndUpdate(
            // Accounts from before welcome emails existed are left alone.
            { email, emailVerified: true, welcomeEmailSentAt: { $exists: false }, createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
            { $set: { welcomeEmailSentAt: new Date() } },
            { new: true }
        ).lean();
        if (!user) return;
        await sendEmail({ to: email, ...welcomeEmail({ name: user.name, role: user.role, siteUrl: SITE_URL }) });
    } catch (err) {
        // A missed welcome must never block signing in.
        console.warn("[welcome] Not sent:", (err as Error).message);
    }
}
