import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, CheckCircle, XCircle } from 'lucide-react';
import { jobApi, resumeApi, Job, MatchResult } from '../services/api';

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  
  useEffect(() => {
    if (id) {
      loadJob();
      loadMatches();
    }
  }, [id]);
  
  const loadJob = async () => {
    try {
      setLoading(true);
      const data = await jobApi.getById(id!);
      setJob(data);
    } catch (error) {
      console.error('Error loading job:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const loadMatches = async () => {
    try {
      setLoadingMatches(true);
      const data = await resumeApi.getMatches(id!, 10);
      setMatches(data);
    } catch (error) {
      console.error('Error loading matches:', error);
    } finally {
      setLoadingMatches(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (!job) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Job not found</p>
        <Link to="/" className="text-blue-600 hover:underline mt-4 inline-block">
          Back to Jobs
        </Link>
      </div>
    );
  }
  
  return (
    <div className="px-4 py-6">
      <Link
        to="/"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to Jobs
      </Link>
      
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">{job.title}</h1>
        <div className="mb-4">
          <h2 className="text-sm font-medium text-gray-700 mb-2">Required Skills</h2>
          <div className="flex flex-wrap gap-2">
            {job.skills.map((skill) => (
              <span
                key={skill}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-2">Description</h2>
          <p className="text-gray-600 whitespace-pre-wrap">{job.description}</p>
        </div>
      </div>
      
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Top Matching Resumes</h2>
          <button
            onClick={loadMatches}
            disabled={loadingMatches}
            className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            {loadingMatches ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        
        {loadingMatches ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No resumes found</h3>
            <p className="mt-1 text-sm text-gray-500">Upload resumes to see matches.</p>
            <Link
              to="/upload"
              className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              Upload Resume
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {matches.map((match) => (
              <div
                key={match.resumeId}
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{match.resumeName}</h3>
                    <div className="mt-2 flex items-center">
                      <span className="text-2xl font-bold text-blue-600">
                        {match.matchPercentage.toFixed(1)}%
                      </span>
                      <span className="ml-2 text-sm text-gray-500">match</span>
                    </div>
                  </div>
                  <Link
                    to={`/chat/${match.resumeId}`}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Chat →
                  </Link>
                </div>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                      <CheckCircle className="mr-1 h-4 w-4 text-green-500" />
                      Matched Skills ({match.matchedSkills.length})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {match.matchedSkills.length > 0 ? (
                        match.matchedSkills.map((skill) => (
                          <span
                            key={skill}
                            className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800"
                          >
                            {skill}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">None</span>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                      <XCircle className="mr-1 h-4 w-4 text-red-500" />
                      Missing Skills ({match.missingSkills.length})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {match.missingSkills.length > 0 ? (
                        match.missingSkills.map((skill) => (
                          <span
                            key={skill}
                            className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800"
                          >
                            {skill}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">None</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

