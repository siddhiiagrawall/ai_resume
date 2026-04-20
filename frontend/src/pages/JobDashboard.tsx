/**
 * JobDashboard.tsx — Job Listings Page
 *
 * The home page (route: "/") — shows all job postings in a card grid.
 * Users can also open a form to create a new job directly on this page.
 *
 * Key React patterns demonstrated here:
 *
 * 1. DATA FETCHING PATTERN (useEffect + useState):
 *    - useState holds the fetched data, loading flag, and UI toggles
 *    - useEffect fires once on mount ([] dependency array) to load data
 *    - This is the standard pattern before React Query / SWR libraries
 *
 * 2. OPTIMISTIC UI UPDATE:
 *    - After creating a job, we DON'T refetch all jobs from the API
 *    - Instead we prepend the new job to local state immediately
 *    - This feels instant — no loading spinner for the new card
 *    - Trade-off: if the server has other changes, we won't see them
 *
 * 3. CONDITIONAL RENDERING:
 *    - Loading → spinner
 *    - Empty state → empty state UI with call-to-action
 *    - Has data → card grid
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Briefcase, Trash2 } from 'lucide-react';
import { jobApi, type Job } from '../services/api';
import JobForm from '../components/JobForm';

export default function JobDashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null); // jobId being deleted
  
  // useEffect with empty [] — runs ONCE after the first render (component mount)
  // Equivalent to componentDidMount in class components
  useEffect(() => {
    loadJobs();
  }, []);
  
  /**
   * loadJobs — fetches all jobs from the API and updates state
   * Wrapped in try/finally to always clear loading state, even on error.
   */
  const loadJobs = async () => {
    try {
      setLoading(true);
      const data = await jobApi.getAll(); // GET /api/jobs
      setJobs(data);
    } catch (error) {
      console.error('Error loading jobs:', error);
      // Production: show an error toast or inline error message
    } finally {
      setLoading(false); // Always runs — clears spinner even if the request failed
    }
  };
  
  /**
   * handleJobCreated — optimistic update after form submission succeeds
   *
   * Called by JobForm's onSuccess prop with the newly created job.
   * Prepending [job, ...jobs] puts the newest job at the TOP of the list,
   * matching the ORDER BY createdAt DESC used in the backend Cypher query.
   */
  const handleJobCreated = (job: Job) => {
    setJobs([job, ...jobs]);
    setShowForm(false);
  };

  /**
   * handleDeleteJob — confirms + deletes a job with optimistic removal
   * stopPropagation prevents the Link wrapper from navigating while clicking delete
   */
  const handleDeleteJob = async (e: React.MouseEvent, job: Job) => {
    e.preventDefault(); // Don't navigate to job detail
    e.stopPropagation();
    const confirmed = window.confirm(`Delete "${job.title}"?\n\nThis will remove the job and all its match data. Resumes are not affected.`);
    if (!confirmed) return;
    setDeleting(job.id);
    try {
      await jobApi.delete(job.id);
      setJobs(prev => prev.filter(j => j.id !== job.id)); // Optimistic removal
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Failed to delete job. Please try again.');
    } finally {
      setDeleting(null);
    }
  };
  
  // ── Render States ────────────────────────────────────────────────────────────
  
  if (loading) {
    return (
      // Full-height centered spinner while waiting for API response
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  return (
    <div className="px-4 py-6">
      {/* ── Page Header ────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Job Postings</h1>
        {/* Toggle button — shows/hides the inline JobForm */}
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="mr-2 h-5 w-5" />
          New Job
        </button>
      </div>
      
      {/* ── Inline Job Creation Form ────────────────────────────────────── */}
      {/* Conditionally rendered based on showForm state */}
      {showForm && (
        <div className="mb-6">
          {/* Callback props: JobForm reports back to this parent component */}
          <JobForm onSuccess={handleJobCreated} onCancel={() => setShowForm(false)} />
        </div>
      )}
      
      {/* ── Job Cards Grid ──────────────────────────────────────────────── */}
      {jobs.length === 0 ? (
        // Empty state — shown when no jobs have been created yet
        <div className="text-center py-12">
          <Briefcase className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No jobs</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating a new job posting.</p>
        </div>
      ) : (
        // Responsive grid: 1 column on mobile, 2 on medium, 3 on large screens
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <Link
              key={job.id}
              to={`/jobs/${job.id}`}
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow relative group"
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-2 pr-8">{job.title}</h2>
              <p className="text-gray-600 text-sm mb-4 line-clamp-3">{job.description}</p>
              <div className="flex flex-wrap gap-2">
                {job.skills.slice(0, 5).map((skill) => (
                  <span key={skill} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {skill}
                  </span>
                ))}
                {job.skills.length > 5 && (
                  <span className="text-xs text-gray-500">+{job.skills.length - 5} more</span>
                )}
              </div>
              {/* Delete button — top-right corner, visible on hover */}
              <button
                onClick={(e) => handleDeleteJob(e, job)}
                disabled={deleting === job.id}
                className="absolute top-3 right-3 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-40"
                title="Delete job"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
