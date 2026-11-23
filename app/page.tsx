import { connection } from "next/server";
import Register from "./register";

export default async function Home() {
  await connection();
  return <Register browserRecording={Boolean(process.env.AQUA_API_KEY?.trim())} />;
}
