'use client';

import { useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useEvent } from '@/contexts/event-context';
import { createEvent, DEFAULT_EVENT, updateEvent } from '@/lib/admin-data';

function validate(form) {
  if (!form.name.trim()) return 'Event name is required.';
  if (!form.venue.trim()) return 'Venue is required.';
  if (form.startsAt && form.endsAt && form.endsAt <= form.startsAt) return 'End must be after start.';
  if (!(form.warningPct > 0 && form.warningPct < form.criticalPct && form.criticalPct <= 200))
    return 'Warning % must be above 0 and below Critical %.';
  if (!(form.peoplePerGuard >= 1)) return 'People per guard must be at least 1.';
  return null;
}

export default function EventForm() {
  const { event, selectEvent, loading } = useEvent();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(DEFAULT_EVENT);
  const [saving, setSaving] = useState(false);

  // Load the selected event into the form whenever it changes (unless creating a new one).
  useEffect(() => {
    if (loading) return;
    if (!event) {
      setCreating(true);
      return;
    }
    if (!creating) {
      const { id: _id, ...rest } = event;
      setForm(rest);
    }
  }, [event, creating, loading]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(e) {
    e.preventDefault();
    const error = validate(form);
    if (error) {
      toast({ title: 'Check the form', description: error, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const clean = { ...form, name: form.name.trim(), venue: form.venue.trim(), city: form.city.trim() };
      if (creating || !event) {
        const id = await createEvent(clean);
        selectEvent(id);
        setCreating(false);
        toast({ title: 'Event created', description: `${clean.name} is selected. Add zones next.` });
      } else {
        await updateEvent(event.id, clean);
        toast({ title: 'Event saved' });
      }
    } catch (err) {
      toast({ title: 'Could not save', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>{creating ? 'New event' : 'Event details'}</CardTitle>
          <CardDescription>
            {creating
              ? 'Create the event you have been hired to manage.'
              : 'Thresholds decide when a zone shows Warning or Critical, and how many guards it needs.'}
          </CardDescription>
        </div>
        {!creating && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCreating(true);
              setForm(DEFAULT_EVENT);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New event
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ev-name">Event name</Label>
            <Input
              id="ev-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Sunburn Arena 2026"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ev-venue">Venue</Label>
            <Input
              id="ev-venue"
              value={form.venue}
              onChange={(e) => set('venue', e.target.value)}
              placeholder="Phoenix Marketcity"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ev-city">City</Label>
            <Input
              id="ev-city"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              placeholder="Bengaluru"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ev-status">Status</Label>
            <Select value={form.status} onValueChange={(v) => set('status', v)}>
              <SelectTrigger id="ev-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="ended">Ended</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ev-start">Starts</Label>
            <Input
              id="ev-start"
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => set('startsAt', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ev-end">Ends</Label>
            <Input
              id="ev-end"
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => set('endsAt', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ev-warn">Warning at (% of zone capacity)</Label>
            <Input
              id="ev-warn"
              type="number"
              min={1}
              value={form.warningPct}
              onChange={(e) => set('warningPct', Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ev-crit">Critical at (% of zone capacity)</Label>
            <Input
              id="ev-crit"
              type="number"
              min={1}
              value={form.criticalPct}
              onChange={(e) => set('criticalPct', Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ev-ppg">People one guard can watch</Label>
            <Input
              id="ev-ppg"
              type="number"
              min={1}
              value={form.peoplePerGuard}
              onChange={(e) => set('peoplePerGuard', Number(e.target.value))}
            />
          </div>
          <div className="flex items-end gap-2 md:col-span-2">
            <Button type="submit" disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {creating ? 'Create event' : 'Save changes'}
            </Button>
            {creating && event && (
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
