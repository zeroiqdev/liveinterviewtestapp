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

                        {/* Status / Mini Indicator Bubble with styled dots */}
                        {dm.insight && (
                            <div className={styles.speechBubbleIndicator}>
                                <div className={styles.indicatorDiamond} />
                                <div className={styles.indicatorDotsGroup}>
                                    <span className={styles.indicatorMiniDot} style={{ background: "#38BDF8" }} />
                                    <span className={styles.indicatorMiniDot} style={{ background: "#10B981" }} />
                                    <span className={styles.indicatorMiniDot} style={{ background: "#F97316" }} />
                                </div>
                                <span className={styles.indicatorText}>{dm.insight}</span>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons Row */}
                    {dm.actions && dm.actions.length > 0 && (
                        <div className={styles.conversationActionsRow}>
                            {dm.actions.map((act, i) => {
                                const ActionIcon = act.icon;
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        className={act.primary ? styles.conversationBtnPrimary : styles.conversationBtnSecondary}
                                        onClick={(e) => {
                                            e.stopPropagation();
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
