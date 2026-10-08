"use client";

import { Check } from "@phosphor-icons/react";
import { PASSWORD_RULES } from "@/lib/passwordPolicy";
import styles from "./onboarding.module.css";

/** Live checklist of password rules, ticked off as the user types. */
export default function PasswordChecklist({ password, id }: { password: string; id?: string }) {
    return (
        <ul className={styles.passwordChecklist} id={id} aria-live="polite">
            {PASSWORD_RULES.map((rule) => {
                const met = rule.test(password);
                return (
                    <li key={rule.id} className={`${styles.passwordRule} ${met ? styles.passwordRuleMet : ""}`}>
                        <span className={styles.passwordRuleIcon} aria-hidden="true">
                            {met && <Check size={10} weight="bold" />}
                        </span>
                        <span>
                            {rule.label}
                            <span className={styles.srOnly}>{met ? " (done)" : " (needed)"}</span>
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}
