import { hostname } from "node:os";
import { connection } from "next/server";
import { AdminApp } from "../components/LiveQuiz";

function serverName() {
  return process.env.SERVER_NAME || process.env.NODE_NAME || hostname();
}

export default async function AdminPanelPage() {
  await connection();
  return <AdminApp serverName={serverName()} />;
}
