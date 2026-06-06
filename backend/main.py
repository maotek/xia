from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware


Phase = Literal["lobby", "question", "reveal", "final"]
Role = Literal["player", "admin"]
QUESTION_DURATION_SECONDS = 30.0


QUESTIONS: list[dict[str, Any]] = [
    {
        "id": "sterrenbeeld",
        "kind": "quiz",
        "prompt": "Wat is mijn sterrenbeeld?",
        "choices": ["Leo", "Cancer", "Gemini", "Scorpio"],
        "correct_indices": [1],
    },
    {
        "id": "geboorteplaats",
        "kind": "quiz",
        "prompt": "Waar ben ik geboren?",
        "choices": ["Amsterdam", "Tilburg", "Eindhoven", "Rotterdam"],
        "correct_indices": [2],
    },
    {
        "id": "eerste-telefoon",
        "kind": "quiz",
        "prompt": "Wat was mijn eerste telefoon?",
        "choices": ["iPhone 4", "Nokia 3310", "Sony Ericsson Walkman", "Samsung Galaxy Core"],
        "correct_indices": [3],
    },
    {
        "id": "vroeger-worden",
        "kind": "quiz",
        "prompt": "Wat wilde ik vroeger worden?",
        "choices": ["Piloot", "Dierenarts", "Kapster", "Juf"],
        "correct_indices": [1],
    },
    {
        "id": "obsessie-artiest",
        "kind": "quiz",
        "prompt": "Welke artiest was mijn grootste obsessie?",
        "choices": ["Justin Bieber", "Ariana Grande", "One Direction", "Taylor Swift"],
        "correct_indices": [2],
    },
    {
        "id": "lengte",
        "kind": "quiz",
        "prompt": "Hoe lang ben ik?",
        "choices": ["Korter dan 155 cm", "155 - 160 cm", "160 - 165 cm", "Langer dan 165 cm"],
        "correct_indices": [3],
    },
    {
        "id": "hondenknuffel",
        "kind": "quiz",
        "prompt": "Wat was de naam die ik gaf aan mijn eerste hondenknuffel?",
        "choices": ["Bobby", "Rakker", "Max", "Pluis"],
        "correct_indices": [1],
    },
    {
        "id": "sport",
        "kind": "quiz",
        "prompt": "Welke sport heb ik gedaan?",
        "choices": ["Hockey", "Turnen", "Paardrijden", "Tennis"],
        "correct_indices": [2],
    },
    {
        "id": "telefoon-wc",
        "kind": "quiz",
        "prompt": "Ik heb ooit mijn telefoon laten vallen. Waar?",
        "choices": ["In de sloot", "Op school", "In de trein", "In de wc"],
        "correct_indices": [3],
    },
    {
        "id": "thuiskomen",
        "kind": "quiz",
        "prompt": "Wat doe ik als eerste als ik thuis kom?",
        "choices": ["Eten maken", "Dutje doen", "Make-up afhalen", "TikTok openen"],
        "correct_indices": [1],
    },
    {
        "id": "duizend-euro",
        "kind": "quiz",
        "prompt": "Wat zou ik absoluut doen voor EUR 1000?",
        "choices": ["Een marathon lopen", "Een slang vasthouden", "Een maand zonder telefoon", "Mijn haar roze verven"],
        "correct_indices": [3],
    },
    {
        "id": "goud-zilver",
        "kind": "quiz",
        "prompt": "Draag ik meer goud of zilver?",
        "choices": ["Zilver", "Allebei evenveel", "Goud", "Geen sieraden"],
        "correct_indices": [2],
    },
    {
        "id": "koffie-thee",
        "kind": "quiz",
        "prompt": "Koffie of thee?",
        "choices": ["Koffie", "Allebei", "Geen van beide", "Thee"],
        "correct_indices": [3],
    },
    {
        "id": "lucky-number",
        "kind": "quiz",
        "prompt": "Wat is mijn lucky number?",
        "choices": ["7", "18", "11", "21"],
        "correct_indices": [1],
    },
    {
        "id": "gebroken-botten",
        "kind": "quiz",
        "prompt": "Hoeveel botten heb ik gebroken?",
        "choices": ["1", "2", "0", "3"],
        "correct_indices": [2],
    },
    {
        "id": "allergie",
        "kind": "quiz",
        "prompt": "Waar ben ik allergisch voor?",
        "choices": ["Pinda's", "Katten", "Gluten", "Niets"],
        "correct_indices": [3],
    },
    {
        "id": "middelbare-instrument",
        "kind": "quiz",
        "prompt": "Welk instrument speelde ik tijdens mijn favoriete moment op de middelbare school?",
        "choices": ["Piano", "Gitaar", "Drum", "Trompet"],
        "correct_indices": [2],
    },
    {
        "id": "kaas",
        "kind": "quiz",
        "prompt": "Wat moet er altijd bij het eten?",
        "choices": ["Pindasaus", "Kaas", "Ketchup", "Sambal"],
        "correct_indices": [1],
    },
    {
        "id": "niet-lusten",
        "kind": "quiz",
        "prompt": "Wat lust ik niet?",
        "choices": ["Tofu", "Champignons", "Tomaten", "Olijven"],
        "correct_indices": [0, 1, 2],
    },
    {
        "id": "slechtste-vak",
        "kind": "quiz",
        "prompt": "In welk vak was ik het slechtst op de middelbare school?",
        "choices": ["Wiskunde", "Nederlands", "Economie", "Geschiedenis"],
        "correct_indices": [2],
    },
    {
        "id": "angst",
        "kind": "quiz",
        "prompt": "Waar ben ik het meest bang voor?",
        "choices": ["Spinnen", "Het donker", "Hoogtes", "Clowns"],
        "correct_indices": [1],
    },
    {
        "id": "love-language",
        "kind": "quiz",
        "prompt": "Wat is mijn love language?",
        "choices": ["Quality time", "Words of affirmation", "Acts of service", "Receiving gifts"],
        "correct_indices": [2],
    },
    {
        "id": "reizen",
        "kind": "quiz",
        "prompt": "Waar zou ik nog echt een keer naartoe willen reizen?",
        "choices": ["Japan", "Korea", "Amerika", "Thailand", "Spanje", "Australie"],
        "correct_indices": [0, 1, 2, 3],
    },
    {
        "id": "favoriete-persoon",
        "kind": "quiz",
        "prompt": "Wie is mijn favoriete persoon op aarde?",
        "choices": ["Harry Styles", "Mao", "Mijn buurvrouw", "Mezelf"],
        "correct_indices": [1],
    },
]


