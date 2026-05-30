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
        "correct_index": 1,
    },
    {
        "id": "geboorteplaats",
        "kind": "quiz",
        "prompt": "Waar ben ik geboren?",
        "choices": ["Amsterdam", "Tilburg", "Eindhoven", "Rotterdam"],
        "correct_index": 2,
    },
    {
        "id": "eerste-telefoon",
        "kind": "quiz",
        "prompt": "Wat was mijn eerste telefoon?",
        "choices": ["iPhone 4", "Nokia 3310", "Sony Ericsson Walkman", "Samsung Galaxy Core"],
        "correct_index": 3,
    },
    {
        "id": "vroeger-worden",
        "kind": "quiz",
        "prompt": "Wat wilde ik vroeger worden?",
        "choices": ["Piloot", "Dierenarts", "Kapster", "Juf"],
        "correct_index": 1,
    },
    {
        "id": "obsessie-artiest",
        "kind": "quiz",
        "prompt": "Welke artiest was mijn grootste obsessie?",
        "choices": ["Justin Bieber", "Ariana Grande", "One Direction", "Taylor Swift"],
        "correct_index": 2,
    },
    {
        "id": "babyfoto",
        "kind": "slide",
        "prompt": "Babyfoto laten zien",
        "media": "baby-photo",
        "answer": "Babyfoto reveal",
    },
    {
        "id": "duizend-euro",
        "kind": "quiz",
        "prompt": "Wat zou ik absoluut doen voor EUR 1000?",
        "choices": ["Een marathon lopen", "Een slang vasthouden", "Een maand zonder telefoon", "Haar roze verven"],
        "correct_index": 3,
    },
    {
        "id": "hondenknuffel",
        "kind": "quiz",
        "prompt": "Wat was de naam die ik gaf aan mijn eerste hondenknuffel?",
        "choices": ["Bobby", "Rakker", "Max", "Pluis"],
        "correct_index": 1,
    },
    {
        "id": "sport",
        "kind": "quiz",
        "prompt": "Welke sport heb ik gedaan?",
        "choices": ["Hockey", "Turnen", "Paardrijden", "Tennis"],
        "correct_index": 2,
    },
    {
        "id": "telefoon-wc",
        "kind": "quiz",
        "prompt": "Waar heb ik ooit mijn telefoon laten vallen?",
        "choices": ["In de sloot", "Op school", "In de trein", "In de wc"],
        "correct_index": 3,
    },
    {
        "id": "thuiskomen",
        "kind": "quiz",
        "prompt": "Wat doe ik als eerste als ik thuis kom?",
        "choices": ["Eten maken", "Dutje doen", "Make-up afhalen", "TikTok openen"],
        "correct_index": 1,
    },
    {
        "id": "goud-zilver",
        "kind": "quiz",
        "prompt": "Draag ik meer goud of zilver?",
        "choices": ["Zilver", "Allebei evenveel", "Goud", "Geen sieraden"],
        "correct_index": 2,
    },
    {
        "id": "koffie-thee",
        "kind": "quiz",
        "prompt": "Koffie of thee?",
        "choices": ["Koffie", "Allebei", "Geen van beide", "Thee"],
        "correct_index": 3,
    },
    {
        "id": "lucky-number",
        "kind": "quiz",
        "prompt": "Wat is mijn lucky number?",
        "choices": ["7", "18", "11", "21"],
        "correct_index": 1,
    },
    {
        "id": "gebroken-botten",
        "kind": "quiz",
        "prompt": "Hoeveel botten heb ik gebroken?",
        "choices": ["1", "2", "0", "3"],
        "correct_index": 2,
    },
    {
        "id": "allergie",
        "kind": "quiz",
        "prompt": "Waar ben ik allergisch voor?",
        "choices": ["Pinda's", "Katten", "Gluten", "Niets"],
        "correct_index": 3,
    },
    {
        "id": "favoriete-persoon",
        "kind": "quiz",
        "prompt": "Mijn meest favoriete persoon op aarde?",
        "choices": ["Harry Styles", "Mao", "Mijn buurvrouw", "Mezelf"],
        "correct_index": 1,
    },
    {
        "id": "tattoo",
        "kind": "slide",
        "prompt": "Ik heb een tattoo laten zetten. Waar?",
        "answer": "Tattoo reveal",
    },
    {
        "id": "kerstconcert",
        "kind": "quiz",
        "prompt": "Op welk instrument speelde ik tijdens het kerstconcert op de middelbare?",
        "choices": ["Piano", "Gitaar", "Drum", "Trompet"],
        "correct_index": 2,
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


@dataclass
class Answer:
    option_index: int
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
        self.question_started_at = time.monotonic()
        self.question_deadline_at = time.time() + QUESTION_DURATION_SECONDS
        self.answers = {}
        for player in self.players.values():
            player.last_delta = 0
            player.last_correct = None

    def reveal(self) -> None:
        if self.current_index is not None:
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


def public_question(question: dict[str, Any], role: Role, phase: Phase) -> dict[str, Any]:
    payload = {
        "id": question["id"],
        "kind": question["kind"],
        "prompt": question["prompt"],
        "choices": question.get("choices", []),
        "media": question.get("media"),
        "answer": question.get("answer"),
    }
    if role == "admin" or phase in {"reveal", "final"}:
        payload["correct_index"] = question.get("correct_index")
        if question.get("correct_index") is not None:
            payload["answer"] = question["choices"][question["correct_index"]]
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
        if 0 <= answer.option_index < len(counts):
            counts[answer.option_index] += 1
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
    own_answer = state.answers.get(player_id or "")
    current = public_question(question, role, state.phase) if question else None

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
            "player_id": player_id,
            "answered": own_answer is not None,
            "answer_index": own_answer.option_index if own_answer else None,
            "correct": own_answer.correct if state.phase == "reveal" and own_answer else None,
            "points": own_answer.points if state.phase == "reveal" and own_answer else None,
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
    if state.phase == "question" and state.current_index is not None:
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


def score_answer(option_index: int) -> tuple[bool, int, float]:
    question = state.current_question
    if not question or question["kind"] != "quiz" or state.question_started_at is None:
        return False, 0, 0

    elapsed = max(0.0, time.monotonic() - state.question_started_at)
    correct = option_index == question["correct_index"]
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

    try:
        option_index = int(message.get("option_index"))
    except (TypeError, ValueError):
        return
    if option_index < 0 or option_index >= len(question["choices"]):
        return

    correct, points, elapsed = score_answer(option_index)
    player = state.players[connection.player_id]
    player.last_delta = points
    player.last_correct = correct
    player.streak = player.streak + 1 if correct else 0
    player.score += points
    state.answers[connection.player_id] = Answer(
        option_index=option_index,
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
    elif action == "next":
        next_index = 0 if state.current_index is None else state.current_index + 1
        state.start_question(next_index)
        schedule_timer_unlocked()
    elif action == "previous":
        previous_index = 0 if state.current_index is None else max(0, state.current_index - 1)
        state.start_question(previous_index)
        schedule_timer_unlocked()
    elif action == "reset":
        state.reset_scores()
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
