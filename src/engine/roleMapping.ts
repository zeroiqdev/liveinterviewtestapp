/* ══════════════════════════════════════
   Role mapping — onboarding roles →
   blueprint ids with seniority resolution.
   ══════════════════════════════════════ */

const ROLE_TO_BLUEPRINT: Record<string, string> = {
    // Product Management & Design
    "Product Manager": "product_management",
    "Product Owner": "product_management",
    "Technical Product Manager": "product_management",
    "Product Designer": "product_management",
    "UX Researcher": "product_management",
    "Product Marketer": "product_management",

    // Tech & Software Engineering
    "Frontend Developer": "software_tech",
    "Backend Engineer": "software_tech",
    "Full Stack Developer": "software_tech",
    "Software Engineer": "software_tech",
    "Product Engineer": "software_tech",
    "Mobile Developer": "software_tech",
    "iOS Developer": "software_tech",
    "Android Developer": "software_tech",

    // Data Science & Analytics
    "Data Scientist": "data_science_analytics",
    "Data Analyst": "data_science_analytics",
    "Business Analyst": "data_science_analytics",
    "AI Research Scientist": "data_science_analytics",
    "Machine Learning Engineer": "data_science_analytics",

    // DevOps, Cloud & SRE
    "DevOps / SRE": "devops_cloud_sre",
    "DevOps Engineer": "devops_cloud_sre",
    "Cloud Solutions Architect": "devops_cloud_sre",
    "Site Reliability Engineer": "devops_cloud_sre",
    "Robotics Architect": "software_tech",

    // Sales & Bizdev
    "Business Development": "sales_bizdev",
    "Sales / BizDev": "sales_bizdev",
    "Sales Representative": "sales_bizdev",
    "Account Executive": "sales_bizdev",

    // Banking & Finance
    "Financial Analyst": "banking_finance",
    "Investment Banker": "banking_finance",
    "Invesment Banker": "banking_finance",
    "Banking & Finance": "banking_finance",

    // Customer Service
    "Customer Service": "customer_service",
    "Customer Support": "customer_service",
    "Customer Service / Call Centre": "customer_service",
    "Call Centre": "customer_service",

    // Virtual Assistant
    "Virtual Assistant": "virtual_assistant",
    "Executive Assistant": "virtual_assistant",
};

export function blueprintForRole(
    role: string | undefined | null,
    experience?: string | null
): string {
    if (!role) return "software_tech";

    const lower = role.toLowerCase();
    const isJunior =
        experience?.toLowerCase().includes("junior") ||
        experience?.toLowerCase().includes("entry");

    // Check exact lookup first
    if (ROLE_TO_BLUEPRINT[role]) {
        return ROLE_TO_BLUEPRINT[role];
    }

    if (lower.includes("product") || lower.includes("pm")) {
        return "product_management";
    }

    if (lower.includes("devops") || lower.includes("sre") || lower.includes("cloud") || lower.includes("infrastructure")) {
        return "devops_cloud_sre";
    }

    if (lower.includes("data") || lower.includes("machine learning") || lower.includes("ai")) {
        return "data_science_analytics";
    }

    if (
        lower.includes("software") ||
        lower.includes("developer") ||
        lower.includes("frontend") ||
        lower.includes("backend") ||
        lower.includes("full stack") ||
        (lower.includes("engineer") && !lower.includes("oil"))
    ) {
        return "software_tech";
    }

    if (lower.includes("oil") || lower.includes("petroleum") || lower.includes("gas")) {
        if (lower.includes("safety")) return "oil_gas_safety_officer";
        return isJunior ? "oil_gas_fresher" : "oil_gas_experienced";
    }

    if (lower.includes("customer") || lower.includes("call centre") || lower.includes("support")) {
        return "customer_service";
    }

    if (lower.includes("bank") || lower.includes("financ") || lower.includes("invest")) {
        return "banking_finance";
    }

    if (lower.includes("virtual") || lower.includes("assistant")) {
        return "virtual_assistant";
    }

    if (lower.includes("sales") || lower.includes("bizdev") || lower.includes("business dev")) {
        return "sales_bizdev";
    }

    return "software_tech";
}