@dataclass
class Player:
    id: str
    name: str
    score: int = 0
    streak: int = 0
    connected: bool = True
    last_delta: int = 0
    last_correct: bool | None = None
    last_result_question_id: str | None = None
    last_answered: bool = False


@dataclass
class Answer:
    option_indices: tuple[int, ...]
    correct: bool
    points: int
    elapsed: float


@dataclass(eq=False)
class Connection:
    websocket: WebSocket
    role: Role
    player_id: str | None = None


@dataclass
class GameState:
    phase: Phase = "lobby"
    current_index: int | None = None
    question_started_at: float | None = None
    question_deadline_at: float | None = None
    players: dict[str, Player] = field(default_factory=dict)
    answers: dict[str, Answer] = field(default_factory=dict)

    def reset_scores(self) -> None:
        self.phase = "lobby"
        self.current_index = None
        self.question_started_at = None
        self.question_deadline_at = None
        self.answers = {}
        for player in self.players.values():
            player.score = 0
            player.streak = 0
            player.last_delta = 0
            player.last_correct = None
            player.last_result_question_id = None
            player.last_answered = False

    def finalize_unanswered(self) -> None:
        question = self.current_question
        if not question or question["kind"] != "quiz":
            return

        for player in self.players.values():
            if player.id in self.answers:
                continue
            player.last_delta = 0
            player.last_correct = False
            player.last_result_question_id = question["id"]
            player.last_answered = False

    def start_question(self, index: int) -> None:
        if index >= len(QUESTIONS):
            self.phase = "final"
            self.current_index = None
            self.question_started_at = None
            self.question_deadline_at = None
            self.answers = {}
            return

        self.phase = "question"
        self.current_index = index
        question = QUESTIONS[index]
        self.question_started_at = time.monotonic() if question["kind"] == "quiz" else None
        self.question_deadline_at = (
            time.time() + QUESTION_DURATION_SECONDS if question["kind"] == "quiz" else None
        )
        self.answers = {}

    def reveal(self) -> None:
        if self.current_index is not None:
            self.finalize_unanswered()
            self.phase = "reveal"
            self.question_deadline_at = None

    @property
    def current_question(self) -> dict[str, Any] | None:
        if self.current_index is None:
            return None
        return QUESTIONS[self.current_index]


state = GameState()
connections: set[Connection] = set()
lock = asyncio.Lock()
timer_task: asyncio.Task[None] | None = None

