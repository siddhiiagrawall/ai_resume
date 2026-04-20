/**
 * App.tsx — Root Application Component & Client-Side Routing
 *
 * This is the top-level component rendered by main.tsx.
 * Its only job is to set up the routing structure — it doesn't contain UI itself.
 *
 * Client-Side Routing (React Router v6):
 *  In a traditional multi-page app, navigating to /jobs/123 would send a new HTTP
 *  request to the server. In a Single Page Application (SPA), React Router
 *  intercepts navigation and SWAPS components in the DOM without a full reload.
 *  This makes navigation feel instant.
 *
 * Route structure:
 *   /             → JobDashboard  (list of all job postings)
 *   /jobs/:id     → JobDetail     (single job + its best-matching resumes)
 *   /upload       → ResumeUpload  (upload a PDF/TXT resume)
 *   /chat/:resumeId → ResumeChat  (AI Q&A about a specific resume)
 *
 * Layout wrapper:
 *  All pages are wrapped in <Layout>, which adds the shared navigation bar.
 *  The nav bar doesn't re-render on route changes — only the <children> inside it do.
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import JobDashboard from './pages/JobDashboard';
import JobDetail from './pages/JobDetail';
import ResumeUpload from './pages/ResumeUpload';
import ResumeChat from './pages/ResumeChat';
import ResumeList from './pages/ResumeList';
import ResumeDetail from './pages/ResumeDetail';

function App() {
  return (
    // BrowserRouter — uses the HTML5 History API (pushState) for clean URLs
    // Alternative: HashRouter uses /#/route URLs (no server config needed)
    <Router>
      {/* Layout wraps every page — contains the nav bar */}
      <Layout>
        <Routes>
          {/* Exact match for root — shows the job listing dashboard */}
          <Route path="/" element={<JobDashboard />} />

          {/* Dynamic segment :id — e.g., /jobs/abc-123-def */}
          {/* useParams() in JobDetail reads this :id value */}
          <Route path="/jobs/:id" element={<JobDetail />} />

          {/* Resume upload form — POST /api/resumes */}
          <Route path="/upload" element={<ResumeUpload />} />

          {/* Browse all uploaded resumes */}
          <Route path="/resumes" element={<ResumeList />} />

          {/* Full candidate profile — quality score, work history, education, skills */}
          <Route path="/resumes/:id" element={<ResumeDetail />} />

          {/* Resume-specific chat — :resumeId scopes the AI to one candidate */}
          <Route path="/chat/:resumeId" element={<ResumeChat />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
