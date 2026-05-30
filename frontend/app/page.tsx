import { connection } from "next/server";
import { PlayerApp } from "./components/LiveQuiz";

export default async function Home() {
  await connection();
  return <PlayerApp frontendPod={process.env.POD_NAME || process.env.HOSTNAME || "local"} />;
}
