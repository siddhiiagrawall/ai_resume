/**
 * skillExtractor.ts — GPT-Powered Deep Profile Extraction
 *
 * Upgraded from a simple skill list extractor to a full profile extractor.
 * Now extracts THREE types of structured data from resume/job text:
 *
 *  1. skills    → string[]   — technical + soft skills
 *  2. companies → Company[]  — work history with role and duration
 *  3. education → Education[] — degree, field, institution
 *
 * Why a single GPT call for all three?
 *  - One API call = one latency penalty. Extracting each separately would
 *    triple the cost and time (~1-1.5s → ~3-4.5s).
 *  - GPT can understand context across all three categories simultaneously
 *    (e.g., inferring duration from "2019-2022 at Google").
 *  - Fewer tokens in total because the system prompt is shared.
 *
 * Backward compatibility:
 *  extractSkills() still exists and returns just the skills array.
 *  New code can call extractFullProfile() for the complete structured data.
 *
 * Why LLM instead of regex for extraction?
 *  - "Dec 2020 – Present at Meta (2 years of React, Redux, GraphQL)" requires
 *    understanding of date math + role context — impossible with regex.
 *  - LLMs normalize messy formats: "Sr. SWE" → role: "Senior Software Engineer"
 *  - Handles international degree formats: "B.E." → degree: "Bachelor of Engineering"
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import dotenv from 'dotenv';

dotenv.config();

// temperature: 0 — extraction must be deterministic for consistent graph writes
const model = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

// ─── Type Definitions ─────────────────────────────────────────────────────────

/** A company the candidate has worked at */
export interface Company {
  name: string;           // "Google", "Startup X"
  role: string;           // "Senior Software Engineer"
  durationYears: number;  // 3.5 — fractional years supported
}

/** An educational credential */
export interface Education {
  degree: string;      // "B.Tech", "Masters", "PhD"
  field: string;       // "Computer Science", "Data Science"
  institution: string; // "IIT Delhi", "MIT"
}

/** Full structured profile extracted from a resume */
export interface ResumeProfile {
  skills: string[];
  companies: Company[];
  education: Education[];
}

// ─── Prompt Templates ─────────────────────────────────────────────────────────

/**
 * FULL_EXTRACTION_PROMPT — extracts skills, companies, AND education in one call
 *
 * The JSON schema in the prompt is very explicit to reduce parsing failures.
 * We provide a concrete example output so GPT understands the exact shape required.
 * "Return ONLY valid JSON" — prevents GPT from wrapping the JSON in prose.
 */
const FULL_EXTRACTION_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a resume parsing expert. Extract structured information from the resume text.
Return ONLY valid JSON in this exact format, nothing else:
{{
  "skills": ["JavaScript", "React", "Leadership"],
  "companies": [
    {{ "name": "Google", "role": "Software Engineer", "durationYears": 3 }},
    {{ "name": "Meta", "role": "Senior Engineer", "durationYears": 1.5 }}
  ],
  "education": [
    {{ "degree": "B.Tech", "field": "Computer Science", "institution": "IIT Delhi" }}
  ]
}}

Rules:
- skills: all technical AND soft skills mentioned
- companies: estimate durationYears from dates if not explicit (use 1 if unclear)
- education: normalize degrees (B.E → Bachelor of Engineering, M.S. → Masters)
- If a field has no data, return an empty array []`,
  ],
  ['human', '{text}'],
]);

/**
 * SKILL_ONLY_PROMPT — legacy prompt for job description extraction
 * (Job descriptions don't have company/education history)
 */
const SKILL_ONLY_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a skill extraction expert. Extract technical and soft skills from the job description.
Return ONLY a JSON array of skill names, nothing else.
Example: ["JavaScript", "React", "Node.js", "Team Leadership", "Agile"]`,
  ],
  ['human', '{text}'],
]);

// ─── Extraction Functions ─────────────────────────────────────────────────────

/**
 * extractFullProfile — extracts skills, companies, and education from resume text
 *
 * Used by: resumeService.createResume() for full graph enrichment
 *
 * @param text - raw resume text
 * @returns    - structured profile (skills, companies, education)
 */
export async function extractFullProfile(text: string): Promise<ResumeProfile> {
  try {
    const chain = FULL_EXTRACTION_PROMPT.pipe(model);
    const response = await chain.invoke({ text });
    const content = response.content as string;

    // Strip markdown code fences if GPT wraps the JSON in ```json ... ```
    const cleaned = content.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(cleaned);

    return {
      skills: Array.isArray(parsed.skills) ? parsed.skills.map((s: string) => s.trim()).filter(Boolean) : [],
      companies: Array.isArray(parsed.companies) ? parsed.companies : [],
      education: Array.isArray(parsed.education) ? parsed.education : [],
    };
  } catch (error) {
    console.error('Error extracting full profile:', error);
    // Graceful fallback: return what we can extract with backup skill matching
    return {
      skills: extractSkillsFallback(text),
      companies: [],
      education: [],
    };
  }
}

/**
 * extractSkills — extracts ONLY skills (for job descriptions, not resumes)
 *
 * Job descriptions don't have a work history or education section,
 * so we use the simpler skill-only prompt here.
 *
 * @param text - raw job description text
 * @returns    - array of required skill names
 */
export async function extractSkills(text: string): Promise<string[]> {
  try {
    const chain = SKILL_ONLY_PROMPT.pipe(model);
    const response = await chain.invoke({ text });
    const content = response.content as string;
    const cleaned = content.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    const skills = JSON.parse(cleaned);

    if (Array.isArray(skills)) {
      return skills.map((s: string) => s.trim()).filter(Boolean);
    }
    return [];
  } catch (error) {
    console.error('Error extracting skills:', error);
    return extractSkillsFallback(text);
  }
}

/**
 * extractSkillsFallback — keyword-matching backup when GPT is unavailable
 *
 * Scans the text for known skill keywords as a last resort.
 * Won't catch contextual skills but prevents total extraction failure.
 */
function extractSkillsFallback(text: string): string[] {
  const commonSkills = [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++',
    'React', 'Vue', 'Angular', 'Node.js', 'Express', 'Next.js',
    'SQL', 'MongoDB', 'PostgreSQL', 'Redis', 'Neo4j',
    'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'Git',
    'Machine Learning', 'Deep Learning', 'NLP', 'LangChain',
    'Agile', 'Scrum', 'Team Leadership', 'Communication',
  ];

  return commonSkills.filter(skill =>
    text.toLowerCase().includes(skill.toLowerCase())
  );
}
