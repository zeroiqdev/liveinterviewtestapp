"use client";

import React, { useState, useRef, useCallback } from "react";
import { Play, CaretLeft, CaretRight } from "@phosphor-icons/react";
import styles from "../dashboard.module.css";

export interface InterviewRoundCard {
    id: string;
    number: string;
    title: string;
    tagline: string;
    image: string;
}

const ROUNDS_DATA: InterviewRoundCard[] = [
    {
        id: "technical",
        number: "01",
        title: "Technical Interview",
        tagline: "Live Coding & Problem Solving",
        image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680377/0c08bf7e241268702484002634c7ee15-removebg-preview_2_zmpv2l.png",
    },
    {
        id: "behavioral",
        number: "02",
        title: "Behavioral Interview",
        tagline: "STAR Method & Leadership",
        image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786682354/f37d1ccf89f44a94d6effda08b05c8e2_laveh3.jpg",
    },
    {
        id: "system-design",
        number: "03",
        title: "System Design",
        tagline: "Architecture & Scale",
        image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786679257/0c08bf7e241268702484002634c7ee15-removebg-preview_zfigrw.png",
    },
    {
        id: "skills-assessment",
        number: "04",
        title: "Skills Assessment",
        tagline: "Core Engineering Drills",
        image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680091/0c08bf7e241268702484002634c7ee15-removebg-preview_1_jyel0f.png",
    },
];

interface TinderCardDeckProps {
    onPractice: () => void;
}

