"use client";

import Link from "next/link";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type Phase = "lobby" | "question" | "reveal" | "final";
type Role = "player" | "admin";
type ConnectionStatus = "connecting" | "connected" | "offline";

type AppProps = {
  frontendPod: string;
};

type Question = {
  id: string;
  kind: "quiz";
  prompt: string;
  choices: string[];
  allows_multiple: boolean;
  correct_indices?: number[];
};

type Player = {
  id: string;
  name: string;
  score: number;
  streak: number;
  connected: boolean;
  answered: boolean;
  last_delta: number;
  last_correct: boolean | null;
};

type LeaderboardEntry = {
  rank: number;
  id: string;
  name: string;
  score: number;
  streak: number;
  connected: boolean;
  last_delta: number;
  last_correct: boolean | null;
};

type Snapshot = {
  type: "state";
  phase: Phase;
  current_index: number | null;
  total_questions: number;
  current_question: Question | null;
  players: Player[];
  leaderboard: LeaderboardEntry[];
  answer_counts: number[];
  answered_count: number;
  player_count: number;
  question_duration: number;
  timer_ends_at: number | null;
  timer_remaining: number;
  you: {
    player_id: string | null;
    answered: boolean;
    answer_indices: number[];
    correct: boolean | null;
    points: number | null;
  };
};

const optionClasses = ["option-red", "option-blue", "option-gold", "option-green"];
const optionLabels = ["A", "B", "C", "D", "E", "F"];
const joinNameKey = "mao-quiz-name";
const playerIdKey = "mao-quiz-player-id";

function wsUrl(role: Role) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || defaultApiBase();
  const url = new URL(apiBase);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = `?role=${role}`;
  return url.toString();
}

function defaultApiBase() {
  if (typeof window === "undefined") {
    return "http://localhost";
  }
  if (process.env.NODE_ENV === "development") {
    const url = new URL(window.location.origin);
    url.port = "8000";
    return url.origin;
  }
  return window.location.origin;
}

function useQuizSocket(role: Role) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      setStatus("connecting");
      const socket = new WebSocket(wsUrl(role));
      socketRef.current = socket;

      socket.onopen = () => {
        setStatus("connected");
        if (role === "player") {
          const name = window.localStorage.getItem(joinNameKey);
          const playerId = window.localStorage.getItem(playerIdKey);
          if (name) {
            socket.send(
              JSON.stringify({
                type: "join",
                name,
                player_id: playerId,
              }),
            );
          }
        }
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data) as Snapshot;
        if (data.type === "state") {
          setSnapshot(data);
          if (role === "player" && data.you.player_id) {
            window.localStorage.setItem(playerIdKey, data.you.player_id);
          }
        }
      };

      socket.onclose = () => {
        if (stopped) {
          return;
        }
        setStatus("offline");
        retry = setTimeout(connect, 1200);
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    connect();

    return () => {
      stopped = true;
      if (retry) {
        clearTimeout(retry);
      }
      socketRef.current?.close();
    };
  }, [role]);

  function send(payload: Record<string, unknown>) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  }

  return { snapshot, status, send };
}

function ConnectionPill({ status }: { status: ConnectionStatus }) {
  return (
    <span className={`connection-pill connection-${status}`}>
      <span className="connection-dot" />
      {status === "connected" ? "Live" : status === "connecting" ? "Verbinden" : "Offline"}
    </span>
  );
}

function Shell({
  children,
  status,
  frontendPod,
  compact = false,
}: {
  children: React.ReactNode;
  status: ConnectionStatus;
  frontendPod: string;
  compact?: boolean;
}) {
  return (
    <main className={`quiz-shell ${compact ? "quiz-shell-compact" : ""}`}>
      <div className="stage-wash" />
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">M</span>
          <span className="brand-copy">
            <strong>Xiaxia</strong>
            <small>23rd BDay Quiz</small>
          </span>
        </Link>
        <nav className="topnav">
          <Link className="nav-link" href="/">
            Spelers
          </Link>
          <span className="pod-pill" title="Frontend pod">
            <span>Pod</span>
            <b>{frontendPod}</b>
          </span>
          <ConnectionPill status={status} />
        </nav>
      </header>
      {children}
    </main>
  );
}

function rankLabel(rank: number) {
  if (rank === 1) return "1";
  if (rank === 2) return "2";
  if (rank === 3) return "3";
  return String(rank);
}

