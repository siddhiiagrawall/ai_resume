/**
 * ResumeDetail.tsx — Full Candidate Profile Page
 *
 * Route: /resumes/:id
 *
 * Shows everything extracted from a resume in one place:
 *   - Quality score gauge (big number + grade + progress bars per dimension)
 *   - Work history timeline (companies with role + duration)
 *   - Education section (degree + field + institution)
 *   - Full skills cloud
 *   - "Chat with AI" CTA
 *   - "Re-score" button: triggers POST /api/resumes/:id/reprocess
 *
 * The re-score pattern is interesting for interviews:
 *   It re-runs GPT extraction WITHOUT re-uploading — uses the text already
 *   stored in Neo4j. This is the "reprocess" pattern for idempotent AI calls.
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, MessageCircle, RefreshCw, Building2, GraduationCap,
  Briefcase, Calendar, Award, BookOpen
} from 'lucide-react';
import { resumeApi, type Resume } from '../services/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreToGrade(score?: number): 'A' | 'B' | 'C' | 'D' | '?' {
  if (score === undefined || score === null) return '?';
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

const gradeConfig = {
  A: { color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', bar: 'bg-green-500', label: 'Excellent' },
  B: { color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', bar: 'bg-blue-500', label: 'Good' },
  C: { color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', bar: 'bg-yellow-500', label: 'Fair' },
  D: { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', bar: 'bg-red-500', label: 'Needs Work' },
  '?': { color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', bar: 'bg-gray-400', label: 'Not Scored' },
};

// ─── Score Dimension Bar ───────────────────────────────────────────────────────

function DimensionBar({ label, score, max = 25 }: { label: string; score?: number; max?: number }) {
  const pct = score !== undefined ? Math.round((score / max) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>{label}</span>
        <span className="font-medium">{score ?? '?'}/{max}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ResumeDetail() {
  const { id } = useParams<{ id: string }>();
  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessMsg, setReprocessMsg] = useState('');

  useEffect(() => {
    if (id) loadResume();
  }, [id]);

  const loadResume = async () => {
    try {
      setLoading(true);
      setResume(await resumeApi.getById(id!));
    } catch (error) {
      console.error('Error loading resume:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * handleReprocess — re-runs GPT extraction + scoring without re-uploading
   *
   * Shows optimistic "Re-scoring…" state, then updates the resume data in place.
   * This avoids a full page reload while still reflecting the new score.
   */
  const handleReprocess = async () => {
    if (!resume) return;
    setReprocessing(true);
    setReprocessMsg('');
    try {
      const updated = await resumeApi.reprocess(resume.id);
      setResume(updated);
      setReprocessMsg(`✅ Re-scored: ${updated.qualityScore}/100`);
    } catch (error) {
      setReprocessMsg('❌ Re-scoring failed. Please try again.');
    } finally {
      setReprocessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }
  if (!resume) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Resume not found</p>
        <Link to="/resumes" className="text-blue-600 hover:underline mt-4 inline-block">← Back to Resumes</Link>
      </div>
    );
  }

  const grade = scoreToGrade(resume.qualityScore);
  const config = gradeConfig[grade];

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto">
      {/* Back link */}
      <Link to="/resumes" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to Resumes
      </Link>

      {/* ── Header Card ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{resume.name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              Uploaded {new Date(resume.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleReprocess}
              disabled={reprocessing}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md border border-gray-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${reprocessing ? 'animate-spin' : ''}`} />
              {reprocessing ? 'Re-scoring…' : 'Re-score'}
            </button>
            <Link
              to={`/chat/${resume.id}`}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              Chat with AI
            </Link>
          </div>
        </div>
        {reprocessMsg && (
          <p className="mt-3 text-sm font-medium text-gray-700 bg-gray-50 px-3 py-2 rounded">{reprocessMsg}</p>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* ── Left Column ────────────────────────────────────────────────── */}
        <div className="md:col-span-1 space-y-6">

          {/* Quality Score Card */}
          <div className={`bg-white rounded-lg shadow p-5 border-t-4 ${config.border}`}>
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Award className="h-4 w-4" /> Resume Quality
            </h2>
            {/* Big score number */}
            <div className="text-center my-4">
              <div className={`text-5xl font-black ${config.color}`}>
                {resume.qualityScore ?? '?'}
              </div>
              <div className="text-sm text-gray-500 mt-1">out of 100</div>
              <div className={`mt-2 inline-block text-xs font-bold px-3 py-1 rounded-full ${config.bg} ${config.color} border ${config.border}`}>
                Grade {grade} — {config.label}
              </div>
            </div>
            {/* Dimension bars */}
            {resume.scoreBreakdown && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">Score Breakdown</p>
                <DimensionBar label="Structure" score={resume.scoreBreakdown.structure} />
                <DimensionBar label="Specificity" score={resume.scoreBreakdown.specificity} />
                <DimensionBar label="Skills Depth" score={resume.scoreBreakdown.skillsDepth} />
                <DimensionBar label="Readability" score={resume.scoreBreakdown.readability} />
              </div>
            )}
            {!resume.scoreBreakdown && resume.qualityScore !== undefined && (
              <p className="text-xs text-gray-400 text-center">Click "Re-score" to see dimension breakdown</p>
            )}
          </div>

          {/* Education Card */}
          {resume.education && resume.education.length > 0 && (
            <div className="bg-white rounded-lg shadow p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-purple-500" /> Education
              </h2>
              <div className="space-y-3">
                {resume.education.map((edu, i) => (
                  <div key={i} className="border-l-2 border-purple-200 pl-3">
                    <div className="text-sm font-medium text-gray-900">{edu.degree} in {edu.field}</div>
                    <div className="text-xs text-gray-500">{edu.institution}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right Column ───────────────────────────────────────────────── */}
        <div className="md:col-span-2 space-y-6">

          {/* Work History */}
          {resume.companies && resume.companies.length > 0 && (
            <div className="bg-white rounded-lg shadow p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-500" /> Work History
              </h2>
              <div className="space-y-4">
                {resume.companies.map((company, i) => (
                  <div key={i} className="flex items-start gap-3">
                    {/* Timeline dot */}
                    <div className="mt-1 flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <Briefcase className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{company.role}</div>
                      <div className="text-sm text-gray-600">{company.name}</div>
                      {company.durationYears > 0 && (
                        <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                          <Calendar className="h-3 w-3" />
                          {company.durationYears} year{company.durationYears !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skills Cloud */}
          {resume.skills && resume.skills.length > 0 && (
            <div className="bg-white rounded-lg shadow p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-green-500" /> Skills ({resume.skills.length})
              </h2>
              <div className="flex flex-wrap gap-2">
                {resume.skills.map(skill => (
                  <span
                    key={skill}
                    className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-800 border border-green-200"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* AI Feedback (if available from re-score) */}
          {resume.scoreBreakdown?.feedback && (
            <div className="bg-white rounded-lg shadow p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">💡 AI Feedback</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{resume.scoreBreakdown.feedback}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