export function TinderCardDeck({ onPractice }: TinderCardDeckProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);

    const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    const totalCards = ROUNDS_DATA.length;
    const currentCard = ROUNDS_DATA[currentIndex];

    // Background card previews for fanned stack effect (wrapping around)
    const layer1Card = ROUNDS_DATA[(currentIndex + 1) % totalCards];
    const layer2Card = ROUNDS_DATA[(currentIndex + 2) % totalCards];
    const layer3Card = ROUNDS_DATA[(currentIndex + 3) % totalCards];

    // Navigation both ways
    const handlePrev = () => {
        setDragOffset({ x: 0, y: 0 });
        setSwipeDirection(null);
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : totalCards - 1));
    };

    const handleNext = () => {
        setDragOffset({ x: 0, y: 0 });
        setSwipeDirection(null);
        setCurrentIndex((prev) => (prev < totalCards - 1 ? prev + 1 : 0));
    };

    // Drag handlers for Tinder-style swiping
    const handleStart = (clientX: number, clientY: number) => {
        setIsDragging(true);
        startPosRef.current = { x: clientX, y: clientY };
        setDragOffset({ x: 0, y: 0 });
    };

    const handleMove = (clientX: number, clientY: number) => {
        if (!isDragging) return;
        const dx = clientX - startPosRef.current.x;
        const dy = clientY - startPosRef.current.y;
        setDragOffset({ x: dx, y: dy });

        if (dx > 45) {
            setSwipeDirection("right");
        } else if (dx < -45) {
            setSwipeDirection("left");
        } else {
            setSwipeDirection(null);
        }
    };

    const handleEnd = useCallback(() => {
        if (!isDragging) return;
        setIsDragging(false);

        const threshold = 80;
        if (dragOffset.x > threshold) {
            // Swiped Right -> Practice
            setSwipeDirection("right");
            setTimeout(() => {
                onPractice();
                handleNext();
                setDragOffset({ x: 0, y: 0 });
                setSwipeDirection(null);
            }, 180);
        } else if (dragOffset.x < -threshold) {
            // Swiped Left -> Next Card
            setSwipeDirection("left");
            setTimeout(() => {
                handleNext();
                setDragOffset({ x: 0, y: 0 });
                setSwipeDirection(null);
            }, 180);
        } else {
            // Check if it was a simple tap without drag -> Open practice
            if (Math.abs(dragOffset.x) < 5 && Math.abs(dragOffset.y) < 5) {
                onPractice();
            }
            setDragOffset({ x: 0, y: 0 });
            setSwipeDirection(null);
        }
    }, [isDragging, dragOffset.x, dragOffset.y, onPractice]);

    // Practice button handler
    const handleMainPractice = () => {
        onPractice();
    };

    return (
        <div className={styles.deckSectionContainer}>
            {/* ── Cards Stack Viewport (cards only, no arrows) ── */}
            <div className={styles.deckViewport}>
                {/* Centralized Card Stack */}
                <div className={styles.deckStackWrapper}>
                    {/* Layer 3 Background Card */}
                    <div className={`${styles.deckCardBase} ${styles.deckBackLayer3}`}>
                        <div className={styles.deckCardTopContent}>
                            <div className={styles.deckCardHeaderRow}>
                                <span className={styles.deckCardNumber}>{layer3Card.number}</span>
                                <div className={styles.deckPlayButton}>
                                    <Play size={10} weight="fill" color="#4782F6" />
                                </div>
                            </div>
                            <h2 className={styles.deckCardTitle}>{layer3Card.title}</h2>
                            <span className={styles.deckCardTagline}>{layer3Card.tagline}</span>
                        </div>
                        <div className={styles.deckCardIllustrationWrap}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={layer3Card.image}
                                alt={layer3Card.title}
                                className={styles.deckCardIllustration}
                                draggable={false}
                            />
                        </div>
                    </div>

                    {/* Layer 2 Background Card */}
                    <div className={`${styles.deckCardBase} ${styles.deckBackLayer2}`}>
                        <div className={styles.deckCardTopContent}>
                            <div className={styles.deckCardHeaderRow}>
                                <span className={styles.deckCardNumber}>{layer2Card.number}</span>
                                <div className={styles.deckPlayButton}>
                                    <Play size={10} weight="fill" color="#4782F6" />
                                </div>
                            </div>
                            <h2 className={styles.deckCardTitle}>{layer2Card.title}</h2>
                            <span className={styles.deckCardTagline}>{layer2Card.tagline}</span>
                        </div>
                        <div className={styles.deckCardIllustrationWrap}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={layer2Card.image}
                                alt={layer2Card.title}
                                className={styles.deckCardIllustration}
                                draggable={false}
                            />
                        </div>
                    </div>

                    {/* Layer 1 Background Card */}
                    <div className={`${styles.deckCardBase} ${styles.deckBackLayer1}`}>
                        <div className={styles.deckCardTopContent}>
                            <div className={styles.deckCardHeaderRow}>
                                <span className={styles.deckCardNumber}>{layer1Card.number}</span>
                                <div className={styles.deckPlayButton}>
                                    <Play size={10} weight="fill" color="#4782F6" />
                                </div>
                            </div>
                            <h2 className={styles.deckCardTitle}>{layer1Card.title}</h2>
                            <span className={styles.deckCardTagline}>{layer1Card.tagline}</span>
                        </div>
                        <div className={styles.deckCardIllustrationWrap}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={layer1Card.image}
                                alt={layer1Card.title}
                                className={styles.deckCardIllustration}
                                draggable={false}
                            />
                        </div>
                    </div>

                    {/* Active Front Card */}
                    <div
                        className={`${styles.deckCardBase} ${styles.deckFrontCard} ${
                            isDragging ? styles.deckCardDragging : ""
                        }`}
                        style={{
                            transform: `translate3d(${dragOffset.x}px, ${dragOffset.y * 0.3}px, 0) rotate(${
                                dragOffset.x * 0.07
                            }deg)`,
                            transition: isDragging ? "none" : "transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                        }}
                        onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
                        onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
                        onTouchEnd={handleEnd}
                        onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
                        onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
                        onMouseUp={handleEnd}
                        onMouseLeave={() => {
                            if (isDragging) handleEnd();
                        }}
                    >
                        {/* Swipe Stamp Badges */}
                        {swipeDirection === "right" && (
                            <div className={`${styles.deckStampBadge} ${styles.deckStampPractice}`}>
                                PRACTICE
                            </div>
                        )}
                        {swipeDirection === "left" && (
                            <div className={`${styles.deckStampBadge} ${styles.deckStampSkip}`}>
                                NEXT
                            </div>
                        )}

                        {/* Card Content Top Header (matching desktop card design) */}
                        <div className={styles.deckCardTopContent}>
                            <div className={styles.deckCardHeaderRow}>
                                <span className={styles.deckCardNumber}>{currentCard.number}</span>
                                <div className={styles.deckPlayButton}>
                                    <Play size={10} weight="fill" color="#4782F6" />
                                </div>
                            </div>
                            <h2 className={styles.deckCardTitle}>{currentCard.title}</h2>
                            <span className={styles.deckCardTagline}>{currentCard.tagline}</span>
                        </div>

                        {/* Illustration Center (matching desktop card design) */}
                        <div className={styles.deckCardIllustrationWrap}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={currentCard.image}
                                alt={currentCard.title}
                                className={styles.deckCardIllustration}
                                draggable={false}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Row: Arrows flanking Dots, directly below cards */}
            <div className={styles.deckNavDotsRow}>
                <button
                    type="button"
                    id="deck-nav-prev"
                    className={styles.deckNavArrowBtn}
                    onClick={handlePrev}
                    aria-label="Previous interview round"
                >
                    <CaretLeft size={14} weight="bold" />
                </button>

                {ROUNDS_DATA.map((round, idx) => (
                    <button
                        key={round.id}
                        type="button"
                        className={`${styles.deckNavDot} ${idx === currentIndex ? styles.deckNavDotActive : ""}`}
                        onClick={() => {
                            setDragOffset({ x: 0, y: 0 });
                            setCurrentIndex(idx);
                        }}
                        aria-label={`Go to ${round.title}`}
                    />
                ))}

                <button
                    type="button"
                    id="deck-nav-next"
                    className={styles.deckNavArrowBtn}
                    onClick={handleNext}
                    aria-label="Next interview round"
                >
                    <CaretRight size={14} weight="bold" />
                </button>
            </div>
        </div>
    );
}
