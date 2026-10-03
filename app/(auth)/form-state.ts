/** State returned by the auth Server Actions to `useActionState`. */
export type AuthFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Echoed non-secret inputs so the form keeps them after a failed submit. */
  values?: Record<string, string>;
  /** Sign-up succeeded but needs email confirmation before a session exists. */
  checkEmail?: boolean;
};

export const initialAuthState: AuthFormState = {};
