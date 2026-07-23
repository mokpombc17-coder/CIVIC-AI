"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

const workspaceSchema = z.object({
  workspace: z.string().trim().min(1).max(40),
});

export async function selectWorkspaceAction(formData: FormData): Promise<never> {
  const parsed = workspaceSchema.safeParse({
    workspace: formData.get("workspace"),
  });

  if (!parsed.success) {
    redirect("/?actionError=workspace");
  }

  const cookieStore = await cookies();
  cookieStore.set("demo-workspace", parsed.data.workspace, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(`/?workspace=${encodeURIComponent(parsed.data.workspace)}`);
}
