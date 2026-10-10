import mongoose, { Schema, Model } from "mongoose";

/** A company's logo, found once and kept in our own storage. */
export interface ICompanyLogo {
    /** The company name, normalised (see companyKey). */
    key: string;
    company: string;
    /** Where the stored copy is served from; null when none could be found. */
    logoUrl: string | null;
    /** Where it came from: "listing" (the job board's card) or "website". */
    source?: string;
    checkedAt: Date;
}

const CompanyLogoSchema = new Schema<ICompanyLogo>(
    {
        key: { type: String, required: true, unique: true, index: true },
        company: { type: String, required: true },
        logoUrl: { type: String, default: null },
        source: { type: String },
        checkedAt: { type: Date, default: Date.now },
    },
    { id: false }
);

const CompanyLogo: Model<ICompanyLogo> =
    mongoose.models.CompanyLogo || mongoose.model<ICompanyLogo>("CompanyLogo", CompanyLogoSchema);
export default CompanyLogo;
