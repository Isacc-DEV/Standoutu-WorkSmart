import { NextResponse, type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

type GraphEvent = {
  id: string;
  subject?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  isAllDay?: boolean;
  organizer?: { emailAddress?: { address?: string; name?: string } };
  location?: { displayName?: string };
};

type CalendarAccount = {
  email: string;
  name?: string | null;
  timezone?: string | null;
};

type GraphEventsResponse = { value?: GraphEvent[]; error?: { message?: string } };

function mapEvents(events: GraphEvent[], mailbox: string) {
  return events
    .map((ev) => ({
      id: `${mailbox}:${ev.id}`,
      title: ev.subject || 'Busy',
      start: ev.start?.dateTime || '',
      end: ev.end?.dateTime || '',
      isAllDay: Boolean(ev.isAllDay),
      organizer: ev.organizer?.emailAddress?.name || ev.organizer?.emailAddress?.address || undefined,
      location: ev.location?.displayName || undefined,
      mailbox,
    }))
    .filter((ev) => ev.start && ev.end);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const authHeader = request.headers.get('authorization');

  const url = new URL(request.url);
  const start = url.searchParams.get('start') || new Date().toISOString();
  const end = url.searchParams.get('end') || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const tzParam = url.searchParams.get('timezone');
  const tz = tzParam || session.user?.timeZone || 'UTC';
  const primaryEmail = session.user?.email?.toLowerCase();
  const mailboxParams = [
    ...url.searchParams.getAll('mailbox'),
    ...(url.searchParams.get('mailboxes') || '').split(','),
  ]
    .map((mailbox) => mailbox.trim().toLowerCase())
    .filter(Boolean);
  const mailboxSet = new Set<string>();
  if (primaryEmail) mailboxSet.add(primaryEmail);
  mailboxParams.forEach((mailbox) => {
    if (!primaryEmail || mailbox !== primaryEmail) {
      mailboxSet.add(mailbox);
    }
  });
  const mailboxes = Array.from(mailboxSet);

  const results = await Promise.all(
    (mailboxes.length ? mailboxes : [primaryEmail ?? 'me']).map(async (mailbox) => {
      const graphUrl = new URL(
        mailbox === primaryEmail || mailbox === 'me'
          ? 'https://graph.microsoft.com/v1.0/me/calendarView'
          : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/calendarView`,
      );
      graphUrl.searchParams.set('startDateTime', start);
      graphUrl.searchParams.set('endDateTime', end);
      graphUrl.searchParams.set('$select', 'subject,start,end,location,isAllDay,organizer');

      const res = await fetch(graphUrl, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Prefer: `outlook.timezone="${tz}"`,
        },
      });
      const data = (await res.json()) as GraphEventsResponse;
      if (!res.ok || !Array.isArray(data.value)) {
        const message = data?.error?.message || 'Failed to load calendar events from Microsoft Graph';
        return { mailbox, error: message };
      }
      return {
        mailbox,
        events: mapEvents(data.value, mailbox),
      };
    }),
  );

  const successful = results.filter((result) => 'events' in result) as Array<{
    mailbox: string;
    events: ReturnType<typeof mapEvents>;
  }>;
  if (!successful.length) {
    const firstError = results.find((result) => 'error' in result) as { error?: string } | undefined;
    return NextResponse.json(
      { message: firstError?.error || 'Failed to load calendar events from Microsoft Graph' },
      { status: 500 },
    );
  }

  const accounts: CalendarAccount[] = successful.map((result) => ({
    email:
      result.mailbox === 'me'
        ? session.user?.email?.toLowerCase() || 'me'
        : result.mailbox,
    name: result.mailbox === primaryEmail ? session.user?.name : undefined,
    timezone: tz,
  }));
  const events = successful.flatMap((result) => result.events);
  const failed = results.filter((result) => 'error' in result) as Array<{
    mailbox: string;
    error: string;
  }>;
  const warning = failed.length
    ? `Failed to load calendars for: ${failed.map((result) => result.mailbox).join(', ')}.`
    : undefined;

  let storedEvents = events;
  let storageWarning: string | undefined;
  const syncMailboxes = successful.map((result) => result.mailbox);

  if (!authHeader) {
    storageWarning = 'Missing auth token; events not stored.';
  } else {
    try {
      const syncRes = await fetch(`${API_BASE}/calendar/events/sync`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mailboxes: syncMailboxes,
          timezone: tz,
          events,
        }),
      });
      if (syncRes.ok) {
        const syncData = (await syncRes.json()) as { events?: typeof events };
        if (Array.isArray(syncData.events)) {
          storedEvents = syncData.events as typeof events;
        }
      } else {
        storageWarning = 'Failed to store events; showing live data.';
      }
    } catch (err) {
      console.error(err);
      storageWarning = 'Failed to store events; showing live data.';
    }
  }

  const combinedWarning = [warning, storageWarning].filter(Boolean).join(' ') || undefined;

  return NextResponse.json({
    accounts: accounts.sort((a, b) => (a.email === primaryEmail ? -1 : b.email === primaryEmail ? 1 : 0)),
    events: storedEvents,
    source: 'graph',
    warning: combinedWarning,
  });
}
