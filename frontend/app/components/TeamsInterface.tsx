"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Player = {
  id: number;
  name: string;
  points: number;
  position: number;
};

type Team = {
  id: number;
  players: Player[];
};

type PlayerDraft = {
  id?: number;
  name: string;
  points: string;
};

const emptyPlayers = (): PlayerDraft[] =>
  Array.from({ length: 4 }, () => ({ name: "", points: "0" }));

function teamTotal(team: Team) {
  return team.players.reduce((total, player) => total + player.points, 0);
}

function sortedTeams(teams: Team[]) {
  return [...teams].sort((left, right) => {
    const pointsDifference = teamTotal(right) - teamTotal(left);
    return pointsDifference || left.id - right.id;
  });
}

function teamLabel(team: Team, teams: Team[]) {
  const orderedById = [...teams].sort((left, right) => left.id - right.id);
  return `Team ${orderedById.findIndex((item) => item.id === team.id) + 1}`;
}

function normalizeTeams(data: unknown): Team[] {
  if (!Array.isArray(data)) {
    throw new Error("De teamservice gaf een ongeldig antwoord.");
  }
  return data as Team[];
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Teamservice antwoordde met status ${response.status}.`);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function useTeams(poll = false) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    try {
      const data = await apiRequest<unknown>("/api/teams");
      setTeams(normalizeTeams(data));
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Teams ophalen is mislukt.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    if (!poll) {
      return () => window.clearTimeout(initialLoad);
    }
    const interval = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [poll, refresh]);

  return { teams, isLoading, error, setError, refresh };
}

function TeamsHeader({
  admin = false,
  onRefresh,
}: {
  admin?: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="teams-topbar">
      <Link className="brand" href="/">
        <span className="brand-copy">
          <strong>Xiaxia Teams</strong>
          <small>{admin ? "Teambeheer" : "Live scorebord"}</small>
        </span>
      </Link>
      <nav className="teams-nav">
        <Link className="nav-link" href={admin ? "/teams" : "/"}>
          {admin ? "Scorebord" : "Quiz"}
        </Link>
        <button className="teams-refresh-button" onClick={onRefresh} type="button">
          Vernieuwen
        </button>
      </nav>
    </header>
  );
}

export function TeamsDashboard() {
  const { teams, isLoading, error, refresh } = useTeams(true);

  const rankedTeams = useMemo(() => sortedTeams(teams), [teams]);
  const maximumTeamScore = Math.max(1, ...teams.map(teamTotal));

  return (
    <main className="teams-shell">
      <div className="stage-wash" />
      <TeamsHeader onRefresh={() => void refresh(true)} />

      <section className="teams-dashboard">
        <div className="teams-hero">
          <div>
            <p className="eyebrow">Live teams</p>
            <h1>Wie staat er bovenaan?</h1>
            <p>Scores worden iedere vijf seconden bijgewerkt.</p>
          </div>
        </div>

        {error ? <p className="teams-error">{error}</p> : null}

        {isLoading && teams.length === 0 ? (
          <div className="teams-loading">Teams laden...</div>
        ) : teams.length === 0 ? (
          <div className="teams-empty-state">
            <h2>Nog geen teams</h2>
            <p>De host kan teams aanmaken via het teambeheer.</p>
          </div>
        ) : (
          <section className="team-score-grid">
            {rankedTeams.map((team, index) => {
              const total = teamTotal(team);
              const teamWidth = Math.max(3, (total / maximumTeamScore) * 100);
              const maximumPlayerScore = Math.max(
                1,
                ...team.players.map((player) => player.points),
              );
              return (
                <article
                  className="team-score-card"
                  key={team.id}
                >
                  <div className="team-card-heading">
                    <span className="team-rank">#{index + 1}</span>
                    <div>
                      <h2>{teamLabel(team, teams)}</h2>
                      <p>{team.players.length} spelers</p>
                    </div>
                    <strong>{total}</strong>
                  </div>
                  <div className="team-total-track">
                    <div style={{ width: `${teamWidth}%` }} />
                  </div>
                  <div className="team-player-distribution">
                    {team.players
                      .slice()
                      .sort(
                        (left, right) =>
                          right.points - left.points || left.position - right.position,
                      )
                      .map((player) => (
                        <div
                          className="team-player-row"
                          key={player.id}
                        >
                          <span>{player.position}</span>
                          <div>
                            <div>
                              <strong>{player.name}</strong>
                              <b>{player.points}</b>
                            </div>
                            <div className="player-score-track">
                              <div
                                style={{
                                  width: `${Math.max(
                                    3,
                                    (player.points / maximumPlayerScore) * 100,
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </section>
    </main>
  );
}

function TeamEditor({
  team,
  teamName,
  onChanged,
  onDeleted,
}: {
  team: Team;
  teamName: string;
  onChanged: (team: Team) => void;
  onDeleted: (teamId: number) => void;
}) {
  const [players, setPlayers] = useState<PlayerDraft[]>(() =>
    team.players.map((player) => ({
      id: player.id,
      name: player.name,
      points: String(player.points),
    })),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  function updatePlayer(index: number, field: "name" | "points", value: string) {
    setPlayers((current) =>
      current.map((player, playerIndex) =>
        playerIndex === index ? { ...player, [field]: value } : player,
      ),
    );
  }

  async function saveTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (players.some((player) => !player.name.trim())) {
      setError("Alle vier spelers hebben een naam nodig.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const updated = await apiRequest<Team>(`/api/teams/${team.id}`, {
        method: "PUT",
        body: JSON.stringify({
          players: players.map((player) => ({
            name: player.name.trim(),
            points: Number(player.points) || 0,
          })),
        }),
      });
      onChanged(updated);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Opslaan is mislukt.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function updatePoints(player: PlayerDraft, delta: number) {
    if (!player.id) {
      return;
    }
    const points = Math.max(0, (Number(player.points) || 0) + delta);
    setIsSaving(true);
    setError("");
    try {
      const updated = await apiRequest<Team>(
        `/api/teams/${team.id}/players/${player.id}/points`,
        {
          method: "PATCH",
          body: JSON.stringify({ points }),
        },
      );
      onChanged(updated);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Punten aanpassen is mislukt.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteTeam() {
    if (!window.confirm(`${teamName} verwijderen?`)) {
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      await apiRequest<void>(`/api/teams/${team.id}`, { method: "DELETE" });
      onDeleted(team.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Team verwijderen is mislukt.",
      );
      setIsSaving(false);
    }
  }

  return (
    <form className="team-editor-card" onSubmit={saveTeam}>
      <div className="team-editor-heading">
        <div>
          <p className="eyebrow">{teamName}</p>
          <h2>{teamTotal(team)} punten</h2>
        </div>
        <button
          className="team-delete-button"
          disabled={isSaving}
          onClick={() => void deleteTeam()}
          type="button"
        >
          Verwijder
        </button>
      </div>

      <div className="team-editor-players">
        {players.map((player, index) => (
          <div className="team-editor-player" key={player.id ?? index}>
            <span>{index + 1}</span>
            <input
              aria-label={`Naam speler ${index + 1}`}
              disabled={isSaving}
              maxLength={80}
              onChange={(event) => updatePlayer(index, "name", event.target.value)}
              placeholder={`Speler ${index + 1}`}
              value={player.name}
            />
            <input
              aria-label={`Punten speler ${index + 1}`}
              disabled={isSaving}
              min="0"
              onChange={(event) => updatePlayer(index, "points", event.target.value)}
              type="number"
              value={player.points}
            />
            <div className="point-stepper">
              <button
                disabled={isSaving}
                onClick={() => void updatePoints(player, -1)}
                type="button"
              >
                -1
              </button>
              <button
                disabled={isSaving}
                onClick={() => void updatePoints(player, 1)}
                type="button"
              >
                +1
              </button>
            </div>
          </div>
        ))}
      </div>

      {error ? <p className="team-editor-error">{error}</p> : null}
      <button className="team-save-button" disabled={isSaving} type="submit">
        {isSaving ? "Bezig..." : "Team opslaan"}
      </button>
    </form>
  );
}

export function TeamsAdmin() {
  const { teams, isLoading, error, setError, refresh } = useTeams();
  const [newPlayers, setNewPlayers] = useState<PlayerDraft[]>(emptyPlayers);
  const [isCreating, setIsCreating] = useState(false);

  function updateNewPlayer(
    index: number,
    field: "name" | "points",
    value: string,
  ) {
    setNewPlayers((current) =>
      current.map((player, playerIndex) =>
        playerIndex === index ? { ...player, [field]: value } : player,
      ),
    );
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPlayers.some((player) => !player.name.trim())) {
      setError("Vul voor alle vier spelers een naam in.");
      return;
    }

    setIsCreating(true);
    setError("");
    try {
      await apiRequest<Team>("/api/teams", {
        method: "POST",
        body: JSON.stringify({
          players: newPlayers.map((player) => ({
            name: player.name.trim(),
            points: Number(player.points) || 0,
          })),
        }),
      });
      setNewPlayers(emptyPlayers());
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Team aanmaken is mislukt.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  const orderedTeams = [...teams].sort((left, right) => left.id - right.id);

  return (
    <main className="teams-shell teams-admin-shell">
      <div className="stage-wash" />
      <TeamsHeader admin onRefresh={() => void refresh(true)} />

      <section className="teams-admin-layout">
        <div className="teams-admin-hero">
          <div>
            <p className="eyebrow">Host dashboard</p>
            <h1>Teams beheren</h1>
            <p>Maak teams van exact vier spelers en pas namen of punten aan.</p>
          </div>
          <span>{teams.length} teams</span>
        </div>

        {error ? <p className="teams-error">{error}</p> : null}

        <form className="team-create-card" onSubmit={createTeam}>
          <div>
            <p className="eyebrow">Nieuw team</p>
            <h2>Voeg vier spelers toe</h2>
          </div>
          <div className="team-create-grid">
            {newPlayers.map((player, index) => (
              <label key={index}>
                <span>Speler {index + 1}</span>
                <input
                  disabled={isCreating}
                  maxLength={80}
                  onChange={(event) =>
                    updateNewPlayer(index, "name", event.target.value)
                  }
                  placeholder="Naam"
                  value={player.name}
                />
                <input
                  disabled={isCreating}
                  min="0"
                  onChange={(event) =>
                    updateNewPlayer(index, "points", event.target.value)
                  }
                  type="number"
                  value={player.points}
                />
              </label>
            ))}
          </div>
          <button className="team-create-button" disabled={isCreating} type="submit">
            {isCreating ? "Team maken..." : "Team aanmaken"}
          </button>
        </form>

        {isLoading && teams.length === 0 ? (
          <div className="teams-loading">Teams laden...</div>
        ) : (
          <section className="team-editor-grid">
            {orderedTeams.map((team) => (
              <TeamEditor
                key={`${team.id}:${team.players
                  .map(
                    (player) =>
                      `${player.id}:${player.name}:${player.points}:${player.position}`,
                  )
                  .join("|")}`}
                onChanged={() => {
                  setError("");
                  void refresh();
                }}
                onDeleted={() => {
                  setError("");
                  void refresh();
                }}
                team={team}
                teamName={teamLabel(team, teams)}
              />
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
