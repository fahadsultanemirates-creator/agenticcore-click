import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

/**
 * A password box you can read back.
 *
 * Every password field on the site was type="password" with no way out of
 * it, which is fine until somebody is typing a password they have just
 * invented, on a phone, with autocorrect off — and gets "Invalid login
 * credentials" with no way to tell a typo from a wrong password.
 *
 * The toggle is a button, not a checkbox, and carries aria-pressed so a
 * screen reader says which state it is in. It is type="button" because a
 * bare <button> inside a <form> submits it, which would send a half-typed
 * password the first time anyone tapped the eye.
 */
export function PasswordInput({
  value,
  onChange,
  autoComplete,
  placeholder,
  className = "",
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const [shown, setShown] = useState(false);
  const fallbackId = useId();
  const inputId = id ?? fallbackId;

  return (
    <span className="relative flex">
      <input
        id={inputId}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        // Room on the right for the button, so a long password does not
        // run underneath it.
        className={`w-full pr-11 ${className}`}
      />
      <button
        type="button"
        onClick={() => setShown(!shown)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        aria-controls={inputId}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-fg-muted transition-colors hover:text-fg focus-visible:text-fg focus-visible:outline-none"
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </span>
  );
}
