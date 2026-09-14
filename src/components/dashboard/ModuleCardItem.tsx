import React from "react";
import { Play } from "@phosphor-icons/react";
import styles from "../dashboard.module.css";

interface ModuleCard {
    number: string;
    title: string;
    icon: string;
    image?: string;
    isTall?: boolean;
}

function ModuleCardItemComponent({ card, onSelect }: { card: ModuleCard; onSelect: () => void }) {
    return (
        <div
            className={`${styles.moduleCard} ${card.image ? styles.moduleCardWithIllustration : ''}`}
            onClick={onSelect}
        >
            <div className={styles.moduleCardTop}>
                <div className={styles.moduleCardHeaderRow}>
                    <span className={styles.moduleCardNumber}>{card.number}</span>
                    <div className={styles.cardPlayButton}>
                        <Play size={10} weight="fill" color="#4782F6" />
                    </div>
                </div>
                <span className={styles.moduleCardTitle}>{card.title.split('\n').map((line, i) => (
                    <React.Fragment key={i}>{line}{i === 0 && <br />}</React.Fragment>
                ))}</span>
            </div>
            {card.image ? (
                <div className={`${styles.moduleIllustrationWrap} ${card.isTall ? styles.moduleIllustrationWrapTall : ''}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={card.image}
                        alt={card.title.replace('\n', ' ')}
                        className={`${styles.moduleIllustration} ${card.isTall ? styles.moduleIllustrationTall : ''}`}
                    />
                </div>
            ) : (
                <div className={styles.moduleCardImage}>
                    <Play size={24} weight="fill" color="#4782F6" />
                </div>
            )}
        </div>
    );
}

export const ModuleCardItem = React.memo(ModuleCardItemComponent);
