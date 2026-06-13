"use client";

import Link from "next/link";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type OllamaChatChunk = {
  done?: boolean;
  error?: string;
  message?: {
    content?: string;
  };
};

const model = "qwen3.5:2b";
const systemPrompt =
  "You are a birthday celebrator for Xiaxia. Make her in the spotlight and make her feel special. Be creative, funny, and engaging. Use emojis and playful language to make the conversation lively. Ask her questions about her birthday plans, favorite memories, and what makes her happy.";

function messageId() {
  return crypto.randomUUID();
}

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: isStreaming ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, isStreaming]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const content = input.trim();
    if (!content || isStreaming) {
      return;
    }

    const userMessage: ChatMessage = {
      id: messageId(),
      role: "user",
      content,
    };
    const assistantId = messageId();
    const conversation = [...messages, userMessage];

    setInput("");
    setError("");
    setIsStreaming(true);
    setMessages([
      ...conversation,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages: [
            { role: "system", content: systemPrompt },
            ...conversation.map(({ role, content: messageContent }) => ({
              role,
              content: messageContent,
            })),
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `Ollama antwoordde met status ${response.status}.`);
      }
      if (!response.body) {
        throw new Error("De browser heeft geen streaming response ontvangen.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      function processLine(line: string) {
        if (!line.trim()) {
          return;
        }

        const chunk = JSON.parse(line) as OllamaChatChunk;
        if (chunk.error) {
          throw new Error(chunk.error);
        }

        const token = chunk.message?.content;
        if (token) {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + token }
                : message,
            ),
          );
        }
      }

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          processLine(line);
        }

        if (done) {
          if (buffer.trim()) {
            processLine(buffer);
          }
          break;
        }
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId && !message.content
            ? { ...message, content: "Geen antwoord ontvangen." }
            : message,
        ),
      );
    } catch (requestError) {
      if (controller.signal.aborted) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId && !message.content
              ? { ...message, content: "Genereren gestopt." }
              : message,
          ),
        );
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Er ging iets mis tijdens het chatten.",
        );
        setMessages((current) =>
          current.filter(
            (message) => message.id !== assistantId || Boolean(message.content),
          ),
        );
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setError("");
  }

  const canSubmit = Boolean(input.trim() && !isStreaming);

  return (
    <main className="chat-shell">
      <div className="stage-wash" />
      <header className="chat-topbar">
        <Link className="brand" href="/">
          <span className="brand-copy">
            <strong>Xiaxia AI</strong>
            <small>Powered by Ollama</small>
          </span>
        </Link>
        <nav className="chat-nav">
          <Link className="nav-link" href="/">
            Quiz
          </Link>
          <button
            className="chat-clear-button"
            disabled={messages.length === 0 && !isStreaming}
            onClick={clearChat}
            type="button"
          >
            Nieuwe chat
          </button>
        </nav>
      </header>

      <section className="chat-layout">
        <section className="chat-panel" aria-label="Chat">
          <div className="chat-messages" aria-live="polite">
            {messages.length === 0 ? (
              <div className="chat-empty">
                <span>AI</span>
                <h2>Waar kan ik mee helpen?</h2>
                <p>Stel een vraag om de chat te beginnen.</p>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  className={`chat-message chat-message-${message.role}`}
                  key={message.id}
                >
                  <span>{message.role === "user" ? "Jij" : "AI"}</span>
                  <div>
                    {message.content || (
                      <span className="chat-typing" aria-label="AI antwoordt">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </div>
                </article>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-composer-wrap">
            {error ? <p className="chat-error">{error}</p> : null}
            <form className="chat-composer" onSubmit={submit}>
              <textarea
                aria-label="Bericht"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Typ een bericht..."
                rows={1}
                value={input}
              />
              {isStreaming ? (
                <button
                  aria-label="Stop genereren"
                  className="chat-send-button chat-stop-button"
                  onClick={stopStreaming}
                  type="button"
                >
                  Stop
                </button>
              ) : (
                <button
                  aria-label="Verstuur bericht"
                  className="chat-send-button"
                  disabled={!canSubmit}
                  type="submit"
                >
                  Verstuur
                </button>
              )}
            </form>
            <p className="chat-composer-hint">
              Enter om te versturen, Shift+Enter voor een nieuwe regel.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}
