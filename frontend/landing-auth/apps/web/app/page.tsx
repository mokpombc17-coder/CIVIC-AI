import type { Route } from "next";
import { redirect } from "next/navigation";

export default function IndexPage() {
  redirect("/home" as Route);
}
