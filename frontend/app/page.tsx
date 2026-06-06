import { hostname } from "node:os";
import { connection } from "next/server";
import { PlayerApp } from "./components/LiveQuiz";

function serverName() {
  return process.env.SERVER_NAME || process.env.NODE_NAME || hostname();
}

export default async function Home() {
  await connection();
  return <PlayerApp serverName={serverName()} />;
}
