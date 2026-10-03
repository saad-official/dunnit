/** Result shape every invoice/customer Server Action returns to the client. */
export type ActionResult = {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export const initialActionResult: ActionResult = { ok: false };

export type CsvImportActionResult = ActionResult & {
  created?: number;
  errors?: { line: number; message: string }[];
};
