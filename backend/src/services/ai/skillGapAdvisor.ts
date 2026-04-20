/**
 * skillGapAdvisor.ts — AI-Powered Skill Gap Learning Path Generator
 *
 * Takes a candidate's missing skills (from the matching engine) and generates
 * a structured, week-by-week learning roadmap to help them qualify for a job.
 *
 * Who uses this feature?
 *  - Candidates: upload their resume to a target job → get a personalized study plan
 *  - Recruiters: understand how "close" a near-miss candidate is to being hireable
 *
 * Output format:
 *   A markdown learning plan:
 *   ## 🎯 Skills to Learn
 *   ## 📅 Learning Roadmap
 *   Week 1: Foundations ... (with specific resources)
 *   ## ⏱️ Estimated Time to Job-Ready
 *
 * Design notes:
 *  - We only generate a plan for MISSING skills, not all skills
 *  - The plan is personalized to the specific job title (React dev plan differs
 *    from DevOps plan even if both require "Docker")
 *  - temperature: 0.5 — allows creative resource suggestions while being structured
 *
 * Uses:
 *  Called by: GET /api/jobs/:jobId/gap-plan/:resumeId
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import dotenv from 'dotenv';

dotenv.config();

const model = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0.5,  // Some creativity allowed for resource suggestions
  openAIApiKey: process.env.OPENAI_API_KEY,
});

const SKILL_GAP_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a senior tech career coach with expertise in helping developers upskill for specific engineering roles.
Create a practical, week-by-week learning roadmap.
Always use this Markdown format:

## 🎯 Skills Gap Analysis
(Brief summary of which skills are most important to learn first and why)

## 📅 Weekly Learning Roadmap
**Week 1: [Topic]**
- What to learn: ...
- Free resources: (mention specific YouTube channels, docs, or free courses)
- Practice project: ...

(Continue for as many weeks as needed, typically 4-8 weeks)

## ⏱️ Estimated Time to Job-Ready
(Realistic estimate with caveats about prior experience)

## 💡 Pro Tips
(2-3 actionable tips specific to this tech stack/role)

Be specific and practical. Mention real resource names (freeCodeCamp, official docs, Fireship YouTube, etc).`,
  ],
  [
    'human',
    `Target Job: {jobTitle}
    
Skills the candidate ALREADY HAS: {existingSkills}
Skills that are MISSING (need to learn): {missingSkills}

Create a personalized learning roadmap to bridge this gap.`,
  ],
]);

export interface SkillGapPlan {
  plan: string;          // Full Markdown learning roadmap
  missingSkills: string[];
  estimatedWeeks: number; // Quick estimate for the UI badge
}

/**
 * generateSkillGapPlan — creates a personalized learning path for missing skills
 *
 * @param jobTitle      - role the candidate is targeting (context for the plan)
 * @param existingSkills - skills the candidate already has (to avoid redundancy)
 * @param missingSkills  - skills from the job that the candidate is missing
 * @returns              - SkillGapPlan with the full markdown roadmap
 */
export async function generateSkillGapPlan(
  jobTitle: string,
  existingSkills: string[],
  missingSkills: string[]
): Promise<SkillGapPlan> {
  // If no skills are missing, return a positive no-op plan
  if (missingSkills.length === 0) {
    return {
      plan: `## 🎉 You're a Strong Match!\n\nYou already have all the required skills for **${jobTitle}**.\n\nFocus on demonstrating your experience in your portfolio and interviews.`,
      missingSkills: [],
      estimatedWeeks: 0,
    };
  }

  try {
    const chain = SKILL_GAP_PROMPT.pipe(model);
    const response = await chain.invoke({
      jobTitle,
      existingSkills: existingSkills.join(', ') || 'None listed',
      missingSkills: missingSkills.join(', '),
    });

    const plan = response.content as string;

    // Rough estimate: ~1.5 weeks per missing skill on average
    // Capped at 12 weeks — anything longer loses credibility for a JD
    const estimatedWeeks = Math.min(12, Math.ceil(missingSkills.length * 1.5));

    return { plan, missingSkills, estimatedWeeks };
  } catch (error) {
    console.error('Skill gap plan generation failed:', error);
    return {
      plan: `## 📚 Skills to Learn\n\n${missingSkills.map(s => `- **${s}**: Search for "${s} tutorial" on YouTube or official documentation`).join('\n')}`,
      missingSkills,
      estimatedWeeks: missingSkills.length * 2,
    };
  }
}
