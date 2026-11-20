'use client';

import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEvent } from '@/contexts/event-context';
import EventForm from '@/components/admin/setup/event-form';
import ZonesEditor from '@/components/admin/setup/zones-editor';
import StaffRoster from '@/components/admin/setup/staff-roster';

export default function SetupPage() {
  const { event, loading, error } = useEvent();

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Event setup</h2>
        <p className="text-sm text-muted-foreground">
          Create the event, split the venue into zones with cameras, and register everyone on duty.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Could not load events: {error}
        </p>
      )}
      <Tabs defaultValue="event">
        <TabsList>
          <TabsTrigger value="event">1. Event</TabsTrigger>
          <TabsTrigger value="zones" disabled={!event}>
            2. Zones
          </TabsTrigger>
          <TabsTrigger value="staff" disabled={!event}>
            3. Staff
          </TabsTrigger>
        </TabsList>
        <TabsContent value="event">
          <EventForm />
        </TabsContent>
        {event && (
          <>
            <TabsContent value="zones">
              <ZonesEditor event={event} />
            </TabsContent>
            <TabsContent value="staff">
              <StaffRoster event={event} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
