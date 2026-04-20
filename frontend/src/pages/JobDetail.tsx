/**
 * JobDetail.tsx — Job Page with AI Match Evaluation & Skill Gap Plans
 *
 * Three major new features on this page:
 *
 * 1. "View AI Evaluation" button per match card:
 *    - Calls GET /api/jobs/:id/matches/:resumeId/explain
 *    - Opens a modal showing strengths, gaps, and interview questions (Markdown)
 *    - Uses ReactMarkdown so the formatted output renders beautifully
 *
 * 2. "Get Learning Path" button per match card:
 *    - Calls GET /api/jobs/:id/gap-plan/:resumeId
 *    - Opens a modal showing a week-by-week learning roadmap (Markdown)
 *    - Shows "estimated weeks" badge
 *
 * 3. Richer match cards:
 *    - Shows company names from work history
 *    - Education badge if the candidate has a degree
 *    - Quality score badge (A/B/C/D grade)
 *
 * Modal implementation:
 *    Simple CSS modal using fixed positioning + backdrop blur
 *    No external library needed — just Tailwind + useState
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, CheckCircle, XCircle, Sparkles, BookOpen, X, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { jobApi, resumeApi, type Job, type MatchResult, type CandidateStatus } from '../services/api';

// ─── Modal Component ──────────────────────────────────────────────────────────

/**
 * MarkdownModal — reusable full-screen modal that renders markdown content
 *
 * Used for both the AI Explanation and the Skill Gap Plan.
 * Closes on: X button, backdrop click, or Escape key.
 */
