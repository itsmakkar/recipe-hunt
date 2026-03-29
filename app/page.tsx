"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const ChatWindow = dynamic(() => import("@/components/ChatWindow"), { ssr: false });
const FilePanel = dynamic(() => import("@/components/FilePanel"), { ssr: false });

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-amber-50 overflow-hidden">
      {/* Top Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-amber-200 shadow-sm flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          {/* Mobile sidebar toggle */}
          <button
            className="md:hidden p-1.5 rounded-lg hover:bg-amber-50 text-amber-600"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🍳</span>
            <div>
              <h1 className="font-bold text-amber-900 text-lg leading-tight">Recipe Hunter</h1>
              <p className="text-xs text-amber-600 leading-tight">Your personal recipe assistant</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 hidden sm:block">Powered by Gemini 2.0</span>
          <div className="w-2 h-2 rounded-full bg-green-400"></div>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/30 z-20"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — files panel */}
        <aside
          className={`
            w-72 flex-shrink-0 bg-white border-r border-amber-200 flex flex-col
            md:relative md:translate-x-0 md:z-auto
            fixed inset-y-0 left-0 z-30 transition-transform duration-300
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          `}
        >
          <FilePanel />
        </aside>

        {/* Chat area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-gray-50">
          <ChatWindow />
        </main>
      </div>
    </div>
  );
}
