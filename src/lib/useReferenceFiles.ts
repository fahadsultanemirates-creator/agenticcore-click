import { useCallback, useState } from "react";
import { supabase } from "./supabase";
import { functionErrorMessage } from "./functionError";

// Reference uploads for the service pages.
//
// The dropzone on the image, video and document pages used to be decoration:
// a styled <label> around an <input type="file"> with no onChange handler.
// Picking a logo did nothing at all -- no upload, no error, no trace -- and
// the task went to the worker with no reference, so a client who attached
// their logo got back something that ignored it and had no way to tell why.
//
// This is the same storage path Forge's chat attachments already use, so a
// file attached on a service page and one dropped into Forge arrive at the
// worker identically, as payload.referenceFiles.

export type UploadedFile = {
  name: string;
  url: string;
};

async function uploadOne(file: File): Promise<string> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  const form = new FormData();
  form.set("file", file);

  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>("forge-upload", {
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (error || !data) throw new Error(await functionErrorMessage(error, "Could not upload that file."));
  if (data.error) throw new Error(data.error);
  if (!data.url) throw new Error("Unexpected response from the server.");
  return data.url;
}

export function useReferenceFiles() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const add = useCallback(async (selected: FileList | null) => {
    if (!selected || selected.length === 0) return;
    setError("");
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        Array.from(selected).map(async (file) => ({ name: file.name, url: await uploadOne(file) })),
      );
      setFiles((current) => [...current, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that file.");
    } finally {
      setUploading(false);
    }
  }, []);

  const remove = useCallback((url: string) => {
    setFiles((current) => current.filter((file) => file.url !== url));
  }, []);

  return {
    files,
    uploading,
    error,
    add,
    remove,
    /** What goes into the task payload, or undefined when nothing was attached. */
    urls: files.length > 0 ? files.map((file) => file.url) : undefined,
  };
}
