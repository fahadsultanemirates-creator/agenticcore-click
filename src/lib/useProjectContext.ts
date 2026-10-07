import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "./supabase";
import type { UploadedFile } from "./useReferenceFiles";

// "Add to this project" arriving on a service page.
//
// The project is carried in the query string (?project=<id>) rather than
// in router state, so the link survives a refresh, a share and a back
// button. Nothing here is trusted: the id goes to the server with the
// order, and the server checks it belongs to the caller before filing
// anything under it. What it is trusted for is cosmetic -- the banner at
// the top of the form, and which files arrive pre-attached.

export type ProjectContext = {
  projectId: string | null;
  name: string | null;
  /** The project's finished files, ready to be used as reference. */
  files: UploadedFile[];
  loading: boolean;
};

type Row = {
  name: string;
  tasks: { public_id: string; task_files: { url: string; option_index: number }[] | null }[] | null;
};

export function useProjectContext(): ProjectContext {
  const [params] = useSearchParams();
  const projectId = params.get("project");
  const [name, setName] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(Boolean(projectId));

  useEffect(() => {
    if (!projectId) {
      setName(null);
      setFiles([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("name, tasks(public_id, task_files(url, option_index))")
        .eq("id", projectId)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        // A project that will not load is not a reason to block the order.
        // The form works; it simply does not pre-attach anything.
        if (error) console.error("useProjectContext failed:", error);
        setName(null);
        setFiles([]);
        setLoading(false);
        return;
      }

      const row = data as Row;
      setName(row.name);
      setFiles(
        (row.tasks ?? []).flatMap((task) =>
          (task.task_files ?? []).map((file) => ({
            name: `${task.public_id} — option ${file.option_index}`,
            url: file.url,
          })),
        ),
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { projectId, name, files, loading };
}
