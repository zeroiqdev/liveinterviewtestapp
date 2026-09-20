import React from "react";
import { BookmarkSimple, CaretDown, CaretUp } from "@phosphor-icons/react";
import styles from "../dashboard.module.css";
import type { ChatDmItem } from "./constants";

interface DmRowProps {
    dm: ChatDmItem;
    isOpen: boolean;
    isUnread?: boolean;
    onToggle: (id: string) => void;
    onPractice?: () => void;
}

function DmRowComponent({ dm, isOpen, isUnread, onToggle, onPractice }: DmRowProps) {
    return (
        <div
            className={`${styles.conversationBox} ${isOpen ? styles.conversationBoxOpen : styles.conversationBoxClosed}`}
            onClick={() => onToggle(dm.id)}
        >
            {/* Sender Info / Clickable Row Header */}
            <div className={styles.conversationSenderRow}>
                <div className={styles.conversationAvatarWrap}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={dm.avatar}
                        alt={dm.sender}
                        className={styles.conversationAvatar}
                    />
                    {dm.isOnline && (
                        <span className={styles.conversationOnlineDot} />
                    )}
                </div>
                <div className={styles.conversationSenderInfo}>
                    <div className={styles.dmSenderTopLine}>
                        {dm.badgeLabel && (
                            <span className={styles.dmTopicBadge}>
                                {dm.badgeLabel}
                            </span>
                        )}
                    </div>
                    {!isOpen && (
                        <p className={styles.dmSnippetPreview}>
                            {dm.messages[0]}
                        </p>
                    )}
                </div>
                <div className={styles.dmHeaderRight}>
                    {isUnread && (
                        <span className={styles.dmUnreadDot} title="Unread" />
                    )}
                    <div className={styles.dmChevron}>
                        {isOpen ? (
                            <CaretUp size={14} weight="bold" />
                        ) : (
                            <CaretDown size={14} weight="bold" />
                        )}
                    </div>
                </div>
            </div>

            {/* Expanded Conversation Content (Only open when clicked on) */}
            {isOpen && (
                <div className={styles.dmExpandedContent} onClick={(e) => e.stopPropagation()}>
                    {/* Conversation Speech Bubbles */}
                    <div className={styles.conversationBubbles}>
                        {dm.messages.map((msg, idx) => (
                            <div key={idx} className={styles.speechBubble}>
                                {msg}
                            </div>
                        ))}

                        {/* Status / Mini Indicator Bubble */}
                        {dm.insight && (
                            <div className={styles.speechBubbleIndicator}>
                                <span className={styles.indicatorText}>
                                    {dm.insight.replace(/^(Coach Insight|Recruiter Insight|Recruiter Tip|Coach Tip|Insight):\s*/i, "")}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons Row */}
                    {dm.actions && dm.actions.length > 0 && (
                        <div className={styles.conversationActionsRow}>
                            {dm.actions.map((act, i) => {
                                const isPractice = /practice|drill|mock/i.test(act.label);
                                const ActionIcon = (isPractice || act.disabled) ? undefined : act.icon;
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        disabled={act.disabled}
                                        className={act.primary ? styles.conversationBtnPrimary : styles.conversationBtnSecondary}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (act.disabled) return;
                                            if (act.onClick) {
                                                act.onClick();
                                            } else if (onPractice) {
                                                onPractice();
                                            }
                                        }}
                                    >
                                        {act.label}
                                        {ActionIcon && <ActionIcon size={14} weight="bold" />}
                                    </button>
                                );
                            })}
                            <button type="button" className={styles.conversationBtnIcon} title="Bookmark" aria-label="Bookmark">
                                <BookmarkSimple size={16} weight="bold" />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export const DmRow = React.memo(DmRowComponent);
