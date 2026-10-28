import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Profile } from "./store.js";

export const DEFAULT_RESUME_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../sandbox/workspace/Akshaya_Ramprasad_resume.pdf",
);

export const DEFAULT_PROFILE: Profile = {
  fullName: "Akshaya Ramprasad",
  targetRoles: [
    "Customer Success Manager",
    "Customer Success Specialist",
    "Client Success Manager",
    "Account Manager",
    "Customer Support Specialist",
    "Marketing Operations",
  ],
  locations: ["Fremont, CA", "San Francisco Bay Area", "Remote"],
  skills: [
    "Client and customer communication",
    "Relationship building",
    "Issue resolution",
    "Cross-team coordination",
    "Customer onboarding",
    "Digital marketing strategy",
    "Social media planning",
    "Content planning",
    "Adobe Illustrator",
    "SQL",
    "Tableau",
    "Certified Scrum Product Owner (CSPO)",
  ],
  yearsExperience: 6,
  phone: "323-687-2875",
  email: "Akshayaaramp@gmail.com",
  city: "Fremont",
  country: "United States",
  resumeFilePath: DEFAULT_RESUME_PATH,
  links: [
    { label: "LinkedIn", url: "https://www.linkedin.com/in/akshayaramprasad" },
  ],
  constraints: [
    "Work authorization and sponsorship are not stated on the resume — ask before answering visa questions.",
  ],
  summary: [
    "Customer-facing professional in Fremont, CA with experience across customer support, client support, and marketing strategy, and an M.S. in Marketing Analytics from California State University, Long Beach (Aug 2023–Dec 2024).",
    "Yesvite, Customer Success Manager, San Francisco, Aug 2025–Feb 2026: partnered with the founder and engineering on marketing strategy and pre-launch website planning; improved the customer onboarding playbook; launched a feedback page (Google Form to Firebase); used Claude and GPT for website themes; learned Adobe Illustrator to contribute visual assets.",
    "Content Culture, Customer Success Specialist (volunteer), remote, Apr 2025–Aug 2025: guided small-business clients on social and digital marketing; translated client needs into plans; coordinated with design and marketing.",
    "Iron Mountain, Customer Success Specialist, India, Feb 2021–Dec 2022: owned 80+ SMB accounts; 24-hour average response time; 90% CSAT and positive NPS; 98% SLA compliance.",
    "Amazon, Customer Success Analyst, India, Jul 2017–Feb 2021: high-volume chat and email support; analyzed ticket patterns and contributed to a documented 3% churn reduction; later supported 80+ Amazon Basics seller accounts through onboarding and going live. Best Performer Award for fast, high-quality issue resolution.",
    "B.Com., Avinashilingam University, 2017. CSPO; Intermediate SQL (DataCamp); Essential Tableau (LinkedIn Learning).",
  ].join(" "),
};
