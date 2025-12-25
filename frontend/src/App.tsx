import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import JobDashboard from './pages/JobDashboard';
import JobDetail from './pages/JobDetail';
import ResumeUpload from './pages/ResumeUpload';
import ResumeChat from './pages/ResumeChat';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<JobDashboard />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/upload" element={<ResumeUpload />} />
          <Route path="/chat/:resumeId" element={<ResumeChat />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;

