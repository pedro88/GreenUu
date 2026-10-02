'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox, ChipGroup, Field, NativeSelect, TextArea, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Row, Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { ACTION_TAGS, TICKET_PRIORITIES, TICKET_TYPES, type TicketPriority, type TicketType } from '@/lib/enums';
import { createTicketAction } from '../actions';

type Repeat = 'none' | 'daily' | 'weekly' | 'monthly';
const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

/** Règle RRULE à partir des choix simples du formulaire (sous-ensemble RG-TCK-07). */
export function buildRrule(repeat: Repeat, every: number, days: string[], months: string[]): string {
  const parts = [`FREQ=${repeat === 'daily' ? 'DAILY' : repeat === 'weekly' ? 'WEEKLY' : 'MONTHLY'}`];
  if (every > 1) parts.push(`INTERVAL=${every}`);
  if (repeat === 'weekly' && days.length) parts.push(`BYDAY=${days.join(',')}`);
  if (months.length) parts.push(`BYMONTH=${months.join(',')}`);
  return parts.join(';');
}

export function TicketForm({ gardenId, zones, cultures, members, groups, today, initialZoneId, initialCultureId }: {
  gardenId: string; zones: { id: string; label: string }[]; cultures: { id: string; label: string }[]; members: { id: string; pseudo: string }[];
  groups: { id: string; name: string }[]; today: string; initialZoneId: string | null; initialCultureId: string | null;
}) {
  const t = useTranslations('tickets');
  const tt = useTranslations('ticketTypes');
  const tp = useTranslations('ticketPriorities');
  const ta = useTranslations('actionTags');
  const router = useRouter();
  const [target, setTarget] = useState(initialCultureId ? `c:${initialCultureId}` : initialZoneId ? `z:${initialZoneId}` : 'garden');
  const [type, setType] = useState<TicketType>('task');
  const [actionTag, setActionTag] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [dueOn, setDueOn] = useState(today);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [checklist, setChecklist] = useState('');
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [every, setEvery] = useState(1);
  const [days, setDays] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [until, setUntil] = useState('');
  const [skipMissed, setSkipMissed] = useState(true);
  const action = useAction(createTicketAction, { refresh: false, onSuccess: (d) => router.push(d.ticketId ? `/app/jardins/${gardenId}/tickets/${d.ticketId}` : `/app/jardins/${gardenId}/tickets`) });
  const fe = action.fieldErrors;
  const submit = () => void action.run({
    gardenId, type, actionTag, title, description, priority, memberIds, groupIds,
    zoneId: target.startsWith('z:') ? target.slice(2) : '', cultureId: target.startsWith('c:') ? target.slice(2) : '',
    checklist: checklist.split('\n').map((l) => l.trim()).filter(Boolean),
    ...(repeat === 'none' ? { dueOn } : { recurrence: { rrule: buildRrule(repeat, every, days, months), dtstart: dueOn, until, skipMissed } }),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} data-testid="ticket-form">
      <Stack>
        <FormError error={action.error && !Object.keys(fe).length ? action.error : null} />
        <Field label={t('titleLabel')} errors={fe.title}>{(p) => <TextInput {...p} name="title" required value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label={t('attachedTo')} errors={fe.zoneId}>{(p) => (
          <NativeSelect {...p} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="garden">{t('wholeGarden')}</option>
            <optgroup label={t('zones')}>{zones.map((z) => <option key={z.id} value={`z:${z.id}`}>{z.label}</option>)}</optgroup>
            <optgroup label={t('cultures')}>{cultures.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.label}</option>)}</optgroup>
          </NativeSelect>
        )}</Field>
        <Row>
          <Field label={t('type')}>{(p) => (
            <NativeSelect {...p} value={type} onChange={(e) => setType(TICKET_TYPES.find((x) => x === e.target.value) ?? type)}>
              {TICKET_TYPES.map((x) => <option key={x} value={x}>{tt(x)}</option>)}
            </NativeSelect>
          )}</Field>
          <Field label={t('action')}>{(p) => (
            <NativeSelect {...p} value={actionTag} onChange={(e) => setActionTag(e.target.value)}>
              <option value="">{t('noAction')}</option>
              {ACTION_TAGS.map((x) => <option key={x} value={x}>{ta(x)}</option>)}
            </NativeSelect>
          )}</Field>
          <Field label={t('priority')}>{(p) => (
            <NativeSelect {...p} value={priority} onChange={(e) => setPriority(TICKET_PRIORITIES.find((x) => x === e.target.value) ?? priority)}>
              {TICKET_PRIORITIES.map((x) => <option key={x} value={x}>{tp(x)}</option>)}
            </NativeSelect>
          )}</Field>
        </Row>
        <Field label={repeat === 'none' ? t('dueOn') : t('startsOn')} errors={fe.dueOn}>{(p) => <TextInput {...p} type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />}</Field>
        {members.length > 0 ? <ChipGroup legend={t('assignPeople')} name="memberIds" value={memberIds} onChange={setMemberIds} errors={fe.memberIds} options={members.map((m) => ({ value: m.id, label: m.pseudo }))} /> : null}
        {groups.length > 0 ? <ChipGroup legend={t('assignGroups')} name="groupIds" value={groupIds} onChange={setGroupIds} options={groups.map((g) => ({ value: g.id, label: g.name }))} /> : null}
        <Field label={t('description')}>{(p) => <TextArea {...p} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <Field label={t('checklist')} hint={t('checklistHint')}>{(p) => <TextArea {...p} value={checklist} onChange={(e) => setChecklist(e.target.value)} />}</Field>
        <Field label={t('repeat')} errors={fe['recurrence.rrule']}>{(p) => (
          <NativeSelect {...p} value={repeat} onChange={(e) => setRepeat(e.target.value === 'daily' ? 'daily' : e.target.value === 'weekly' ? 'weekly' : e.target.value === 'monthly' ? 'monthly' : 'none')} data-testid="repeat">
            <option value="none">{t('repeatNone')}</option>
            <option value="daily">{t('repeatDaily')}</option>
            <option value="weekly">{t('repeatWeekly')}</option>
            <option value="monthly">{t('repeatMonthly')}</option>
          </NativeSelect>
        )}</Field>
        {repeat !== 'none' ? (
          <Stack gap="sm">
            <Field label={t('every')}>{(p) => <TextInput {...p} type="number" min={1} max={30} value={every} onChange={(e) => setEvery(Math.max(1, Number(e.target.value) || 1))} />}</Field>
            {repeat === 'weekly' ? <ChipGroup legend={t('onDays')} name="days" value={days} onChange={setDays} options={WEEKDAYS.map((d) => ({ value: d, label: t(`day_${d}`) }))} /> : null}
            <ChipGroup legend={t('onlyMonths')} name="months" value={months} onChange={setMonths}
              options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(2026, i, 1).toLocaleDateString('fr', { month: 'short' }) }))} />
            <Field label={t('until')}>{(p) => <TextInput {...p} type="date" value={until} onChange={(e) => setUntil(e.target.value)} />}</Field>
            <Checkbox label={t('skipMissed')} checked={skipMissed} onChange={(e) => setSkipMissed(e.target.checked)} />
          </Stack>
        ) : null}
        <Button type="submit" size="large" block disabled={action.pending || title.trim().length < 3} data-testid="ticket-submit">{t('create')}</Button>
      </Stack>
    </form>
  );
}
