/**
 * ResumeList.tsx — Browse All Uploaded Resumes
 *
 * Route: /resumes
 *
 * Fills the navigation gap: users can now browse all resumes independently
 * of the job matching flow. Recruiters can:
 *   - See quality scores at a glance (letter grade badge)
 *   - Browse top skills
 *   - See company count from work history
 *   - Delete bad/test uploads
 *   - Navigate to full resume profile or AI chat
 *
 * Patterns:
 *   - Confirmation dialog before delete (window.confirm)
 *   - Optimistic removal from state after successful delete
 *   - Quality grade color coding (A=green, B=blue, C=yellow, D=red)
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Trash2, MessageCircle, Eye, Building2, Star } from 'lucide-react';
import { resumeApi, type Resume } from '../services/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Converts a 0-100 score to a letter grade */
function scoreToGrade(score?: number): 'A' | 'B' | 'C' | 'D' | '?' {
  if (score === undefined || score === null) return '?';
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

const gradeColors = {
  A: 'bg-green-100 text-green-800 border-green-200',
  B: 'bg-blue-100 text-blue-800 border-blue-200',
  C: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  D: 'bg-red-100 text-red-800 border-red-200',
  '?': 'bg-gray-100 text-gray-600 border-gray-200',
};

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ResumeList() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null); // resumeId being deleted

  useEffect(() => {
    loadResumes();
  }, []);

  const loadResumes = async () => {
    try {
      setLoading(true);
      setResumes(await resumeApi.getAll());
    } catch (error) {
      console.error('Error loading resumes:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * handleDelete — confirms + deletes a resume
   *
   * Optimistic removal: removes from local state immediately after API confirms.
   * No need to refetch — we just slice the deleted item from the array.
   */
  const handleDelete = async (resume: Resume) => {
    const confirmed = window.confirm(
      `Delete "${resume.name}"?\n\nThis will remove the resume from the database, all match data, and the AI chat history. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(resume.id);
    try {
      await resumeApi.delete(resume.id);
      // Optimistic removal — no refetch needed
      setResumes(prev => prev.filter(r => r.id !== resume.id));
    } catch (error) {
      console.error('Error deleting resume:', error);
      alert('Failed to delete resume. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">All Resumes</h1>
          <p className="text-sm text-gray-500 mt-1">{resumes.length} candidate{resumes.length !== 1 ? 's' : ''} in database</p>
        </div>
        <Link
          to="/upload"
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          + Upload Resume
        </Link>
      </div>

      {/* ── Empty State ───────────────────────────────────────────────────── */}
      {resumes.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg shadow">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No resumes yet</h3>
          <p className="mt-1 text-sm text-gray-500">Upload a PDF or TXT resume to get started.</p>
          <Link
            to="/upload"
            className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
          >
            Upload First Resume
          </Link>
        </div>
      ) : (
        /* ── Resume Cards Grid ───────────────────────────────────────────── */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {resumes.map((resume) => {
            const grade = scoreToGrade(resume.qualityScore);
            return (
              <div
                key={resume.id}
                className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-5 flex flex-col gap-3"
              >
                {/* Card Header: name + grade badge */}
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold text-gray-900 line-clamp-2 flex-1">
                    {resume.name}
                  </h2>
                  {/* Quality Score Grade Badge */}
                  <span
                    className={`shrink-0 text-sm font-bold px-2.5 py-0.5 rounded-full border ${gradeColors[grade]}`}
                    title={`Quality score: ${resume.qualityScore ?? 'Not yet scored'}`}
                  >
                    {grade !== '?' ? `${grade} (${resume.qualityScore})` : 'Unscored'}
                  </span>
                </div>

                {/* Meta: companies + upload date */}
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  {resume.companies && resume.companies.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {resume.companies.length} compan{resume.companies.length === 1 ? 'y' : 'ies'}
                    </span>
                  )}
                  {resume.qualityScore !== undefined && (
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      Score: {resume.qualityScore}/100
                    </span>
                  )}
                  <span>{new Date(resume.createdAt).toLocaleDateString()}</span>
                </div>

                {/* Skills Preview: first 5 skills */}
                {resume.skills && resume.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {resume.skills.slice(0, 5).map(skill => (
                      <span
                        key={skill}
                        className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700"
                      >
                        {skill}
                      </span>
                    ))}
                    {resume.skills.length > 5 && (
                      <span className="text-xs text-gray-400">+{resume.skills.length - 5} more</span>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2 border-t border-gray-100 mt-auto">
                  <Link
                    to={`/resumes/${resume.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors"
                  >
                    <Eye className="h-3 w-3" />
                    View Profile
                  </Link>
                  <Link
                    to={`/chat/${resume.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
                  >
                    <MessageCircle className="h-3 w-3" />
                    Chat
                  </Link>
                  {/* Delete button — shown grayed out while deleting */}
                  <button
                    onClick={() => handleDelete(resume)}
                    disabled={deleting === resume.id}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="h-3 w-3" />
                    {deleting === resume.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
