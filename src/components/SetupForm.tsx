"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useInterview, InterviewRole, ExperienceLevel, CompanyType } from "../context/InterviewContext";
import { Briefcase, Buildings, Stack, User, Play } from "@phosphor-icons/react";

export default function SetupForm() {
    const { settings, updateSettings, setStatus } = useInterview();
    const router = useRouter();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setStatus("setup");
        router.push("/interview");
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">New Roleplay Session</h1>
                <p className="text-gray-500">Configure your interview parameters to start training.</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
                <form onSubmit={handleSubmit} className="space-y-8">

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Role Selection */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700">Target Role</label>
                            <div className="relative">
                                <Briefcase className="absolute left-3 top-3 text-gray-400" size={18} />
                                <select
                                    value={settings.role}
                                    onChange={(e) => updateSettings({ role: e.target.value as InterviewRole })}
                                    className="input-saas pl-10 h-10"
                                >
                                    <option value="Software Engineer">Software Engineer</option>
                                    <option value="Product Manager">Product Manager</option>
                                    <option value="Designer">Designer</option>
                                    <option value="Marketing">Marketing</option>
                                </select>
                            </div>
                        </div>

                        {/* Industry */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700">Industry Context</label>
                            <div className="relative">
                                <Stack className="absolute left-3 top-3 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    value={settings.industry}
                                    onChange={(e) => updateSettings({ industry: e.target.value })}
                                    className="input-saas pl-10"
                                    placeholder="e.g. Fintech"
                                />
                            </div>
                        </div>

                        {/* Company Type */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700">Company Tier</label>
                            <div className="relative">
                                <Buildings className="absolute left-3 top-3 text-gray-400" size={18} />
                                <select
                                    value={settings.companyType}
                                    onChange={(e) => updateSettings({ companyType: e.target.value as CompanyType })}
                                    className="input-saas pl-10 h-10"
                                >
                                    <option value="Startup">Early-stage Startup</option>
                                    <option value="Enterprise">Enterprise Corp</option>
                                    <option value="FAANG">Big Tech (FAANG)</option>
                                    <option value="Agency">Digital Agency</option>
                                </select>
                            </div>
                        </div>

                        {/* Experience Level */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700">Experience Level</label>
                            <div className="grid grid-cols-4 gap-2">
                                {(["Junior", "Mid", "Senior", "Lead"] as ExperienceLevel[]).map((level) => (
                                    <button
                                        key={level}
                                        type="button"
                                        onClick={() => updateSettings({ experience: level })}
                                        className={`py-2 rounded-lg text-xs font-medium border transition-all ${settings.experience === level
                                                ? "bg-orange-50 border-orange-200 text-orange-700"
                                                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                                            }`}
                                    >
                                        {level}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100 flex justify-end">
                        <button type="submit" className="btn-primary flex items-center gap-2 px-6 py-3 text-sm">
                            <Play size={18} fill="currentColor" />
                            Start Training Session
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
