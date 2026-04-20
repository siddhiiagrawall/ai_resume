/**
 * Layout.tsx — Shared Navigation Shell
 *
 * Wraps every page with a consistent navigation bar and page container.
 * This is the standard "shell layout" pattern in React SPAs:
 *
 *   <Layout>          ← nav bar lives here (rendered once, persists across routes)
 *     {children}      ← only this part changes when you navigate
 *   </Layout>
 *
 * Why this pattern?
 *  Without a Layout wrapper, each page would need to repeat the nav bar markup.
 *  With it, a single change to Layout instantly updates nav for all pages.
 *
 * Active link detection:
 *  Uses React Router's useLocation() to read the current URL path,
 *  then applies different Tailwind classes to the active nav link
 *  (blue underline + blue text vs grey text for inactive links).
 */

import { Link, useLocation } from 'react-router-dom';
import { Briefcase, Upload, Home, Users } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode; // The page component rendered by the active route
}

export default function Layout({ children }: LayoutProps) {
  // useLocation() returns the current URL — re-runs whenever the route changes
  const location = useLocation();
  
  // Returns true if the current URL path exactly matches the given path
  // Used to apply active styles to the correct nav link
  const isActive = (path: string) => location.pathname === path;
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Navigation Bar ──────────────────────────────────────────────── */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              {/* Logo / Brand link — always navigates to home */}
              <Link to="/" className="flex items-center px-2 py-2 text-xl font-bold text-blue-600">
                <Briefcase className="mr-2 h-6 w-6" />
                AI Resume Platform
              </Link>

              {/* Nav links — hidden on mobile (sm:flex shows them on larger screens) */}
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {/* Jobs link — active when on the root route */}
                <Link
                  to="/"
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    isActive('/') ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Home className="mr-1 h-4 w-4" />
                  Jobs
                </Link>

                {/* Upload Resume link */}
                <Link
                  to="/upload"
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    isActive('/upload') ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Upload className="mr-1 h-4 w-4" />
                  Upload Resume
                </Link>

                {/* Resumes browser link */}
                <Link
                  to="/resumes"
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    isActive('/resumes') ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Users className="mr-1 h-4 w-4" />
                  Resumes
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>
      
      {/* ── Page Content ────────────────────────────────────────────────── */}
      {/* max-w-7xl + mx-auto = centered container with max width constraint */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children} {/* The active page component renders here */}
      </main>
    </div>
  );
}
