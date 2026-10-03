import { Panel } from "./mock-frame";

const rows = [
  { number: "1042", customer: "Harbor Lane Studio", amount: "$2,350.00" },
  { number: "1047", customer: "Kettle & Co.", amount: "$780.00" },
  { number: "1051", customer: "Northwind Joinery", amount: "$4,120.00" },
];

const sources = [
  { label: "CSV", active: true },
  { label: "Manual", active: false },
  { label: "Stripe", active: false, note: "Pro" },
];

export function ImportMock() {
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <ul aria-label="Import sources" className="flex rounded-lg bg-muted p-0.5 text-xs">
          {sources.map((s) => (
            <li
              key={s.label}
              aria-current={s.active ? "true" : undefined}
              className={
                s.active
                  ? "rounded-md bg-card px-2.5 py-1 font-medium shadow-card"
                  : "px-2.5 py-1 text-muted-foreground"
              }
            >
              {s.label}
              {s.note ? <span className="ml-1 text-[0.625rem]">{s.note}</span> : null}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          invoices-sept.csv · <span className="tabular">14</span> rows
        </p>
      </div>
      <table className="w-full text-xs">
        <caption className="sr-only">First three imported invoices</caption>
        <thead className="text-left text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 pt-2.5 pb-1.5 font-medium">
              No.
            </th>
            <th scope="col" className="px-2 pt-2.5 pb-1.5 font-medium">
              Customer
            </th>
            <th scope="col" className="px-4 pt-2.5 pb-1.5 text-right font-medium">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.number} className="border-t border-border">
              <td className="tabular px-4 py-2 text-muted-foreground">#{r.number}</td>
              <td className="px-2 py-2 font-medium">{r.customer}</td>
              <td className="money px-4 py-2 text-right">{r.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span className="tabular font-medium text-moss">14 imported</span> · <span className="tabular">0</span>{" "}
        skipped
      </p>
    </Panel>
  );
}