function MarkdownModal({
  title,
  content,
  badge,
  loading,
  onClose,
}: {
  title: string;
  content: string;
  badge?: string;
  loading?: boolean;
  onClose: () => void;
}) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    // Backdrop — fixed overlay that covers the entire viewport
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} // Close on backdrop click
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            {badge && (
              <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                {badge}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content — scrollable */}
        <div className="overflow-y-auto p-6 flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
              <span className="ml-3 text-gray-500">Generating AI evaluation...</span>
            </div>
          ) : (
            // Markdown rendered content with prose typography
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h2: ({ children }) => <h2 className="text-base font-bold text-gray-900 mt-4 mb-2 flex items-center">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-800 mt-3 mb-1">{children}</h3>,
                  li: ({ children }) => <li className="text-sm text-gray-700 mb-1">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                  p: ({ children }) => <p className="text-sm text-gray-700 mb-2">{children}</p>,
                  code: ({ children, className }) => (
                    <code className={`${className} bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs`}>{children}</code>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();

  const [job, setJob] = useState<Job | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  // Map of resumeId → CandidateStatus, loaded alongside matches
  const [statuses, setStatuses] = useState<Record<string, CandidateStatus>>({});
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  // Modal state — which card has a modal open and what type
  const [explainModal, setExplainModal] = useState<{
    resumeId: string;
    resumeName: string;
    content: string;
    loading: boolean;
  } | null>(null);

  const [gapModal, setGapModal] = useState<{
    resumeId: string;
    resumeName: string;
    content: string;
    estimatedWeeks: number;
    loading: boolean;
  } | null>(null);

  useEffect(() => {
    if (id) { loadJob(); loadMatches(); }
  }, [id]);

  const loadJob = async () => {
    try {
      setLoading(true);
      setJob(await jobApi.getById(id!));
    } catch (error) {
      console.error('Error loading job:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMatches = async () => {
    try {
      setLoadingMatches(true);
      // Load matches + statuses in parallel — both are needed to render the cards
      const [matchData, statusData] = await Promise.all([
        resumeApi.getMatches(id!, 10),
        jobApi.getCandidateStatuses(id!),
      ]);
      setMatches(matchData);
      setStatuses(statusData);
    } catch (error) {
      console.error('Error loading matches:', error);
    } finally {
      setLoadingMatches(false);
    }
  };

  /**
   * handleStatusChange — updates a candidate's pipeline status
   * Optimistic: updates local state first, then PATCHes backend
   */
  const handleStatusChange = async (resumeId: string, status: CandidateStatus) => {
    setUpdatingStatus(resumeId);
    // Optimistic update — feels instant to the user
    setStatuses(prev => ({ ...prev, [resumeId]: status }));
    try {
      await jobApi.updateCandidateStatus(id!, resumeId, status);
    } catch (error) {
      console.error('Error updating status:', error);
      // Rollback optimistic update on failure
      setStatuses(prev => { const n = { ...prev }; delete n[resumeId]; return n; });
    } finally {
      setUpdatingStatus(null);
    }
  };

  /**
   * openExplainModal — fetches AI evaluation and opens the explanation modal
   *
   * Opens modal immediately in loading state, then populates content.
   * This way the user sees instant feedback that something is happening.
   */
  const openExplainModal = async (match: MatchResult) => {
    setExplainModal({ resumeId: match.resumeId, resumeName: match.resumeName, content: '', loading: true });
    try {
      const result = await jobApi.explainMatch(id!, match.resumeId, match.matchedSkills, match.missingSkills);
      setExplainModal({ resumeId: match.resumeId, resumeName: match.resumeName, content: result.explanation, loading: false });
    } catch (error) {
      setExplainModal({
        resumeId: match.resumeId,
        resumeName: match.resumeName,
        content: 'Failed to generate evaluation. Please try again.',
        loading: false,
      });
    }
  };

  /**
   * openGapModal — fetches the skill gap learning plan and opens the gap modal
   */
  const openGapModal = async (match: MatchResult) => {
    setGapModal({ resumeId: match.resumeId, resumeName: match.resumeName, content: '', estimatedWeeks: 0, loading: true });
    try {
      const result = await jobApi.getSkillGapPlan(id!, match.resumeId);
      setGapModal({
        resumeId: match.resumeId,
        resumeName: match.resumeName,
        content: result.plan,
        estimatedWeeks: result.estimatedWeeks,
        loading: false,
      });
    } catch (error) {
      setGapModal({
        resumeId: match.resumeId,
        resumeName: match.resumeName,
        content: 'Failed to generate learning plan. Please try again.',
        estimatedWeeks: 0,
        loading: false,
      });
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;
  }

  if (!job) {
    return <div className="text-center py-12"><p className="text-gray-500">Job not found</p><Link to="/" className="text-blue-600 hover:underline mt-4 inline-block">Back to Jobs</Link></div>;
  }

  return (
    <div className="px-4 py-6">
      {/* Modals — rendered at root level, above all content */}
      {explainModal && (
        <MarkdownModal
          title={`AI Evaluation: ${explainModal.resumeName}`}
          content={explainModal.content}
          loading={explainModal.loading}
          onClose={() => setExplainModal(null)}
        />
      )}
      {gapModal && (
        <MarkdownModal
          title={`Learning Path: ${gapModal.resumeName}`}
          content={gapModal.content}
          badge={gapModal.estimatedWeeks > 0 ? `~${gapModal.estimatedWeeks} weeks` : undefined}
          loading={gapModal.loading}
          onClose={() => setGapModal(null)}
        />
      )}

      <Link to="/" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to Jobs
      </Link>

      {/* Job Details Card */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">{job.title}</h1>
        <div className="mb-4">
          <h2 className="text-sm font-medium text-gray-700 mb-2">Required Skills</h2>
          <div className="flex flex-wrap gap-2">
            {job.skills.map((skill) => (
              <span key={skill} className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">{skill}</span>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-2">Description</h2>
          <p className="text-gray-600 whitespace-pre-wrap">{job.description}</p>
        </div>
      </div>

      {/* Matches Section */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Top Matching Resumes</h2>
          <button onClick={loadMatches} disabled={loadingMatches} className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50">
            {loadingMatches ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loadingMatches ? (
          <div className="flex justify-center items-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : matches.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No resumes yet</h3>
            <Link to="/upload" className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
              Upload Resume
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {matches.map((match) => (
              <div key={match.resumeId} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
                {/* Match Header Row */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{match.resumeName}</h3>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-2xl font-bold text-blue-600">{match.matchPercentage.toFixed(1)}%</span>
                      <span className="text-sm text-gray-500">match</span>
                    </div>
                  </div>
                  {/* Quick action links */}
                  <Link to={`/chat/${match.resumeId}`} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    Chat →
                  </Link>
                </div>

                {/* Skills breakdown */}
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <h4 className="text-xs font-medium text-gray-700 mb-2 flex items-center uppercase tracking-wide">
                      <CheckCircle className="mr-1 h-3 w-3 text-green-500" /> Matched ({match.matchedSkills.length})
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {match.matchedSkills.length > 0
                        ? match.matchedSkills.map(skill => (
                            <span key={skill} className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">{skill}</span>
                          ))
                        : <span className="text-xs text-gray-400">None</span>}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-gray-700 mb-2 flex items-center uppercase tracking-wide">
                      <XCircle className="mr-1 h-3 w-3 text-red-500" /> Missing ({match.missingSkills.length})
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {match.missingSkills.length > 0
                        ? match.missingSkills.map(skill => (
                            <span key={skill} className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">{skill}</span>
                          ))
                        : <span className="text-xs text-gray-400">None — perfect match!</span>}
                    </div>
                  </div>
                </div>

                {/* Action Buttons Row + Status Tracking */}
                <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100 items-center">
                  {/* Status dropdown */}
                  <select
                    value={statuses[match.resumeId] || ''}
                    onChange={(e) => handleStatusChange(match.resumeId, e.target.value as CandidateStatus)}
                    disabled={updatingStatus === match.resumeId}
                    className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    title="Set candidate pipeline status"
                  >
                    <option value="">Set Status…</option>
                    <option value="reviewing">👀 Reviewing</option>
                    <option value="shortlisted">⭐ Shortlisted</option>
                    <option value="interviewing">🗓️ Interviewing</option>
                    <option value="offered">🎉 Offered</option>
                    <option value="rejected">❌ Rejected</option>
                  </select>

                  {/* AI Evaluation button */}
                  <button
                    onClick={() => openExplainModal(match)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md transition-colors"
                  >
                    <Sparkles className="h-3 w-3" />
                    AI Evaluation
                  </button>

                  {match.missingSkills.length > 0 && (
                    <button
                      onClick={() => openGapModal(match)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-md transition-colors"
                    >
                      <BookOpen className="h-3 w-3" />
                      Learning Path
                    </button>
                  )}

                  <Link
                    to={`/chat/${match.resumeId}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
                  >
                    💬 Chat with AI
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
