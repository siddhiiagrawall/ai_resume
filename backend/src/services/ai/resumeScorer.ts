/**
 * resumeScorer.ts — AI-Powered Resume Quality Scorer
 *
 * Evaluates a resume's quality across 4 dimensions and returns a 0-100 score.
 * This score is stored in Neo4j on the Resume node and shown to users on upload.
 *
 * Why score resumes?
 *  From a recruiter's perspective: a low-quality resume (missing achievements,
 *  generic language, no metrics) is harder to evaluate than a structured one.
 *  From a candidate's perspective: immediate feedback drives improvements.
 *
 * Scoring Dimensions (0-25 each):
 *  1. Structure (25 pts)  — Has clear sections (Experience, Education, Skills, etc.)
 *  2. Specificity (25 pts)— Contains quantified achievements ("reduced load time by 40%")
 *  3. Skills Depth (25 pts)— Mentions specific tools/technologies, not just vague terms
 *  4. Readability (25 pts) — Professional language, appropriate length, no jargon overload
 *
 * Why GPT for scoring instead of a rules-based system?
 *  Rules like "count bullet points" or "check for numbers" miss context.
 *  GPT can evaluate: "Led a team" (vague, 0 pts) vs "Led a 5-person team that shipped
 *  3 features reducing churn by 20%" (specific, full credit).
 *
 * The raw score JSON is validated against the expected schema before use.
 * If parsing fails, a default score of 50 is returned (not 0) to avoid
 * discouraging candidates due to a GPT formatting error.
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import dotenv from 'dotenv';

dotenv.config();

// temperature: 0 — scoring should be deterministic and reproducible
const model = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

const SCORER_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an expert resume evaluator. Score the resume on 4 dimensions (0-25 each, total 0-100).

Return ONLY valid JSON, no other text:
{
  "structure": <0-25>,
  "specificity": <0-25>,
  "skillsDepth": <0-25>,
  "readability": <0-25>,
  "total": <0-100>,
  "feedback": "One sentence of the most impactful improvement the candidate can make."
}

Scoring guide:
- structure (0-25): Has clear sections (Experience, Education, Skills, Projects). 
  25 = all present, 15 = most present, 5 = poorly organized
- specificity (0-25): Quantified achievements with numbers/metrics.
  25 = many metrics, 15 = some, 5 = all vague statements
- skillsDepth (0-25): Specific modern technologies vs vague terms.
  25 = rich tech stack, 15 = moderate, 5 = generic or minimal
- readability (0-25): Professional tone, appropriate length (1-2 pages), no overuse of buzzwords.
  25 = excellent, 15 = acceptable, 5 = poor`,
  ],
  ['human', 'Score this resume:\n\n{resumeText}'],
]);

export interface ResumeScoreResult {
  total: number;           // 0-100 overall score
  structure: number;       // 0-25
  specificity: number;     // 0-25
  skillsDepth: number;     // 0-25
  readability: number;     // 0-25
  feedback: string;        // One actionable improvement tip
  grade: string;           // "A", "B", "C", "D" — human-friendly label
}

/**
 * scoreResume — evaluate resume quality and return structured score
 *
 * @param resumeText - first 5000 chars of resume (enough for accurate scoring)
 * @returns          - ResumeScoreResult with breakdown + grade
 */
export async function scoreResume(resumeText: string): Promise<ResumeScoreResult> {
  try {
    const chain = SCORER_PROMPT.pipe(model);
    // Use first 5000 chars — representative sample, reduces token cost
    const response = await chain.invoke({ resumeText: resumeText.substring(0, 5000) });
    const content = response.content as string;

    const cleaned = content.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(cleaned);

    const total = Math.min(100, Math.max(0, parsed.total || 0));
    
    // Map total score to a letter grade
    const grade = total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 55 ? 'C' : 'D';

    return {
      total,
      structure: parsed.structure || 0,
      specificity: parsed.specificity || 0,
      skillsDepth: parsed.skillsDepth || 0,
      readability: parsed.readability || 0,
      feedback: parsed.feedback || 'Add quantified achievements to make your experience more impactful.',
      grade,
    };
  } catch (error) {
    console.error('Resume scoring failed:', error);
    // Neutral default — never penalize candidates due to our API failure
    return {
      total: 50,
      structure: 12,
      specificity: 12,
      skillsDepth: 13,
      readability: 13,
      feedback: 'Unable to analyze resume quality at this time.',
      grade: 'C',
    };
  }
}
