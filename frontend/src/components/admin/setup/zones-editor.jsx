'use client';

import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useLiveFeeds } from '@/hooks/use-live-feeds';
import { StatusBadge } from '@/components/admin/status-badge';
import { createZone, deleteZone, updateZone, watchStaff, watchZones } from '@/lib/admin-data';

const NO_FEED = '__none__';

const EMPTY = { name: '', capacity: '', minGuards: '1', feedId: NO_FEED };

export default function ZonesEditor({ event }) {
  const { toast } = useToast();
  const { feeds, online } = useLiveFeeds(15000);
  const [zones, setZones] = useState([]);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => watchZones(event.id, setZones), [event.id]);
  useEffect(() => watchStaff(event.id, setStaff), [event.id]);

  const usedFeeds = new Set(
    zones
      .filter((z) => z.id !== editingId)
      .map((z) => z.feedId)
      .filter(Boolean),
  );

  function pickFeed(feedId) {
    const feed = feeds.find((f) => f.id === feedId);
    setForm((f) => ({
      ...f,
      feedId,
      // Prefill from the camera when the admin has not typed their own values yet.
      name: f.name || feed?.name || '',
      capacity: f.capacity || (feed ? String(feed.max_capacity) : ''),
    }));
  }

  function startEdit(zone) {
    setEditingId(zone.id);
    setForm({
      name: zone.name,
      capacity: String(zone.capacity),
      minGuards: String(zone.minGuards),
      feedId: zone.feedId ?? NO_FEED,
    });
  }

  function reset() {
    setEditingId(null);
    setForm(EMPTY);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const capacity = Number(form.capacity);
    const minGuards = Number(form.minGuards);
    if (!form.name.trim() || !(capacity > 0) || !(minGuards >= 0)) {
      toast({
        title: 'Check the zone',
        description: 'Name and a capacity above 0 are required.',
        variant: 'destructive',
      });
      return;
    }
    const input = {
      eventId: event.id,
      name: form.name.trim(),
      capacity,
      minGuards,
      feedId: form.feedId === NO_FEED ? null : form.feedId,
    };
    try {
      if (editingId) {
        await updateZone(editingId, input);
        toast({ title: 'Zone saved' });
      } else {
        await createZone(input);
        toast({ title: 'Zone added', description: input.name });
      }
      reset();
    } catch (err) {
      toast({ title: 'Could not save zone', description: err.message, variant: 'destructive' });
    }
  }

  async function onDelete(zone) {
    if (!window.confirm(`Delete zone "${zone.name}"? Staff in it become unassigned.`)) return;
    try {
      await deleteZone(zone);
      if (editingId === zone.id) reset();
    } catch (err) {
      toast({ title: 'Could not delete zone', description: err.message, variant: 'destructive' });
    }
  }

  const feedName = (id) => (id ? (feeds.find((f) => f.id === id)?.name ?? id) : null);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? 'Edit zone' : 'Add zone'}</CardTitle>
          <CardDescription>
            A zone is an area you watch with one camera, such as Main Entrance or Stage Front.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="zone-feed">Camera</Label>
              <Select value={form.feedId} onValueChange={pickFeed}>
                <SelectTrigger id="zone-feed">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FEED}>No camera</SelectItem>
                  {feeds.map((f) => (
                    <SelectItem key={f.id} value={f.id} disabled={usedFeeds.has(f.id)}>
                      {f.name} ({f.id}){usedFeeds.has(f.id) ? ' · in use' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {online === false && (
                <p className="text-xs text-muted-foreground">
                  Camera backend is offline, so the camera list is empty. You can add the zone now and link a
                  camera later.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="zone-name">Zone name</Label>
              <Input
                id="zone-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="zone-cap">Capacity (people)</Label>
                <Input
                  id="zone-cap"
                  type="number"
                  min={1}
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zone-min">Minimum guards</Label>
                <Input
                  id="zone-min"
                  type="number"
                  min={0}
                  value={form.minGuards}
                  onChange={(e) => setForm({ ...form, minGuards: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit">
                <Plus className="mr-2 h-4 w-4" />
                {editingId ? 'Save zone' : 'Add zone'}
              </Button>
              {editingId && (
                <Button type="button" variant="ghost" onClick={reset}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zones ({zones.length})</CardTitle>
          <CardDescription>Zones without a camera have no live density and show No data.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {zones.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No zones yet. Pick a camera on the left to add the first one.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zone</TableHead>
                  <TableHead>Camera</TableHead>
                  <TableHead className="text-right">Capacity</TableHead>
                  <TableHead className="text-right">Min guards</TableHead>
                  <TableHead className="text-right">Staff</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.map((z) => (
                  <TableRow key={z.id}>
                    <TableCell className="font-medium">{z.name}</TableCell>
                    <TableCell>
                      {z.feedId ? feedName(z.feedId) : <StatusBadge tone="warning">No camera</StatusBadge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{z.capacity}</TableCell>
                    <TableCell className="text-right tabular-nums">{z.minGuards}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {staff.filter((s) => s.zoneId === z.id).length}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${z.name}`}
                          onClick={() => startEdit(z)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${z.name}`}
                          onClick={() => onDelete(z)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
