"use client";

import Link from "next/link";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
};

type OllamaChatChunk = {
  done?: boolean;
  error?: string;
  message?: {
    content?: string;
    thinking?: string;
  };
};

const model = "qwen2.5:1.5b";
const systemPrompt =
  `You are the AI host at Xiaxia's 23rd birthday party.

Rules:
- The user is a party guest, not Xiaxia.
- Celebrate Xiaxia in every reply.
- Always connect the reply to Xiaxia or her birthday.
- Be cheerful, kind, and playful.
- Ask for a birthday wish, compliment, or fun memory when it fits.
- Never insult Xiaxia.
- Use the same language as the user.
- Keep replies short: 1 to 3 sentences.

Every reply must celebrate Xiaxia.`;

function messageId() {
  return crypto.randomUUID();
}

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({
        behavior: isStreaming ? "auto" : "smooth",
        block: "end",
      });
    }
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

    setInput("");
    setError("");
    setIsStreaming(true);
    shouldAutoScrollRef.current = true;
    setMessages([
      ...messages,
      userMessage,
      { id: assistantId, role: "assistant", content: "", thinking: "" },
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
          think: false,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content },
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

        const thinking = chunk.message?.thinking;
        if (thinking) {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    thinking: (message.thinking ?? "") + thinking,
                  }
                : message,
            ),
          );
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
          message.id === assistantId &&
          !message.content &&
          !message.thinking
            ? { ...message, content: "Geen antwoord ontvangen." }
            : message,
        ),
      );
    } catch (requestError) {
      if (controller.signal.aborted) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId &&
            !message.content &&
            !message.thinking
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
            (message) =>
              message.id !== assistantId ||
              Boolean(message.content) ||
              Boolean(message.thinking),
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

  function handleMessagesScroll() {
    const element = messagesRef.current;
    if (!element) {
      return;
    }

    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 80;
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
          <div
            className="chat-messages"
            aria-live="polite"
            onScroll={handleMessagesScroll}
            ref={messagesRef}
          >
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
                    {message.thinking ? (
                      <details
                        className="chat-thinking"
                        open={!message.content}
                      >
                        <summary>Denkproces</summary>
                        <p>{message.thinking}</p>
                      </details>
                    ) : null}
                    {message.content ? (
                      <span className="chat-message-content">
                        {message.content}
                      </span>
                    ) : !message.thinking ? (
                      <span className="chat-typing" aria-label="AI antwoordt">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : null}
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