app = FastAPI(title="Kahoot-ish Quiz API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def public_question(question: dict[str, Any], role: Role) -> dict[str, Any]:
    payload = {
        "id": question["id"],
        "kind": question["kind"],
        "prompt": question["prompt"],
        "choices": question.get("choices", []),
        "allows_multiple": len(question["correct_indices"]) > 1,
    }
    if role == "admin":
        payload["correct_indices"] = question["correct_indices"]
    return payload


def leaderboard() -> list[dict[str, Any]]:
    ranked = sorted(
        state.players.values(),
        key=lambda player: (-player.score, player.name.lower()),
    )
    return [
        {
            "rank": index + 1,
            "id": player.id,
            "name": player.name,
            "score": player.score,
            "streak": player.streak,
            "connected": player.connected,
            "last_delta": player.last_delta,
            "last_correct": player.last_correct,
        }
        for index, player in enumerate(ranked)
    ]


def connected_player_ids() -> list[str]:
    return [player.id for player in state.players.values() if player.connected]


def all_connected_players_answered() -> bool:
    question = state.current_question
    if not question or question["kind"] != "quiz":
        return False
    player_ids = connected_player_ids()
    if not player_ids:
        return False
    return all(player_id in state.answers for player_id in player_ids)


def answer_counts() -> list[int]:
    question = state.current_question
    if not question or question["kind"] != "quiz":
        return []
    counts = [0 for _ in question["choices"]]
    for answer in state.answers.values():
        for option_index in answer.option_indices:
            if 0 <= option_index < len(counts):
                counts[option_index] += 1
    return counts


def players_payload() -> list[dict[str, Any]]:
    return [
        {
            "id": player.id,
            "name": player.name,
            "score": player.score,
            "streak": player.streak,
            "connected": player.connected,
            "answered": player.id in state.answers,
            "last_delta": player.last_delta,
            "last_correct": player.last_correct,
        }
        for player in sorted(state.players.values(), key=lambda item: item.name.lower())
    ]


def snapshot(role: Role, player_id: str | None = None) -> dict[str, Any]:
    question = state.current_question
    active_player_id = player_id if player_id in state.players else None
    active_player = state.players.get(active_player_id or "")
    own_answer = state.answers.get(active_player_id or "")
    current = public_question(question, role) if question else None
    last_result = (
        {
            "question_id": active_player.last_result_question_id,
            "correct": active_player.last_correct,
            "points": active_player.last_delta,
            "answered": active_player.last_answered,
        }
        if active_player and active_player.last_result_question_id
        else None
    )

    return {
        "type": "state",
        "phase": state.phase,
        "current_index": state.current_index,
        "total_questions": len(QUESTIONS),
        "current_question": current,
        "players": players_payload(),
        "leaderboard": leaderboard(),
        "answer_counts": answer_counts(),
        "answered_count": len(state.answers),
        "player_count": len(connected_player_ids()),
        "question_duration": QUESTION_DURATION_SECONDS,
        "timer_ends_at": state.question_deadline_at,
        "timer_remaining": max(0.0, state.question_deadline_at - time.time())
        if state.question_deadline_at
        else 0,
        "you": {
            "player_id": active_player_id,
            "answered": own_answer is not None,
            "answer_indices": list(own_answer.option_indices) if own_answer else [],
            "correct": own_answer.correct if state.phase == "reveal" and own_answer else None,
            "points": own_answer.points if state.phase == "reveal" and own_answer else None,
            "last_result": last_result,
        },
    }


async def send_state(connection: Connection) -> None:
    await connection.websocket.send_json(snapshot(connection.role, connection.player_id))


async def broadcast() -> None:
    dead: list[Connection] = []
    for connection in list(connections):
        try:
            await send_state(connection)
        except Exception:
            dead.append(connection)
    for connection in dead:
        connections.discard(connection)


def cancel_timer_unlocked() -> None:
    global timer_task
    if timer_task and not timer_task.done():
        timer_task.cancel()
    timer_task = None


def schedule_timer_unlocked() -> None:
    global timer_task
    cancel_timer_unlocked()
    if (
        state.phase == "question"
        and state.current_index is not None
        and state.current_question
        and state.current_question["kind"] == "quiz"
    ):
        timer_task = asyncio.create_task(
            auto_reveal_after_timeout(state.current_index, state.question_started_at)
        )


async def auto_reveal_after_timeout(index: int, started_at: float | None) -> None:
    try:
        await asyncio.sleep(QUESTION_DURATION_SECONDS)
        async with lock:
            if (
                state.phase == "question"
                and state.current_index == index
                and state.question_started_at == started_at
            ):
                state.reveal()
                await broadcast()
    except asyncio.CancelledError:
        return


def score_answer(option_indices: tuple[int, ...]) -> tuple[bool, int, float]:
    question = state.current_question
    if not question or question["kind"] != "quiz" or state.question_started_at is None:
        return False, 0, 0

    elapsed = max(0.0, time.monotonic() - state.question_started_at)
    correct = set(option_indices) == set(question["correct_indices"])
    if not correct:
        return False, 0, elapsed

    speed_bonus = max(0.0, QUESTION_DURATION_SECONDS - elapsed) / QUESTION_DURATION_SECONDS
    points = int(600 + (400 * speed_bonus))
    return True, points, elapsed


async def handle_join(connection: Connection, message: dict[str, Any]) -> None:
    name = str(message.get("name", "")).strip()[:28]
    if not name:
        return

    requested_id = str(message.get("player_id", "")).strip()
    player_id = requested_id if requested_id in state.players else uuid.uuid4().hex
    player = state.players.get(player_id)

    if player is None:
        state.players[player_id] = Player(id=player_id, name=name)
    else:
        player.name = name
        player.connected = True

    connection.player_id = player_id


async def handle_answer(connection: Connection, message: dict[str, Any]) -> None:
    if connection.player_id is None:
        return
    if state.phase != "question" or connection.player_id in state.answers:
        return

    question = state.current_question
    if not question or question["kind"] != "quiz":
        return

    option_indices = message.get("option_indices")
    if not isinstance(option_indices, list) or not option_indices:
        return
    if not all(isinstance(index, int) and not isinstance(index, bool) for index in option_indices):
        return
    selected_indices = tuple(sorted(set(option_indices)))
    if len(selected_indices) != len(option_indices):
        return
    if any(index < 0 or index >= len(question["choices"]) for index in selected_indices):
        return
    if len(question["correct_indices"]) == 1 and len(selected_indices) != 1:
        return

    correct, points, elapsed = score_answer(selected_indices)
    player = state.players[connection.player_id]
    player.last_delta = points
    player.last_correct = correct
    player.last_result_question_id = question["id"]
    player.last_answered = True
    player.streak = player.streak + 1 if correct else 0
    player.score += points
    state.answers[connection.player_id] = Answer(
        option_indices=selected_indices,
        correct=correct,
        points=points,
        elapsed=elapsed,
    )
    if all_connected_players_answered():
        state.reveal()
        cancel_timer_unlocked()


async def handle_admin(message: dict[str, Any]) -> None:
    action = str(message.get("action", ""))
    if action == "start":
        state.start_question(0)
        schedule_timer_unlocked()
    elif action == "reveal":
        if state.phase == "question":
            state.reveal()
            cancel_timer_unlocked()
    elif action == "next":
        if state.phase == "question":
            state.finalize_unanswered()
            cancel_timer_unlocked()
        next_index = 0 if state.current_index is None else state.current_index + 1
        state.start_question(next_index)
        schedule_timer_unlocked()
    elif action == "previous":
        if state.phase == "question":
            state.finalize_unanswered()
            cancel_timer_unlocked()
        previous_index = 0 if state.current_index is None else max(0, state.current_index - 1)
        state.start_question(previous_index)
        schedule_timer_unlocked()
    elif action == "reset":
        state.reset_scores()
        cancel_timer_unlocked()
    elif action == "remove_player":
        player_id = str(message.get("player_id", "")).strip()
        if player_id in state.players:
            del state.players[player_id]
            state.answers.pop(player_id, None)
            for connection in list(connections):
                if connection.player_id == player_id:
                    connection.player_id = None
                    try:
                        await connection.websocket.send_json({"type": "removed"})
                    except Exception:
                        pass
            if state.phase == "question" and all_connected_players_answered():
                state.reveal()
                cancel_timer_unlocked()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, role: Role = Query("player")) -> None:
    await websocket.accept()
    connection = Connection(websocket=websocket, role=role)
    connections.add(connection)

    try:
        async with lock:
            await send_state(connection)

        while True:
            message = await websocket.receive_json()
            async with lock:
                message_type = str(message.get("type", ""))
                if message_type == "join":
                    await handle_join(connection, message)
                elif message_type == "answer":
                    await handle_answer(connection, message)
                elif message_type == "admin" and connection.role == "admin":
                    await handle_admin(message)
                await broadcast()
    except WebSocketDisconnect:
        pass
    finally:
        async with lock:
            connections.discard(connection)
            if connection.player_id and connection.player_id in state.players:
                state.players[connection.player_id].connected = False
            if state.phase == "question" and all_connected_players_answered():
                state.reveal()
                cancel_timer_unlocked()
            await broadcast()
