import { hostname } from "node:os";
import { connection } from "next/server";
import { AdminApp } from "../components/LiveQuiz";

export default async function AdminPanelPage() {
  await connection();
  return <AdminApp frontendPod={process.env.POD_NAME || hostname()} />;
}
