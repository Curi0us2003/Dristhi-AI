'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, FileUp, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { ATTENDEE_URL } from '@/lib/app-urls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  createStaff,
  createStaffMany,
  deleteStaff,
  resetStaffCode,
  STAFF_KIND_LABEL,
  STAFF_KINDS,
  STAFF_STATUS_LABEL,
  STAFF_STATUSES,
  updateStaff,
  watchStaff,
  watchZones,
} from '@/lib/admin-data';

const NO_ZONE = '__none__';
const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;

/** CSV rows: name, phone, kind, zone name. Header row optional. */
function parseCsv(text, eventId, zones) {
  const zoneByName = new Map(zones.map((z) => [z.name.trim().toLowerCase(), z.id]));
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const rows = [];
  lines.forEach((raw, i) => {
    if (!raw) return;
    const cells = raw.split(',').map((c) => c.trim());
    if (i === 0 && cells[0]?.toLowerCase() === 'name') return; // header
    const [name, phone = '', kindRaw = 'guard', zoneName = ''] = cells;
    const kind = kindRaw.toLowerCase();
    const line = i + 1;
    if (!name) return rows.push({ line, error: 'name is empty' });
    if (phone && !PHONE_RE.test(phone))
      return rows.push({ line, error: `phone "${phone}" is not a phone number` });
    if (!STAFF_KINDS.includes(kind))
      return rows.push({ line, error: `kind "${kindRaw}" must be one of ${STAFF_KINDS.join(', ')}` });
    let zoneId = null;
    if (zoneName) {
      zoneId = zoneByName.get(zoneName.toLowerCase()) ?? null;
      if (!zoneId) return rows.push({ line, error: `zone "${zoneName}" does not exist` });
    }
    rows.push({ line, input: { eventId, name, phone, kind, status: 'available', zoneId } });
  });
  return rows;
}

