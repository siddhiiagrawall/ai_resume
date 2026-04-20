/**
 * JobForm.tsx — Create Job Posting Form Component
 *
 * A controlled form component for creating new job postings.
 * Uses the "callback prop" pattern: instead of managing its own navigation
 * or mutating shared state, it calls onSuccess/onCancel provided by the parent.
 * This makes JobForm reusable and testable in isolation.
 *
 * Controlled component pattern:
 *  Each input is "controlled" — its value is driven by React state, not the DOM.
 *  onChange updates state → state re-renders input → value reflects current state.
 *  This gives full control over validation, formatting, and submission.
 *
 * State:
 *   title       — current value of the job title input
 *   description — current value of the job description textarea
 *   loading     — true while the API request is in-flight (disables submit button)
 *   error       — error message string to display if the request fails
 *
 * Props:
 *   onSuccess(job) — called with the newly created Job when POST succeeds
 *                    Parent uses this to append the job to its local list
 *   onCancel()     — called when user clicks Cancel or X; parent hides this form
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { jobApi, Job } from '../services/api';

interface JobFormProps {
  onSuccess: (job: Job) => void; // Parent updates its job list with the new job
  onCancel: () => void;          // Parent hides the form
}

export default function JobForm({ onSuccess, onCancel }: JobFormProps) {
  // Controlled input state — both fields start empty
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false); // Prevents double-submit
  const [error, setError] = useState('');        // Shown below the form on failure
  
  /**
   * handleSubmit — validates inputs, calls API, delegates result to parent
   *
   * e.preventDefault() stops the default HTML form behaviour (full page refresh).
   * In SPAs, form submission is always handled via JavaScript fetch/axios.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // Prevent HTML form's default GET/POST browser navigation
    
    // Client-side validation before making an API call
    // .trim() ensures "   " (whitespace only) fails validation
    if (!title.trim() || !description.trim()) {
      setError('Title and description are required');
      return;
    }
    
    try {
      setLoading(true);  // Disable submit button during request
      setError('');      // Clear any previous error
      
      // POST /api/jobs — triggers GPT skill extraction + Neo4j write
      const job = await jobApi.create(title, description);
      
      // Pass created job up to parent component (JobDashboard)
      // Parent will prepend it to the jobs list — no refetch needed
      onSuccess(job);
      
      // Clear form fields after successful creation
      setTitle('');
      setDescription('');
    } catch (err: any) {
      // Prefer the server's error message; fall back to generic string
      // err.response?.data?.error comes from Express: res.status(400).json({ error: '...' })
      setError(err.response?.data?.error || 'Failed to create job');
    } finally {
      setLoading(false); // Re-enable submit button whether success or failure
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Form header with close button */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Create New Job</h2>
        {/* X button — closes form without submitting */}
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      
      {/* Controlled form — onSubmit instead of action attribute */}
      <form onSubmit={handleSubmit}>
        {/* Job Title — controlled text input */}
        <div className="mb-4">
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Job Title
          </label>
          <input
            type="text"
            id="title"
            value={title}               // ← Controlled: value from state
            onChange={(e) => setTitle(e.target.value)} // ← Updates state on every keystroke
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., Senior Software Engineer"
          />
        </div>
        
        {/* Job Description — controlled textarea */}
        <div className="mb-4">
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Job Description
          </label>
          <textarea
            id="description"
            value={description}         // ← Controlled: value from state
            onChange={(e) => setDescription(e.target.value)}
            rows={8}                    // Tall enough to paste a full JD
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="Paste job description here..."
          />
        </div>
        
        {/* Error message — only renders when error state is non-empty */}
        {error && (
          <div className="mb-4 text-sm text-red-600">{error}</div>
        )}
        
        {/* Action buttons */}
        <div className="flex justify-end space-x-3">
          {/* Cancel — type="button" prevents accidental form submission */}
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          
          {/* Submit — disabled while loading to prevent double-clicking */}
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {/* Loading state changes button label — visual feedback */}
            {loading ? 'Creating...' : 'Create Job'}
          </button>
        </div>
      </form>
    </div>
  );
}
