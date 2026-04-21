import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import JobDashboard from './pages/JobDashboard';
import JobDetail from './pages/JobDetail';
import ResumeUpload from './pages/ResumeUpload';
import ResumeChat from './pages/ResumeChat';
import ResumeList from './pages/ResumeList';
import ResumeDetail from './pages/ResumeDetail';
import Login from './pages/Login';
import Register from './pages/Register';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function PrivateRoute({ children, role }: { children: React.ReactNode, role?: 'RECRUITER' | 'CANDIDATE' }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  
  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<JobDashboard />} />
            <Route path="jobs/:id" element={<JobDetail />} />
            <Route path="upload" element={<ResumeUpload />} />
            <Route 
              path="resumes" 
              element={
                <PrivateRoute role="RECRUITER">
                  <ResumeList />
                </PrivateRoute>
              } 
            />
            <Route path="resumes/:id" element={<ResumeDetail />} />
            <Route path="chat/:resumeId" element={<ResumeChat />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
