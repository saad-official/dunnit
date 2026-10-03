import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityEvent } from "@/lib/services/metrics";
import { actorLabel, describeEvent, relativeTime } from "./activity-format";

export function RecentActivity({ events, now }: { events: ActivityEvent[]; now: Date }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">Recent activity</CardTitle>
        <CardDescription>What the agent, the scheduler and you did last.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing yet. Activity appears here as Dunnit drafts, sends and reads replies.
          </p>
        ) : (
          <ol className="divide-y">
            {events.map((event) => {
              const at = new Date(event.created_at);
              return (
                <li key={event.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                  <p className="min-w-0 flex-1 text-sm">
                    {describeEvent(event)}
                    {event.model ? (
                      <span className="ml-2 font-mono text-xs text-muted-foreground" title="Model">
                        {event.model}
                      </span>
                    ) : null}
                  </p>
                  <p className="flex shrink-0 gap-2 text-xs text-muted-foreground">
                    <span>{actorLabel(event.actor)}</span>
                    <span aria-hidden>·</span>
                    <time dateTime={event.created_at} title={at.toUTCString()}>
                      {relativeTime(event.created_at, now)}
                    </time>
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
