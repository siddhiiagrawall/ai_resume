import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface Job {
  id: string;
  title: string;
  description: string;
  skills: string[];
  createdAt: string;
}

export interface Resume {
  id: string;
  name: string;
  fileUrl: string;
  text: string;
  skills: string[];
  createdAt: string;
}

export interface MatchResult {
  resumeId: string;
  resumeName: string;
  matchPercentage: number;
  matchedSkills: string[];
  missingSkills: string[];
  score: number;
}

export const jobApi = {
  create: async (title: string, description: string): Promise<Job> => {
    const response = await api.post<Job>('/jobs', { title, description });
    return response.data;
  },
  
  getAll: async (): Promise<Job[]> => {
    const response = await api.get<Job[]>('/jobs');
    return response.data;
  },
  
  getById: async (id: string): Promise<Job> => {
    const response = await api.get<Job>(`/jobs/${id}`);
    return response.data;
  },
};

export const resumeApi = {
  upload: async (file: File): Promise<Resume> => {
    const formData = new FormData();
    formData.append('resume', file);
    const response = await api.post<Resume>('/resumes', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  
  getAll: async (): Promise<Resume[]> => {
    const response = await api.get<Resume[]>('/resumes');
    return response.data;
  },
  
  getById: async (id: string): Promise<Resume> => {
    const response = await api.get<Resume>(`/resumes/${id}`);
    return response.data;
  },
  
  getMatches: async (jobId: string, top: number = 10): Promise<MatchResult[]> => {
    const response = await api.get<MatchResult[]>(`/jobs/${jobId}/matches`, {
      params: { top },
    });
    return response.data;
  },
};

export const chatApi = {
  sendMessage: async (
    resumeId: string,
    message: string,
    sessionId?: string
  ): Promise<{ response: string; sessionId: string }> => {
    const response = await api.post<{ response: string; sessionId: string }>(
      `/chat/${resumeId}`,
      { message, sessionId }
    );
    return response.data;
  },
  
  getHistory: async (resumeId: string, sessionId: string) => {
    const response = await api.get(`/chat/${resumeId}/history/${sessionId}`);
    return response.data;
  },
};

