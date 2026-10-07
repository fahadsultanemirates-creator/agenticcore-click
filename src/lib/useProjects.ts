import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { getSku, resolveSku } from "../../supabase/functions/_shared/catalog.ts";

// A client's work, grouped the way they think about it.
//
// useOrders reads the same tasks flat, for the dashboard's history table.
// This reads them by project, because "the Noor Bakery logo, and the flyer
// that used it" is one thing with two parts, and a flat list cannot say so.

export type ProjectFile = {
  url: string;
  fileType: string;
  optionIndex: number;
};

export type ProjectOrder = {
  id: string;
  publicId: string;
  product: string;
  serviceId: string;
  summary: string;
  status: string;
  createdAt: string;
  /** A deployed website has a URL to visit rather than a file to keep. */
  previewUrl: string | null;
  files: ProjectFile[];
};

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  orders: ProjectOrder[];
  /** Every delivered file across the project, newest order first. */
  files: ProjectFile[];
};

type ProjectRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  tasks:
    | {
        id: string;
        public_id: string;
        type: string;
        sku: number | null;
        status: string;
        payload: Record<string, unknown> | null;
        created_at: string;
        version: number | null;
        preview_url: string | null;
        task_files: { url: string; file_type: string; option_index: number; version: number }[] | null;
      }[]
    | null;
};

function briefOf(payload: Record<string, unknown> | null): string {
  for (const key of ["description", "brief", "topic", "notes"]) {
    const value = payload?.[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "No brief given.";
}

function toProject(row: ProjectRow): Project {
  const orders: ProjectOrder[] = (row.tasks ?? [])
    .map((task) => {
      // Same resolution useOrders does: the stored sku when there is one,
      // otherwise matched from the payload, so an older task placed before
      // skus were recorded still shows a product name rather than "image".
      const product = (task.sku != null ? getSku(task.sku) : null) ?? resolveSku(task.type, task.payload ?? {});
      const version = task.version ?? 1;
      return {
        id: task.id,
        publicId: task.public_id,
        product: product?.name ?? task.type,
        serviceId: task.type,
        summary: briefOf(task.payload),
        status: task.status,
        createdAt: task.created_at,
        previewUrl: task.preview_url,
        files: (task.task_files ?? [])
          // Only this version's files: a revised order keeps the old ones,
          // and showing both hands back the thing they asked to change.
          .filter((file) => file.version === version)
          .sort((a, b) => a.option_index - b.option_index)
          .map((file) => ({ url: file.url, fileType: file.file_type, optionIndex: file.option_index })),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    orders,
    files: orders.flatMap((order) => order.files),
  };
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("projects")
      .select(
        "id, name, created_at, updated_at, tasks(id, public_id, type, sku, status, payload, created_at, version, preview_url, task_files(url, file_type, option_index, version))"
      )
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("useProjects failed:", error);
      setFailed(true);
      setLoading(false);
      return;
    }

    setProjects(((data ?? []) as ProjectRow[]).map(toProject));
    setFailed(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { projects, loading, failed, reload: load };
}

/** Starts an empty project and hands back its id, or null with a message. */
export async function createProject(name: string): Promise<{ id: string } | { error: string }> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return { error: "Your session expired — please log in again." };

  const { data, error } = await supabase
    .from("projects")
    .insert({ name: name.trim(), user_id: userId })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createProject failed:", error);
    return { error: "Could not create that project. Please try again." };
  }
  return { id: data.id as string };
}

/** Files a finished order under a different project. */
export async function moveTaskToProject(taskId: string, projectId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("move_task_to_project", {
    p_task_id: taskId,
    p_project_id: projectId,
  });
  if (error) console.error("moveTaskToProject failed:", error);
  return !error && data === true;
}

/**
 * Removes a project that holds nothing.
 *
 * The emptiness rule lives in the row-level policy, not here: this call
 * simply fails if the project still has orders in it. A button is not a
 * rule, and the one thing that must never happen is paid-for work
 * disappearing because the UI miscounted.
 */
export async function deleteProject(id: string): Promise<boolean> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) console.error("deleteProject failed:", error);
  return !error;
}

export async function renameProject(id: string, name: string): Promise<boolean> {
  const { error } = await supabase
    .from("projects")
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("renameProject failed:", error);
  return !error;
}
