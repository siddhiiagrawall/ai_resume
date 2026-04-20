/**
 * ResumeUpload.tsx — Resume Upload Page with Quality Score
 *
 * Upgraded success screen now displays:
 *  - Overall quality score (0-100) with a colored progress ring
 *  - Grade (A/B/C/D) label
 *  - 4-dimension breakdown (structure, specificity, skills depth, readability)
 *  - One actionable feedback tip from the AI
 *  - Extracted skills, companies, and education
 *
 * The score data comes from the upload API response's `scoreBreakdown` field,
 * which was computed server-side by the resumeScorer service running in
 * parallel with the ChromaDB embedding step.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, CheckCircle, Star, TrendingUp, BookOpen, Users } from 'lucide-react';
import { resumeApi, Resume } from '../services/api';

// Grade color mapping — green for good grades, yellow for okay, red for needs work
const gradeColors: Record<string, string> = {
  A: 'text-green-600 bg-green-50 border-green-200',
  B: 'text-blue-600 bg-blue-50 border-blue-200',
  C: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  D: 'text-red-600 bg-red-50 border-red-200',
};

/** Renders a single score dimension bar */
function ScoreBar({ label, score, max = 25 }: { label: string; score: number; max?: number }) {
  const pct = (score / max) * 100;
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-blue-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>{label}</span>
        <span>{score}/{max}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ResumeUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<Resume | null>(null);
  const navigate = useNavigate();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type === 'application/pdf' || selectedFile.type === 'text/plain') {
        setFile(selectedFile);
        setError('');
      } else {
        setError('Please upload a PDF or TXT file');
        setFile(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError('Please select a file'); return; }

    try {
      setLoading(true);
      setError('');
      const resume = await resumeApi.upload(file);
      setSuccess(resume);
      // Auto-redirect after 8s — longer to give user time to read the score report
      setTimeout(() => navigate('/'), 8000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to upload resume');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Upload Resume</h1>

      {success ? (
        /* ── Success State with Quality Score Report ─────────────────────────── */
        <div className="space-y-4">
          {/* Top success banner */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-3" />
            <h2 className="text-xl font-semibold text-green-900">Resume Uploaded Successfully!</h2>
            <p className="text-green-700 mt-1 text-sm">Redirecting to dashboard in 8 seconds...</p>
          </div>

          {/* Quality Score Card */}
          {success.scoreBreakdown && (
            <div className="bg-white border rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Star className="h-5 w-5 text-yellow-500 mr-2" />
                  Resume Quality Score
                </h3>
                {/* Grade badge */}
                <span className={`text-2xl font-bold px-3 py-1 rounded-lg border ${gradeColors[success.scoreBreakdown.grade]}`}>
                  {success.scoreBreakdown.grade}
                </span>
              </div>

              {/* Big score number */}
              <div className="text-center mb-4">
                <div className="text-5xl font-bold text-gray-900">{success.qualityScore}</div>
                <div className="text-gray-500 text-sm mt-1">out of 100</div>
              </div>

              {/* Dimension breakdown bars */}
              <div className="space-y-3">
                <ScoreBar label="Structure & Organization" score={success.scoreBreakdown.structure} />
                <ScoreBar label="Specificity & Metrics" score={success.scoreBreakdown.specificity} />
                <ScoreBar label="Skills & Tech Depth" score={success.scoreBreakdown.skillsDepth} />
                <ScoreBar label="Readability & Language" score={success.scoreBreakdown.readability} />
              </div>

              {/* AI feedback tip */}
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">💡 Top Tip: </span>
                  {success.scoreBreakdown.feedback}
                </p>
              </div>
            </div>
          )}

          {/* Extracted Profile Info */}
          <div className="bg-white border rounded-lg p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <TrendingUp className="h-4 w-4 mr-2 text-blue-500" />
              Extracted Profile
            </h3>

            {/* Skills */}
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-500 mb-2">SKILLS ({success.skills.length})</p>
              <div className="flex flex-wrap gap-1">
                {success.skills.slice(0, 12).map(skill => (
                  <span key={skill} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">{skill}</span>
                ))}
                {success.skills.length > 12 && <span className="text-xs text-gray-400">+{success.skills.length - 12} more</span>}
              </div>
            </div>

            {/* Companies */}
            {success.companies && success.companies.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
                  <Users className="h-3 w-3 mr-1" /> COMPANIES
                </p>
                <div className="space-y-1">
                  {success.companies.map((c, i) => (
                    <div key={i} className="text-sm text-gray-700">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-gray-400"> — {c.role} · {c.durationYears}y</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {success.education && success.education.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
                  <BookOpen className="h-3 w-3 mr-1" /> EDUCATION
                </p>
                {success.education.map((e, i) => (
                  <div key={i} className="text-sm text-gray-700">
                    <span className="font-medium">{e.degree}</span> in {e.field}
                    <span className="text-gray-400"> · {e.institution}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Upload Form ─────────────────────────────────────────────────────── */
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Resume File (PDF or TXT)
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-blue-400 transition-colors">
              <div className="space-y-1 text-center">
                {file ? (
                  <div className="flex items-center justify-center">
                    <FileText className="h-12 w-12 text-blue-500" />
                    <div className="ml-4 text-left">
                      <p className="text-sm font-medium text-gray-900">{file.name}</p>
                      <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="flex text-sm text-gray-600 justify-center">
                      <label htmlFor="resume" className="cursor-pointer font-medium text-blue-600 hover:text-blue-500">
                        <span>Upload a file</span>
                        <input id="resume" name="resume" type="file" className="sr-only" accept=".pdf,.txt" onChange={handleFileChange} />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-gray-500">PDF, TXT up to 10MB</p>
                    <p className="text-xs text-blue-600 mt-1">✨ AI will score your resume quality on upload</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {file && (
            <button type="button" onClick={() => setFile(null)} className="mb-4 text-sm text-red-600 hover:text-red-700">
              Remove file
            </button>
          )}

          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</div>
          )}

          <button
            type="submit"
            disabled={!file || loading}
            className="w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Analyzing & Uploading...
              </>
            ) : (
              'Upload & Score Resume'
            )}
          </button>
        </form>
      )}
    </div>
  );
}
