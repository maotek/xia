"use client";

import Link from "next/link";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type Phase = "lobby" | "question" | "reveal" | "final";
type Role = "player" | "admin";
type ConnectionStatus = "connecting" | "connected" | "offline";

type Question = {
  id: string;
  kind: "quiz" | "slide";
  prompt: string;
  choices: string[];
  media?: "baby-photo";
  answer?: string;
  correct_index?: number;
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
    answer_index: number | null;
    correct: boolean | null;
    points: number | null;
  };
};

const optionClasses = ["option-red", "option-blue", "option-gold", "option-green"];
const joinNameKey = "mao-quiz-name";
const playerIdKey = "mao-quiz-player-id";

function wsUrl(role: Role) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const url = new URL(apiBase);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = `?role=${role}`;
  return url.toString();
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
      {status === "connected" ? "Live" : status === "connecting" ? "Verbinden" : "Offline"}
    </span>
  );
}

function Shell({
  children,
  status,
  compact = false,
}: {
  children: React.ReactNode;
  status: ConnectionStatus;
  compact?: boolean;
}) {
  return (
    <main className={`quiz-shell ${compact ? "quiz-shell-compact" : ""}`}>
      <div className="stage-wash" />
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">M</span>
          <span>Xiaxia 23rd BDay Quiz</span>
        </Link>
        <nav className="topnav">
          <Link href="/">Spelers</Link>
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

function BabyPhotoFrame() {
  const [failed, setFailed] = useState(false);

  return (
    <div className="photo-frame">
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/babyfoto.jpg" alt="Babyfoto" onError={() => setFailed(true)} />
      ) : (
        <div className="photo-fallback">
          <span>Babyfoto</span>
          <strong>Reveal</strong>
        </div>
      )}
    </div>
  );
}

function QuestionMedia({ question }: { question: Question }) {
  if (question.media === "baby-photo") {
    return <BabyPhotoFrame />;
  }
  return (
    <div className="reveal-orb">
      <span>?</span>
    </div>
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
      {snapshot.phase === "question" ? <TimerPill snapshot={snapshot} /> : null}
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
}: {
  status: ConnectionStatus;
  onJoin: (name: string) => void;
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
    <Shell status={status}>
      <section className="join-layout">
        <div className="join-copy">
          <p className="eyebrow">Live party quiz</p>
          <h1>Hoe goed ken jij mij?</h1>
          <p className="lede">
            Vul je naam in, wacht op de host en speel mee vanaf je eigen scherm.
          </p>
        </div>
        <form className="join-card" onSubmit={submit}>
          <label htmlFor="player-name">Naam</label>
          <input
            id="player-name"
            maxLength={28}
            onChange={(event) => setName(event.target.value)}
            placeholder="Jouw naam"
            value={name}
          />
          <button className="primary-button" disabled={status !== "connected"} type="submit">
            Meedoen
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

function PlayerQuestion({
  snapshot,
  onAnswer,
}: {
  snapshot: Snapshot;
  onAnswer: (optionIndex: number) => void;
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
        {question.kind === "slide" ? (
          <div className="slide-stage">
            <QuestionMedia question={question} />
          </div>
        ) : (
          <div className="option-grid">
            {question.choices.map((choice, index) => {
              const selected = snapshot.you.answer_index === index;
              return (
                <button
                  className={`answer-option ${optionClasses[index % optionClasses.length]} ${
                    selected ? "selected" : ""
                  }`}
                  disabled={answered}
                  key={choice}
                  onClick={() => onAnswer(index)}
                  type="button"
                >
                  <span className="option-symbol">{["A", "B", "C", "D"][index]}</span>
                  <span>{choice}</span>
                </button>
              );
            })}
          </div>
        )}
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

  const isQuiz = question.kind === "quiz";
  const correctIndex = question.correct_index ?? -1;
  const totalAnswers = snapshot.answer_counts.reduce((sum, count) => sum + count, 0);

  return (
    <section className="play-layout">
      <div className="question-card reveal-card">
        <QuestionHeader snapshot={snapshot} />
        <h1>{question.prompt}</h1>
        {isQuiz ? (
          <>
            <div className="answer-reveal">
              <span>Correct antwoord</span>
              <strong>{question.choices[correctIndex]}</strong>
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
                        className={`bar-fill ${index === correctIndex ? "bar-correct" : ""}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <strong>{count}</strong>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="slide-stage">
            <QuestionMedia question={question} />
          </div>
        )}
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

export function PlayerApp() {
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

  function answer(optionIndex: number) {
    send({ type: "answer", option_index: optionIndex });
  }

  if (!joined) {
    return <JoinScreen onJoin={join} status={status} />;
  }

  return (
    <Shell status={status}>
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
      {question.kind === "quiz" ? (
        <div className="admin-options">
          {question.choices.map((choice, index) => (
            <div
              className={`admin-option ${question.correct_index === index ? "admin-option-correct" : ""}`}
              key={choice}
            >
              <span>{["A", "B", "C", "D"][index]}</span>
              <strong>{choice}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="admin-slide-note">
          <QuestionMedia question={question} />
        </div>
      )}
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

export function AdminApp() {
  const { snapshot, status, send } = useQuizSocket("admin");

  return (
    <Shell compact status={status}>
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
