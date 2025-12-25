import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import dotenv from 'dotenv';

dotenv.config();

const model = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

const SKILL_EXTRACTION_PROMPT = ChatPromptTemplate.fromMessages([
  ['system', `You are a skill extraction expert. Extract technical and soft skills from the given text.
Return ONLY a JSON array of skill names, nothing else. Be specific and accurate.
Example: ["JavaScript", "React", "Node.js", "Team Leadership", "Agile"]`],
  ['human', '{text}'],
]);

export async function extractSkills(text: string): Promise<string[]> {
  try {
    const chain = SKILL_EXTRACTION_PROMPT.pipe(model);
    const response = await chain.invoke({ text });
    
    const content = response.content as string;
    // Try to parse JSON array
    const skills = JSON.parse(content.trim());
    
    if (Array.isArray(skills)) {
      return skills.map(s => s.trim()).filter(s => s.length > 0);
    }
    
    return [];
  } catch (error) {
    console.error('Error extracting skills:', error);
    // Fallback: simple keyword extraction
    return extractSkillsFallback(text);
  }
}

function extractSkillsFallback(text: string): string[] {
  // Basic fallback - common tech skills
  const commonSkills = [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'React', 'Node.js',
    'SQL', 'MongoDB', 'PostgreSQL', 'AWS', 'Docker', 'Git',
    'Agile', 'Scrum', 'Team Leadership', 'Communication',
  ];
  
  const found = commonSkills.filter(skill =>
    text.toLowerCase().includes(skill.toLowerCase())
  );
  
  return found;
}

