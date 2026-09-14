"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

export type InterviewRole = string;
export type ExperienceLevel = "Junior" | "Mid" | "Senior" | "Lead";
export type CompanyType = "Startup" | "Enterprise" | "FAANG" | "Agency";
export type Domain = string;

interface UserSettings {
    role: InterviewRole;
    industry: string;
    companyType: CompanyType;
    experience: ExperienceLevel;
    domain: Domain;
    voiceId?: string;
    aspectRatio: "9:16" | "16:9" | "3:4" | "1:1";
}

type InterviewStatus = "idle" | "setup" | "interviewing" | "completed" | "feedback";

interface InterviewContextType {
    settings: UserSettings;
    updateSettings: (newSettings: Partial<UserSettings>) => void;
    status: InterviewStatus;
    setStatus: (status: InterviewStatus) => void;
    recordedChunks: Blob[];
    setRecordedChunks: (chunks: Blob[]) => void;
    interviewBlob: Blob | null;
    setInterviewBlob: (blob: Blob | null) => void;
}

const defaultSettings: UserSettings = {
    role: "Software Engineer",
    industry: "Tech",
    companyType: "Startup",
    experience: "Mid",
    domain: "",
    aspectRatio: "16:9",
};

const InterviewContext = createContext<InterviewContextType | undefined>(undefined);

export const InterviewProvider = ({ children }: { children: ReactNode }) => {
    const [settings, setSettings] = useState<UserSettings>(defaultSettings);
    const [status, setStatus] = useState<InterviewStatus>("idle");
    const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
    const [interviewBlob, setInterviewBlob] = useState<Blob | null>(null);

    const updateSettings = (newSettings: Partial<UserSettings>) => {
        setSettings((prev) => ({ ...prev, ...newSettings }));
    };

    return (
        <InterviewContext.Provider
            value={{
                settings,
                updateSettings,
                status,
                setStatus,
                recordedChunks,
                setRecordedChunks,
                interviewBlob,
                setInterviewBlob,
            }}
        >
            {children}
        </InterviewContext.Provider>
    );
};

export const useInterview = () => {
    const context = useContext(InterviewContext);
    if (!context) {
        throw new Error("useInterview must be used within an InterviewProvider");
    }
    return context;
};
