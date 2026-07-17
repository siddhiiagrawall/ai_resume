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

import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Briefcase, Upload, Users, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ─── Navigation Bar ─── */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10 w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex space-x-8">
              {/* Logo / Brand */}
              <div className="flex-shrink-0 flex items-center gap-2">
                <Briefcase className="h-6 w-6 text-blue-600" />
                <span className="font-bold text-xl text-blue-600 tracking-tight">
                  AI Resume Platform
                </span>
              </div>

              {/* Links */}
              <div className="hidden sm:-my-px sm:ml-6 sm:flex sm:space-x-8">
                <NavLink
                  to="/"
                  className={({ isActive }) =>
                    `inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${isActive
                      ? 'border-blue-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`
                  }
                >
                  <Briefcase className="w-4 h-4 mr-2" />
                  Jobs
                </NavLink>

                {user?.role === 'CANDIDATE' && (
                  <NavLink
                    to="/upload"
                    className={({ isActive }) =>
                      `inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${isActive
                        ? 'border-blue-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`
                    }
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Resume
                  </NavLink>
                )}

                {user?.role === 'RECRUITER' && (
                  <NavLink
                    to="/resumes"
                    className={({ isActive }) =>
                      `inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${isActive
                        ? 'border-blue-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`
                    }
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Resumes
                  </NavLink>
                )}
              </div>
            </div>

            {/* User Profile & Logout */}
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-700 hidden sm:block">
                {user?.name} <span className="text-gray-400 font-normal">({user?.role})</span>
              </span>
              <button
                onClick={handleLogout}
                className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 transition"
              >
                <LogOut className="w-4 h-4 mr-1" />
                Logout
              </button>
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