export default function StaffRoster({ event }) {
  const { toast } = useToast();
  const [staff, setStaff] = useState([]);
  const [zones, setZones] = useState([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [kind, setKind] = useState('guard');
  const [zoneId, setZoneId] = useState(NO_ZONE);
  const [csv, setCsv] = useState('');
  const [csvErrors, setCsvErrors] = useState([]);
  const [filter, setFilter] = useState('');

  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => watchStaff(event.id, setStaff), [event.id]);
  useEffect(() => watchZones(event.id, setZones), [event.id]);

  const zoneName = (id) => zones.find((z) => z.id === id)?.name;

  const counts = useMemo(() => {
    const c = {};
    staff.forEach((s) => (c[s.kind] = (c[s.kind] ?? 0) + 1));
    return c;
  }, [staff]);

  const shown = staff.filter((s) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return [s.name, s.phone, STAFF_KIND_LABEL[s.kind], zoneName(s.zoneId) ?? ''].some((v) =>
      v.toLowerCase().includes(q),
    );
  });

  async function onAdd(e) {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    if (phone && !PHONE_RE.test(phone)) {
      toast({ title: 'Phone number looks wrong', variant: 'destructive' });
      return;
    }
    try {
      await createStaff({
        eventId: event.id,
        name: name.trim(),
        phone: phone.trim(),
        kind,
        status: 'available',
        zoneId: zoneId === NO_ZONE ? null : zoneId,
      });
      setName('');
      setPhone('');
    } catch (err) {
      toast({ title: 'Could not add staff', description: err.message, variant: 'destructive' });
    }
  }

  async function onImport() {
    const rows = parseCsv(csv, event.id, zones);
    const errors = rows.filter((r) => r.error).map((r) => `Line ${r.line}: ${r.error}`);
    setCsvErrors(errors);
    if (errors.length) return; // nothing is imported when any row is wrong
    const inputs = rows.map((r) => r.input);
    if (inputs.length === 0) {
      setCsvErrors(['No rows to import.']);
      return;
    }
    try {
      await createStaffMany(inputs);
      setCsv('');
      toast({ title: `Imported ${inputs.length} staff` });
    } catch (err) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    }
  }

  async function onFile(file) {
    if (!file) return;
    setCsv(await file.text());
  }

  async function patch(s, change) {
    try {
      await updateStaff(s.id, change);
    } catch (err) {
      toast({ title: 'Could not update', description: err.message, variant: 'destructive' });
    }
  }

  async function onResetCode(s) {
    if (!window.confirm(`Give ${s.name} a new staff app code? Their old code stops working and they are signed out.`)) return;
    await resetStaffCode(s.id, event.id).catch((err) =>
      toast({ title: 'Could not reset the code', description: err.message, variant: 'destructive' }),
    );
  }

  const staffAppUrl = `${ATTENDEE_URL || origin}/staff?e=${encodeURIComponent(event.slug)}`;

  async function copyStaffLink() {
    try {
      await navigator.clipboard.writeText(staffAppUrl);
      toast({ title: 'Staff app link copied' });
    } catch {
      toast({ title: 'Could not copy', description: staffAppUrl, variant: 'destructive' });
    }
  }

  async function onDelete(s) {
    if (!window.confirm(`Remove ${s.name} from the roster?`)) return;
    await deleteStaff(s.id).catch((err) =>
      toast({ title: 'Could not remove', description: err.message, variant: 'destructive' }),
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add staff</CardTitle>
            <CardDescription className="text-[13px] leading-relaxed">Guards, medics, doctors, ambulances and volunteers on duty.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onAdd} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="st-name">Name</Label>
                <Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="st-phone">Phone</Label>
                <Input
                  id="st-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98450 12345"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="st-kind">Role</Label>
                  <Select value={kind} onValueChange={(v) => setKind(v)}>
                    <SelectTrigger id="st-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAFF_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {STAFF_KIND_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="st-zone">Zone</Label>
                  <Select value={zoneId} onValueChange={setZoneId}>
                    <SelectTrigger id="st-zone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ZONE}>Unassigned</SelectItem>
                      {zones.map((z) => (
                        <SelectItem key={z.id} value={z.id}>
                          {z.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit">
                <Plus className="mr-2 h-4 w-4" />
                Add to roster
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import CSV</CardTitle>
            <CardDescription className="text-[13px] leading-relaxed">
              One person per line: <code>name, phone, role, zone</code>. Role is one of{' '}
              {STAFF_KINDS.join(', ')}. Zone must match a zone name, or be empty.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              aria-label="Staff CSV"
              rows={5}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={
                'name,phone,role,zone\nRavi Kumar,+919845012345,guard,Main Entrance\nDr. Anita Rao,+919845067890,doctor,'
              }
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={onImport} disabled={!csv.trim()}>
                <FileUp className="mr-2 h-4 w-4" />
                Import
              </Button>
              <Button type="button" variant="outline" asChild>
                <label className="cursor-pointer">
                  Choose file
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(e) => onFile(e.target.files?.[0])}
                  />
                </label>
              </Button>
            </div>
            {csvErrors.length > 0 && (
              <div
                role="alert"
                className="rounded-md border border-destructive/50 p-3 text-sm text-destructive"
              >
                <p className="font-medium">Nothing was imported. Fix these lines:</p>
                <ul className="mt-1 list-disc pl-5">
                  {csvErrors.slice(0, 10).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Roster ({staff.length})</CardTitle>
            <CardDescription className="text-[13px] leading-relaxed">
              {STAFF_KINDS.filter((k) => counts[k])
                .map((k) => `${counts[k]} ${STAFF_KIND_LABEL[k].toLowerCase()}`)
                .join(' · ') || 'No staff yet.'}
            </CardDescription>
            <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
              Staff app: staff open
              <a href={staffAppUrl} target="_blank" rel="noreferrer" className="font-medium text-foreground underline">
                {staffAppUrl.replace(/^https?:\/\//, '')}
              </a>
              and sign in with their name and app code.
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Copy staff app link" onClick={copyStaffLink}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </p>
          </div>
          <Input
            aria-label="Search staff"
            placeholder="Search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="md:w-56"
          />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No staff to show.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>App code</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.name}</div>
                      {s.phone && <div className="text-xs text-muted-foreground">{s.phone}</div>}
                    </TableCell>
                    <TableCell>{STAFF_KIND_LABEL[s.kind]}</TableCell>
                    <TableCell>
                      <Select
                        value={s.zoneId ?? NO_ZONE}
                        onValueChange={(v) => patch(s, { zoneId: v === NO_ZONE ? null : v })}
                      >
                        <SelectTrigger className="h-8 w-40" aria-label={`Zone for ${s.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_ZONE}>Unassigned</SelectItem>
                          {zones.map((z) => (
                            <SelectItem key={z.id} value={z.id}>
                              {z.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={s.status} onValueChange={(v) => patch(s, { status: v })}>
                        <SelectTrigger className="h-8 w-32" aria-label={`Status for ${s.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAFF_STATUSES.map((st) => (
                            <SelectItem key={st} value={st}>
                              {STAFF_STATUS_LABEL[st]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-sm tracking-wider">{s.loginCode ?? '—'}</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={`New app code for ${s.name}`}
                          title="New code"
                          onClick={() => onResetCode(s)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${s.name}`}
                        onClick={() => onDelete(s)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
