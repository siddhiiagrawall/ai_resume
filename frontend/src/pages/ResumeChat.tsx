/**
 * ResumeChat.tsx — AI Chat Interface (Streaming + Markdown)
 *
 * This is the fully upgraded chat page with two major improvements:
 *
 * 1. STREAMING RESPONSES (ChatGPT-like typing effect):
 *    Instead of waiting for the full AI response, tokens arrive token-by-token
 *    via Server-Sent Events (SSE). The UI renders each token as it arrives.
 *
 *    Frontend streaming implementation:
 *      - Uses fetch() (not EventSource because we need POST with a body)
 *      - response.body is a ReadableStream — we get a reader from it
 *      - reader.read() yields chunks of bytes → decoded to text → parsed as JSON SSE events
 *      - Types of events: { type: 'session' }, { type: 'token', content: '...' }, { type: 'done' }
 *
 * 2. MARKDOWN RENDERING:
 *    AI responses are rendered via <ReactMarkdown> (with remark-gfm for tables, etc.)
 *    This means GPT can use **bold**, bullet lists, code blocks, and tables,
 *    and they render properly instead of appearing as raw markdown text.
 *
 * Other patterns:
 *  - useRef for DOM scroll without triggering re-renders
 *  - Optimistic user message append before API responds
 *  - Streaming message: a growing string updated on each token event
 *  - Error display in-chat (no crash, graceful degradation)
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send, User, Bot, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { resumeApi, chatApi, type Resume } from '../services/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean; // True while this message is still being generated
}

export default function ResumeChat() {
  const { resumeId } = useParams<{ resumeId: string }>();

  const [resume, setResume] = useState<Resume | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();

  // Ref to the invisible sentinel div at the bottom — scroll target
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (resumeId) loadResume();
  }, [resumeId]);

  // Auto-scroll whenever messages array updates (new message or token added)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadResume = async () => {
    try {
      const data = await resumeApi.getById(resumeId!);
      setResume(data);

      // ── Chat History Restore ──────────────────────────────────────────────
      // Check localStorage for a saved sessionId for this specific resumeId.
      // If one exists, fetch history from the backend and restore the messages.
      // This lets users resume conversations after a page refresh.
      //
      // Key design: sessionId is scoped per-resume (not globally).
      // localStorage key: `chat_session_${resumeId}`
      const savedSession = localStorage.getItem(`chat_session_${resumeId}`);
      if (savedSession) {
        try {
          const { history } = await chatApi.getHistory(resumeId!, savedSession);
          if (history && history.length > 0) {
            // Restore saved history — convert backend format to Message format
            const restored: Message[] = history.map((msg: { role: string; content: string }) => ({
              role: msg.role as Message['role'],
              content: msg.content,
            }));
            setSessionId(savedSession);
            setMessages(restored);
            return; // Skip default greeting — history is already populated
          }
        } catch {
          // History expired or server restarted — start fresh (in-memory sessions are lost on restart)
          localStorage.removeItem(`chat_session_${resumeId}`);
        }
      }

      // Default greeting (no saved history)
      setMessages([{
        role: 'assistant',
        content: `Hello! I'm ready to answer questions about **${data.name}**.\n\nI can help with:\n- Work experience and roles\n- Technical skills and expertise\n- Education background\n- Project highlights\n\nWhat would you like to know?`,
      }]);
    } catch (error) {
      console.error('Error loading resume:', error);
    }
  };

  /**
   * handleSend — sends message and streams the AI response token by token
   *
   * Streaming flow:
   *  1. Append user message immediately (optimistic UI)
   *  2. Append a placeholder assistant message with isStreaming: true
   *  3. Open a fetch() POST to the /stream endpoint
   *  4. Get response.body.getReader() — a ReadableStream reader
   *  5. Loop: reader.read() → decode bytes → split by "\n" → parse JSON events
   *  6. On 'session' event: store sessionId for future turns
   *  7. On 'token' event: append token to the streaming message in state
   *  8. On 'done' event: mark isStreaming: false, exit loop
   */
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || !resumeId) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    // Step 1: Append user message optimistically
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    // Step 2: Add an empty streaming placeholder for the assistant reply
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);

    try {
      // Step 3: Open fetch stream to the SSE endpoint
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/chat/${resumeId}/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userMessage, sessionId }),
        }
      );

      if (!response.body) throw new Error('No response body');

      // Step 4: Get the ReadableStream reader
      const reader = response.body.getReader();
      const decoder = new TextDecoder(); // Converts Uint8Array bytes → string

      let buffer = ''; // Accumulates partial SSE lines

      // Step 5: Read loop — continues until 'done' event or stream closes
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode the byte chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by "\n\n" — process complete events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete last line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6); // Remove "data: " prefix
          if (!jsonStr.trim()) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'session') {
              // Step 6: Store session ID for multi-turn continuity
              setSessionId(event.sessionId);
              // Persist to localStorage so history can be restored on page refresh
              // Key is scoped per-resume so different resumes have independent sessions
              localStorage.setItem(`chat_session_${resumeId}`, event.sessionId);

            } else if (event.type === 'token') {
              // Step 7: Append token to the last (streaming) message
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.isStreaming) {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + event.content,
                  };
                }
                return updated;
              });

            } else if (event.type === 'done') {
              // Step 8: Mark streaming complete
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.isStreaming) {
                  updated[updated.length - 1] = { ...last, isStreaming: false };
                }
                return updated;
              });
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch (parseError) {
            // Skip malformed events — don't crash the entire stream
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
      // Replace streaming placeholder with an error message
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.isStreaming) {
          updated[updated.length - 1] = {
            role: 'assistant',
            content: 'Sorry, I encountered an error. Please try again.',
            isStreaming: false,
          };
        }
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  if (!resume) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      <Link to="/" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to Jobs
      </Link>

      {/* Resume Header */}
      <div className="bg-white rounded-lg shadow mb-4 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">{resume.name}</h1>
          {/* Streaming indicator badge */}
          <span className="inline-flex items-center text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
            <Zap className="h-3 w-3 mr-1" /> Streaming AI
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {resume.skills.slice(0, 8).map((skill) => (
            <span key={skill} className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
              {skill}
            </span>
          ))}
          {resume.skills.length > 8 && (
            <span className="text-xs text-gray-500">+{resume.skills.length - 8} more</span>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="bg-white rounded-lg shadow flex-1 flex flex-col overflow-hidden">
        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex items-start space-x-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                {/* Avatar */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-blue-600' : 'bg-gray-200'}`}>
                  {msg.role === 'user' ? <User className="h-4 w-4 text-white" /> : <Bot className="h-4 w-4 text-gray-600" />}
                </div>

                {/* Message Bubble */}
                <div className={`rounded-lg px-4 py-3 ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                  {msg.role === 'assistant' ? (
                    // ── Markdown rendered AI message ──────────────────────
                    // ReactMarkdown parses the markdown string and renders
                    // proper HTML elements (h2, ul, li, strong, code, etc.)
                    // prose class provides good typography defaults
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          // Style code blocks within chat bubbles
                          code: ({ children, className }) => (
                            <code className={`${className} bg-gray-200 text-gray-800 px-1 py-0.5 rounded text-xs`}>
                              {children}
                            </code>
                          ),
                          // Style headers in AI responses
                          h2: ({ children }) => <h2 className="text-sm font-bold text-gray-900 mt-2 mb-1">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-800 mt-1">{children}</h3>,
                          // Style links
                          a: ({ href, children }) => <a href={href} className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                      {/* Blinking cursor animation while streaming */}
                      {msg.isStreaming && (
                        <span className="inline-block w-1 h-4 bg-gray-500 ml-1 animate-pulse" />
                      )}
                    </div>
                  ) : (
                    // User messages: plain text (no markdown needed)
                    <p className="text-sm">{msg.content}</p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator dots — shown ONLY before streaming starts */}
          {loading && messages[messages.length - 1]?.content === '' && (
            <div className="flex justify-start">
              <div className="flex items-start space-x-2">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-gray-600" />
                </div>
                <div className="bg-gray-100 rounded-lg px-4 py-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Scroll sentinel */}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Form — pinned at bottom */}
        <form onSubmit={handleSend} className="border-t p-4">
          <div className="flex space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this resume..."
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
