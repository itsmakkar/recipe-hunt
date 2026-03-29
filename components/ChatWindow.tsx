"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "👋 Hi Rishav! I'm **Recipe Hunter**, your personal recipe assistant.\n\nI answer **only** from your uploaded files. Upload a recipe file on the left, then ask me anything — ingredients, steps, substitutions, anything!",
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text?: string) {
    const userText = (text || input).trim();
    if (!userText || streaming) return;

    const newMessages: Message[] = [
      ...messages,
      { role: "user", content: userText },
    ];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    // Placeholder for assistant reply
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const finalText = accumulated;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: finalText,
          };
          return updated;
        });
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const suggestions = [
    "What recipes do I have?",
    "List all ingredients for the first recipe",
    "How do I make this dish step by step?",
    "Any quick recipes under 30 mins?",
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0 mt-1">
                R
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm
                ${msg.role === "user"
                  ? "bg-amber-500 text-white rounded-tr-sm"
                  : "bg-white text-gray-800 border border-gray-100 rounded-tl-sm"
                }`}
            >
              {msg.role === "assistant" ? (
                msg.content === "" && streaming ? (
                  <span className="inline-flex gap-1 items-center text-gray-400">
                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>●</span>
                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>●</span>
                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>●</span>
                  </span>
                ) : (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                      li: ({ children }) => <li>{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      code: ({ children }) => <code className="bg-gray-100 px-1 rounded text-xs">{children}</code>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                )
              ) : (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions (only on first load, no user messages yet) */}
      {messages.length === 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => sendMessage(s)}
              className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-3 py-1.5 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="px-4 py-3 border-t border-gray-100 bg-white">
        <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-200 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your recipes…"
            rows={1}
            disabled={streaming}
            className="flex-1 bg-transparent resize-none text-sm text-gray-800 placeholder-gray-400 outline-none max-h-40"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || streaming}
            className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all
              ${input.trim() && !streaming
                ? "bg-amber-500 hover:bg-amber-600 text-white"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
          >
            {streaming ? (
              <span className="animate-spin text-xs">⟳</span>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1 text-center">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
