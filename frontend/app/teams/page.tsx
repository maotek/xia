import type { Metadata } from "next";
import { TeamsDashboard } from "../components/TeamsInterface";

export const metadata: Metadata = {
  title: "Xiaxia Team Scores",
  description: "Bekijk live persoonlijke en teamscores.",
};

export default function TeamsPage() {
  return <TeamsDashboard />;
}
