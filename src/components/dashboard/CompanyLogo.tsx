import React from "react";
import { CompanyLogo as JobsCompanyLogo } from "../jobs/CompanyLogo";

/** The jobs board's logo, at the dashboard's larger size. */
function CompanyLogoComponent(props: { company: string; url?: string; logoUrl?: string; index?: number }) {
    return <JobsCompanyLogo company={props.company} logoUrl={props.logoUrl} size={38} />;
}

export const CompanyLogo = React.memo(CompanyLogoComponent);