function Leaderboard({
  entries,
  title = "Ranking",
}: {
  entries: LeaderboardEntry[];
  title?: string;
}) {
  return (
    <section className="ranking-panel">
      <div className="panel-heading">
        <p>{title}</p>
        <span>{entries.length} spelers</span>
      </div>
      <div className="ranking-list">
        {entries.length === 0 ? (
          <p className="empty-state">Nog geen spelers.</p>
        ) : (
          entries.slice(0, 8).map((player) => (
            <div className="rank-row" key={player.id}>
              <span className="rank-badge">{rankLabel(player.rank)}</span>
              <div>
                <strong>{player.name}</strong>
                <p>
                  {player.streak > 1 ? `${player.streak} streak` : "klaar voor punten"}
                </p>
              </div>
              <div className="score-block">
                <strong>{player.score}</strong>
                {player.last_delta > 0 ? <span>+{player.last_delta}</span> : null}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function QuestionHeader({ snapshot }: { snapshot: Snapshot }) {
  const questionNumber =
    snapshot.current_index === null ? 0 : Math.min(snapshot.current_index + 1, snapshot.total_questions);

  return (
    <div className="question-meta">
      <span>
        Ronde {questionNumber} / {snapshot.total_questions}
      </span>
      <span>
        {snapshot.answered_count} / {snapshot.player_count} antwoorden
      </span>
      {snapshot.phase === "question" && snapshot.timer_ends_at ? <TimerPill snapshot={snapshot} /> : null}
    </div>
  );
}

function TimerPill({ snapshot }: { snapshot: Snapshot }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (snapshot.phase !== "question" || !snapshot.timer_ends_at) {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [snapshot.phase, snapshot.timer_ends_at]);

  const remaining = snapshot.timer_ends_at
    ? Math.max(0, Math.ceil(snapshot.timer_ends_at - now / 1000))
    : Math.ceil(snapshot.timer_remaining);
  const progress =
    snapshot.question_duration > 0
      ? Math.max(0, Math.min(1, remaining / snapshot.question_duration))
      : 0;

  return (
    <span
      className={`timer-pill ${remaining <= 5 ? "timer-pill-hot" : ""}`}
      style={{ "--timer-progress": progress } as CSSProperties}
    >
      {remaining}s
    </span>
  );
}

function JoinScreen({
  status,
  onJoin,
  frontendPod,
}: {
  status: ConnectionStatus;
  onJoin: (name: string) => void;
  frontendPod: string;
}) {
  const [name, setName] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = name.trim();
    if (cleaned) {
      onJoin(cleaned);
    }
  }

  return (
    <Shell frontendPod={frontendPod} status={status}>
      <section className="join-layout">
        <div className="join-copy">
          <p className="eyebrow">Live party quiz</p>
          <h1>Hoe goed ken jij mij?</h1>
          <p className="lede">
            Vul je naam in, wacht op de host en speel mee vanaf je eigen scherm.
          </p>
        </div>
        <form className="join-card" onSubmit={submit}>
          <div className="join-card-heading">
            <span>Join the game</span>
            <h2>Klaar om te spelen?</h2>
          </div>
          <label htmlFor="player-name">Naam</label>
          <input
            id="player-name"
            maxLength={28}
            onChange={(event) => setName(event.target.value)}
            placeholder="Jouw naam"
            value={name}
          />
          <button className="primary-button" disabled={status !== "connected"} type="submit">
            <span>Meedoen</span>
            <span aria-hidden="true">&rarr;</span>
          </button>
        </form>
      </section>
    </Shell>
  );
}

function Lobby({ snapshot }: { snapshot: Snapshot }) {
  return (
    <section className="play-layout">
      <div className="question-card lobby-card">
        <p className="eyebrow">Lobby</p>
        <h1>Wacht op de eerste vraag</h1>
        <p className="lede">Iedereen die meedoet verschijnt hieronder zodra ze verbonden zijn.</p>
        <div className="player-chips">
          {snapshot.players.length === 0 ? (
            <span className="player-chip muted">Nog niemand binnen</span>
          ) : (
            snapshot.players.map((player) => (
              <span className="player-chip" key={player.id}>
                {player.name}
              </span>
            ))
          )}
        </div>
      </div>
      <Leaderboard entries={snapshot.leaderboard} />
    </section>
  );
}

function QuizOptions({
  answered,
  question,
  submittedIndices,
  onAnswer,
}: {
  answered: boolean;
  question: Question;
  submittedIndices: number[];
  onAnswer: (optionIndices: number[]) => void;
}) {
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const visibleSelection = answered ? submittedIndices : selectedIndices;

  function selectOption(index: number) {
    if (!question.allows_multiple) {
      onAnswer([index]);
      return;
    }
    setSelectedIndices((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
    );
  }

  return (
    <>
      {question.allows_multiple ? <p className="multi-answer-hint">Kies alle juiste antwoorden.</p> : null}
      <div className="option-grid">
        {question.choices.map((choice, index) => {
          const selected = visibleSelection.includes(index);
          return (
            <button
              className={`answer-option ${optionClasses[index % optionClasses.length]} ${
                selected ? "selected" : ""
              }`}
              disabled={answered}
              key={choice}
              onClick={() => selectOption(index)}
              type="button"
            >
              <span className="option-symbol">{optionLabels[index]}</span>
              <span>{choice}</span>
            </button>
          );
        })}
      </div>
      {question.allows_multiple && !answered ? (
        <button
          className="answer-submit"
          disabled={selectedIndices.length === 0}
          onClick={() => onAnswer(selectedIndices)}
          type="button"
        >
          Antwoorden bevestigen
        </button>
      ) : null}
    </>
  );
}

function PlayerQuestion({
  snapshot,
  onAnswer,
}: {
  snapshot: Snapshot;
  onAnswer: (optionIndices: number[]) => void;
}) {
  const question = snapshot.current_question;
  if (!question) {
    return <Lobby snapshot={snapshot} />;
  }

  const answered = snapshot.you.answered;

  return (
    <section className="play-layout">
      <div className="question-card">
        <QuestionHeader snapshot={snapshot} />
        <h1>{question.prompt}</h1>
        <QuizOptions
          answered={answered}
          key={question.id}
          onAnswer={onAnswer}
          question={question}
          submittedIndices={snapshot.you.answer_indices}
        />
        {answered ? <p className="answer-lock">Antwoord staat vast.</p> : null}
      </div>
      <Leaderboard entries={snapshot.leaderboard} />
    </section>
  );
}

function RevealView({ snapshot }: { snapshot: Snapshot }) {
  const question = snapshot.current_question;
  if (!question) {
    return <Lobby snapshot={snapshot} />;
  }

  const correctIndices = question.correct_indices ?? [];
  const totalAnswers = snapshot.answer_counts.reduce((sum, count) => sum + count, 0);

  return (
    <section className="play-layout">
      <div className="question-card reveal-card">
        <QuestionHeader snapshot={snapshot} />
        <h1>{question.prompt}</h1>
        <div className="answer-reveal">
          <span>Correct antwoord</span>
          <strong>{correctIndices.map((index) => question.choices[index]).join(", ")}</strong>
        </div>
        <div className="result-strip">
          {snapshot.you.correct === true ? (
            <strong>Goed: +{snapshot.you.points ?? 0}</strong>
          ) : snapshot.you.correct === false ? (
            <strong>Net mis</strong>
          ) : (
            <strong>Geen antwoord</strong>
          )}
        </div>
        <div className="bars">
          {question.choices.map((choice, index) => {
            const count = snapshot.answer_counts[index] || 0;
            const width = totalAnswers === 0 ? 0 : Math.round((count / totalAnswers) * 100);
            return (
              <div className="bar-row" key={choice}>
                <span>{choice}</span>
                <div className="bar-track">
                  <div
                    className={`bar-fill ${correctIndices.includes(index) ? "bar-correct" : ""}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <strong>{count}</strong>
              </div>
            );
          })}
        </div>
      </div>
      <Leaderboard entries={snapshot.leaderboard} title="Tussenstand" />
    </section>
  );
}

function FinalView({ snapshot }: { snapshot: Snapshot }) {
  const topThree = snapshot.leaderboard.slice(0, 3);
  return (
    <section className="final-layout">
      <div className="final-panel">
        <p className="eyebrow">Finale ranking</p>
        <h1>Winnaar bekend</h1>
        <div className="podium">
          {topThree.map((player) => (
            <div className={`podium-place podium-${player.rank}`} key={player.id}>
              <span>{rankLabel(player.rank)}</span>
              <strong>{player.name}</strong>
              <p>{player.score} punten</p>
            </div>
          ))}
        </div>
      </div>
      <Leaderboard entries={snapshot.leaderboard} title="Eindstand" />
    </section>
  );
}

export function PlayerApp({ frontendPod }: AppProps) {
  const { snapshot, status, send } = useQuizSocket("player");
  const joined = Boolean(snapshot?.you.player_id);

  function join(name: string) {
    window.localStorage.setItem(joinNameKey, name);
    send({
      type: "join",
      name,
      player_id: window.localStorage.getItem(playerIdKey),
    });
  }

  function answer(optionIndices: number[]) {
    send({ type: "answer", option_indices: optionIndices });
  }

  if (!joined) {
    return <JoinScreen frontendPod={frontendPod} onJoin={join} status={status} />;
  }

  return (
    <Shell frontendPod={frontendPod} status={status}>
      {!snapshot ? null : snapshot.phase === "lobby" ? (
        <Lobby snapshot={snapshot} />
      ) : snapshot.phase === "question" ? (
        <PlayerQuestion onAnswer={answer} snapshot={snapshot} />
      ) : snapshot.phase === "reveal" ? (
        <RevealView snapshot={snapshot} />
      ) : (
        <FinalView snapshot={snapshot} />
      )}
    </Shell>
  );
}

function AdminButton({
  children,
  disabled,
  onClick,
  variant = "default",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  variant?: "default" | "primary" | "danger";
}) {
  return (
    <button
      className={`admin-button admin-button-${variant}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function AdminControls({
  snapshot,
  send,
}: {
  snapshot: Snapshot | null;
  send: (payload: Record<string, unknown>) => void;
}) {
  const phase = snapshot?.phase || "lobby";

  function admin(action: string) {
    send({ type: "admin", action });
  }

  return (
    <section className="admin-controls">
      <AdminButton onClick={() => admin("start")} variant="primary">
        Start
      </AdminButton>
      <AdminButton disabled={phase === "question"} onClick={() => admin("next")} variant="primary">
        Volgende
      </AdminButton>
      <AdminButton onClick={() => admin("previous")}>Vorige</AdminButton>
      <AdminButton onClick={() => admin("reset")} variant="danger">
        Reset
      </AdminButton>
    </section>
  );
}

function AdminQuestionCard({ snapshot }: { snapshot: Snapshot }) {
  const question = snapshot.current_question;
  if (!question) {
    return (
      <section className="admin-card">
        <p className="eyebrow">Status</p>
        <h2>{snapshot.phase === "final" ? "Quiz afgerond" : "Nog niet gestart"}</h2>
      </section>
    );
  }

  return (
    <section className="admin-card admin-question-card">
      <QuestionHeader snapshot={snapshot} />
      <h2>{question.prompt}</h2>
      <div className="admin-options">
        {question.choices.map((choice, index) => (
          <div
            className={`admin-option ${question.correct_indices?.includes(index) ? "admin-option-correct" : ""}`}
            key={choice}
          >
            <span>{optionLabels[index]}</span>
            <strong>{choice}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlayerTable({ players }: { players: Player[] }) {
  return (
    <section className="admin-card">
      <div className="panel-heading">
        <p>Spelers</p>
        <span>{players.length}</span>
      </div>
      <div className="player-table">
        {players.map((player) => (
          <div className="player-table-row" key={player.id}>
            <span className={`status-dot ${player.connected ? "online" : ""}`} />
            <strong>{player.name}</strong>
            <span>{player.answered ? "antwoord binnen" : "wacht"}</span>
            <b>{player.score}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuestionRail({ snapshot }: { snapshot: Snapshot }) {
  const items = useMemo(() => Array.from({ length: snapshot.total_questions }, (_, index) => index), [snapshot.total_questions]);

  return (
    <section className="admin-card">
      <div className="panel-heading">
        <p>Rondes</p>
        <span>{snapshot.current_index === null ? "-" : snapshot.current_index + 1}</span>
      </div>
      <div className="question-rail">
        {items.map((index) => (
          <span
            className={`rail-item ${
              snapshot.current_index === index ? "active" : snapshot.current_index !== null && index < snapshot.current_index ? "done" : ""
            }`}
            key={index}
          >
            {index + 1}
          </span>
        ))}
      </div>
    </section>
  );
}

export function AdminApp({ frontendPod }: AppProps) {
  const { snapshot, status, send } = useQuizSocket("admin");

  return (
    <Shell compact frontendPod={frontendPod} status={status}>
      <section className="admin-layout">
        <div className="admin-main">
          <div className="admin-hero">
            <div>
              <p className="eyebrow">Host dashboard</p>
              <h1>Quiz control</h1>
            </div>
            <AdminControls send={send} snapshot={snapshot} />
          </div>
          {snapshot ? <AdminQuestionCard snapshot={snapshot} /> : null}
          {snapshot ? <QuestionRail snapshot={snapshot} /> : null}
        </div>
        <aside className="admin-side">
          {snapshot ? <Leaderboard entries={snapshot.leaderboard} title="Ranking" /> : null}
          {snapshot ? <PlayerTable players={snapshot.players} /> : null}
        </aside>
      </section>
    </Shell>
  );
}
