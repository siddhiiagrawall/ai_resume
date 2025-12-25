import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Briefcase } from 'lucide-react';
import { jobApi, Job } from '../services/api';
import JobForm from '../components/JobForm';

export default function JobDashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  
  useEffect(() => {
    loadJobs();
  }, []);
  
  const loadJobs = async () => {
    try {
      setLoading(true);
      const data = await jobApi.getAll();
      setJobs(data);
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleJobCreated = (job: Job) => {
    setJobs([job, ...jobs]);
    setShowForm(false);
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  return (
    <div className="px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Job Postings</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="mr-2 h-5 w-5" />
          New Job
        </button>
      </div>
      
      {showForm && (
        <div className="mb-6">
          <JobForm onSuccess={handleJobCreated} onCancel={() => setShowForm(false)} />
        </div>
      )}
      
      {jobs.length === 0 ? (
        <div className="text-center py-12">
          <Briefcase className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No jobs</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating a new job posting.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <Link
              key={job.id}
              to={`/jobs/${job.id}`}
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{job.title}</h2>
              <p className="text-gray-600 text-sm mb-4 line-clamp-3">{job.description}</p>
              <div className="flex flex-wrap gap-2">
                {job.skills.slice(0, 5).map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {skill}
                  </span>
                ))}
                {job.skills.length > 5 && (
                  <span className="text-xs text-gray-500">+{job.skills.length - 5} more</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

