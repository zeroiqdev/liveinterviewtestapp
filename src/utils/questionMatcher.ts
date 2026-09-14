
import questionData from "../data/questions.json";

// Type definitions based on the JSON structure
type Question = {
    id: string;
    role: string;
    domain: string;
    difficulty: string;
    question: string;
};

// Map application roles to dataset roles/domains
const ROLE_MAP: Record<string, string[]> = {
    "Software Engineer": ["SWE"],
    "Product Manager": ["PM"],
    "Designer": ["PM"], // Fallback to PM Design domain
    "Marketing": ["Behavioral"], // Fallback
};

// Map experience to difficulty
const DIFFICULTY_MAP: Record<string, string[]> = {
    "Junior": ["Easy"],
    "Mid": ["Medium"],
    "Senior": ["Hard", "Medium"],
    "Lead": ["Hard"],
};

export function getQuestionsForSession(
    role: string,
    experience: string,
    industry: string,
    resumeText?: string
): string[] {
    const allQuestions = questionData.interview_question_bank.questions as Question[];

    const targetRoles = ROLE_MAP[role] || ["Behavioral"];
    const targetDifficulties = DIFFICULTY_MAP[experience] || ["Medium"];

    // Filter main questions
    let relevantQuestions = allQuestions.filter(q =>
        targetRoles.includes(q.role) && targetDifficulties.includes(q.difficulty)
    );

    // Specific tweaks
    if (role === "Designer") {
        relevantQuestions = allQuestions.filter(q => q.role === "PM" && q.domain === "Product Design/UX");
    }

    // Shuffle and pick 2-3 Technical Questions
    const pickedTechnical = relevantQuestions
        .sort(() => 0.5 - Math.random())
        .slice(0, 3);

    // Pick 2-3 Random Behavioral Questions
    const behavioralQuestions = allQuestions.filter(q => q.role === "Behavioral");
    const pickedBehavioral = behavioralQuestions
        .sort(() => 0.5 - Math.random())
        .slice(0, 3);

    // --- Resume-Based Personalized Questions ---
    const personalizedQuestions: string[] = [];

    if (resumeText && resumeText.length > 50) {
        // Simple "Experience Section" Simulation
        // In a real app, this would be an LLM-based extraction
        const experienceMarkers = ["Work Experience", "Experience", "Employment History", "Professional Experience"];
        let foundExperience = false;

        // Mocking some extracted info based on common resume patterns
        // (This simulates what an LLM would do with the parsed text)
        const commonSkills = ["React", "Python", "Node", "AWS", "Product", "Strategy", "Management", "Design"];
        const foundSkills = commonSkills.filter(skill => resumeText.toLowerCase().includes(skill.toLowerCase()));

        if (foundSkills.length > 0) {
            personalizedQuestions.push(`I noticed you listed ${foundSkills[0]} in your experience. Can you describe a complex challenge you solved using it?`);
        }

        personalizedQuestions.push("Looking at your experience section, what would you say was your most significant professional achievement to date?");

        // Add a role-specific experience question
        personalizedQuestions.push(`Based on your background, how has your previous experience prepared you for a ${role} position here?`);
    }

    // Combine: Intro -> Personalized (if any) -> Behavioral -> Technical
    const introQuestion = "Tell me about yourself and your professional background.";

    const finalQuestions = [
        introQuestion,
        ...personalizedQuestions,
        ...pickedBehavioral.map(q => q.question),
        ...pickedTechnical.map(q => q.question)
    ];

    // Limit to 8 questions total for a balanced session
    return finalQuestions.slice(0, 8);
}
