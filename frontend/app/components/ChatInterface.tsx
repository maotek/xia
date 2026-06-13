"use client";

import Link from "next/link";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
    model?: string;
  }>;
};

type OllamaChatChunk = {
  done?: boolean;
  error?: string;
  message?: {
    content?: string;
  };
};

const defaultSystemPrompt =
  "You are a birthday celebrator for Xiaxia. Make her in the spotlight and make her feel special. Be creative, funny, and engaging. Use emojis and playful language to make the conversation lively. Ask her questions about her birthday plans, favorite memories, and what makes her happy.";

function messageId() {
  return crypto.randomUUID();
}

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(defaultSystemPrompt);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadModels() {
      try {
        const response = await fetch("/api/tags", {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Modellen ophalen mislukt (${response.status})`);
        }

        const data = (await response.json()) as OllamaTagsResponse;
        const availableModels = (data.models ?? [])
          .map((item) => item.name || item.model || "")
          .filter(Boolean);

        setModels(availableModels);
        setModel((current) => current || availableModels[0] || "");
        if (availableModels.length === 0) {
          setError("Ollama heeft nog geen modellen beschikbaar.");
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Kan geen verbinding maken met Ollama.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingModels(false);
        }
      }
    }

    void loadModels();
    return () => controller.abort();
  }, []);

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
    if (!content || !model || isStreaming) {
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
            { role: "system", content: systemPrompt.trim() },
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

  const canSubmit = Boolean(input.trim() && model && !isStreaming);

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
        <aside className="chat-settings">
          <div>
            <p className="eyebrow">Instellingen</p>
            <h1>Praat met Xiaxia AI</h1>
            <p>
              Een eenvoudige, lokale chat via het Ollama-model in het cluster.
            </p>
          </div>

          <label htmlFor="chat-model">Model</label>
          <select
            disabled={isLoadingModels || models.length === 0 || isStreaming}
            id="chat-model"
            onChange={(event) => setModel(event.target.value)}
            value={model}
          >
            {isLoadingModels ? <option>Modellen laden...</option> : null}
            {!isLoadingModels && models.length === 0 ? (
              <option>Geen modellen gevonden</option>
            ) : null}
            {models.map((availableModel) => (
              <option key={availableModel} value={availableModel}>
                {availableModel}
              </option>
            ))}
          </select>

          <label htmlFor="system-prompt">System prompt</label>
          <textarea
            disabled={isStreaming}
            id="system-prompt"
            onChange={(event) => setSystemPrompt(event.target.value)}
            rows={8}
            value={systemPrompt}
          />
          <p className="chat-settings-note">
            De system prompt wordt bij ieder bericht opnieuw meegestuurd.
          </p>
        </aside>

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
                disabled={!model}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={model ? "Typ een bericht..." : "Geen model beschikbaar"}
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
