'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogActions, DialogClose } from '@/components/ui/Dialog';
import { ChipGroup, Field, NativeSelect, TextArea, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Row, Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { TICKET_PRIORITIES, type Stage, type TicketPriority, type TicketStatus, type TicketType } from '@/lib/enums';
import { recordStageAction } from '../../culture/actions';
import { addChecklistAction, assignTicketAction, commentTicketAction, deleteTicketAction, toggleChecklistAction, transitionTicketAction, updateTicketAction } from '../actions';
import { canTransition } from '../rules.pure';

/** Actions de statut ; après « Terminer » un ticket d'étape propose de renseigner la date réelle (TCK-16). */
export function TicketStatusBar({ gardenId, ticketId, status, today, canAct }: { gardenId: string; ticketId: string; status: TicketStatus; today: string; canAct: boolean }) {
  const t = useTranslations('tickets');
  const ts = useTranslations('stages');
  const [prompt, setPrompt] = useState<{ cultureId: string; stage: Stage } | null>(null);
  const [recorded, setRecorded] = useState(false);
  const transition = useAction(transitionTicketAction, { onSuccess: (d) => setPrompt(d.stagePrompt) });
  const stage = useAction(recordStageAction, { onSuccess: () => { setRecorded(true); setPrompt(null); } });
  if (!canAct) return null;
  const go = (to: TicketStatus) => void transition.run({ gardenId, ticketId, status: to });
  const buttons: { to: TicketStatus; key: 'start' | 'block' | 'complete' | 'cancel' | 'reopen'; variant: 'primary' | 'secondary' }[] = [
    { to: 'in_progress', key: 'start', variant: 'secondary' }, { to: 'blocked', key: 'block', variant: 'secondary' },
    { to: 'done', key: 'complete', variant: 'primary' }, { to: 'cancelled', key: 'cancel', variant: 'secondary' }, { to: 'todo', key: 'reopen', variant: 'secondary' },
  ];
  return (
    <Stack gap="sm">
      <FormError error={transition.error} />
      {recorded ? <p role="status" data-testid="stage-recorded">{t('stageRecorded')}</p> : null}
      <Row>
        {buttons.filter((b) => canTransition(status, b.to)).map((b) => (
          <Button key={b.to} variant={b.variant} disabled={transition.pending} onClick={() => go(b.to)} data-testid={`status-${b.to}`}>{t(`action_${b.key}`)}</Button>
        ))}
      </Row>
      <Dialog open={prompt !== null} onOpenChange={(o) => { if (!o) setPrompt(null); }} title={t('stagePromptTitle')}
        description={prompt ? t('stagePromptText', { stage: ts(prompt.stage) }) : ''}>
        <FormError error={stage.error} />
        <DialogActions>
          <DialogClose asChild><Button variant="secondary">{t('later')}</Button></DialogClose>
          <Button onClick={() => prompt && void stage.run({ gardenId, cultureId: prompt.cultureId, stage: prompt.stage, actualOn: today })} disabled={stage.pending} data-testid="stage-prompt-confirm">{t('recordToday')}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export function ChecklistEditor({ gardenId, ticketId, items, canToggle, canAdd }: { gardenId: string; ticketId: string; items: { id: string; label: string; done: boolean }[]; canToggle: boolean; canAdd: boolean }) {
  const t = useTranslations('tickets');
  const [label, setLabel] = useState('');
  const toggle = useAction(toggleChecklistAction);
  const add = useAction(addChecklistAction, { onSuccess: () => setLabel('') });
  return (
    <Stack gap="sm">
      <ul style={{ listStyle: 'none', padding: 0 }} data-testid="checklist">
        {items.map((i) => (
          <li key={i.id}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 48 }}>
              <input type="checkbox" checked={i.done} disabled={!canToggle || toggle.pending} onChange={(e) => void toggle.run({ gardenId, itemId: i.id, done: e.target.checked })} style={{ width: 24, height: 24 }} />
              <span>{i.label}</span>
            </label>
          </li>
        ))}
      </ul>
      {canAdd ? (
        <form onSubmit={(e) => { e.preventDefault(); void add.run({ gardenId, ticketId, label }); }}>
          <Row>
            <label className="visually-hidden" htmlFor="new-check">{t('addCheck')}</label>
            <TextInput id="new-check" value={label} placeholder={t('addCheck')} onChange={(e) => setLabel(e.target.value)} />
            <Button variant="secondary" type="submit" disabled={!label.trim()}>{t('add')}</Button>
          </Row>
        </form>
      ) : null}
    </Stack>
  );
}

export function CommentForm({ gardenId, ticketId }: { gardenId: string; ticketId: string }) {
  const t = useTranslations('tickets');
  const [body, setBody] = useState('');
  const action = useAction(commentTicketAction, { onSuccess: () => setBody('') });
  return (
    <form onSubmit={(e) => { e.preventDefault(); void action.run({ gardenId, ticketId, body }); }}>
      <Stack gap="sm">
        <FormError error={action.error} />
        <Field label={t('comment')} hint={t('mentionHint')}>{(p) => <TextArea {...p} value={body} onChange={(e) => setBody(e.target.value)} data-testid="comment-body" />}</Field>
        <Row><Button type="submit" variant="honey" disabled={action.pending || !body.trim()} data-testid="comment-send">{t('send')}</Button></Row>
      </Stack>
    </form>
  );
}

export function AssignDialog({ gardenId, ticketId, members, groups, memberIds, groupIds }: {
  gardenId: string; ticketId: string; members: { id: string; pseudo: string }[]; groups: { id: string; name: string }[]; memberIds: string[]; groupIds: string[];
}) {
  const t = useTranslations('tickets');
  const [open, setOpen] = useState(false);
  const [m, setM] = useState(memberIds);
  const [g, setG] = useState(groupIds);
  const action = useAction(assignTicketAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={setOpen} title={t('assignTitle')} trigger={<Button variant="secondary" data-testid="assign-open">{t('assign')}</Button>}>
      <Stack>
        <FormError error={action.error} />
        <ChipGroup legend={t('assignPeople')} name="m" value={m} onChange={setM} options={members.map((x) => ({ value: x.id, label: x.pseudo }))} />
        <ChipGroup legend={t('assignGroups')} name="g" value={g} onChange={setG} options={groups.map((x) => ({ value: x.id, label: x.name }))} />
        <DialogActions><Button onClick={() => void action.run({ gardenId, ticketId, memberIds: m, groupIds: g })} disabled={action.pending}>{t('save')}</Button></DialogActions>
      </Stack>
    </Dialog>
  );
}

export function EditTicketDialog({ gardenId, ticketId, initial, recurring }: {
  gardenId: string; ticketId: string; recurring: boolean;
  initial: { title: string; description: string; priority: TicketPriority; dueOn: string; type: TicketType; actionTag: string };
}) {
  const t = useTranslations('tickets');
  const tp = useTranslations('ticketPriorities');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const [applyTo, setApplyTo] = useState<'this' | 'following'>('this');
  const update = useAction(updateTicketAction, { onSuccess: () => setOpen(false) });
  const del = useAction(deleteTicketAction, { refresh: false, onSuccess: () => router.push(`/app/jardins/${gardenId}/tickets`) });
  return (
    <Row>
      <Dialog open={open} onOpenChange={setOpen} title={t('editTitle')} trigger={<Button variant="secondary" data-testid="edit-open">{t('edit')}</Button>}>
        <form onSubmit={(e) => { e.preventDefault(); void update.run({ gardenId, ticketId, ...v, applyTo }); }}>
          <Stack>
            <FormError error={update.error && !Object.keys(update.fieldErrors).length ? update.error : null} />
            <Field label={t('titleLabel')} errors={update.fieldErrors.title}>{(p) => <TextInput {...p} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />}</Field>
            <Field label={t('priority')}>{(p) => (
              <NativeSelect {...p} value={v.priority} onChange={(e) => setV({ ...v, priority: TICKET_PRIORITIES.find((x) => x === e.target.value) ?? v.priority })}>
                {TICKET_PRIORITIES.map((x) => <option key={x} value={x}>{tp(x)}</option>)}
              </NativeSelect>
            )}</Field>
            {!recurring ? <Field label={t('dueOn')}>{(p) => <TextInput {...p} type="date" value={v.dueOn} onChange={(e) => setV({ ...v, dueOn: e.target.value })} />}</Field> : null}
            <Field label={t('description')}>{(p) => <TextArea {...p} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
            {recurring ? (
              <Field label={t('applyTo')}>{(p) => (
                <NativeSelect {...p} value={applyTo} onChange={(e) => setApplyTo(e.target.value === 'following' ? 'following' : 'this')} data-testid="apply-to">
                  <option value="this">{t('applyThis')}</option>
                  <option value="following">{t('applyFollowing')}</option>
                </NativeSelect>
              )}</Field>
            ) : null}
            <DialogActions><Button type="submit" disabled={update.pending}>{t('save')}</Button></DialogActions>
          </Stack>
        </form>
      </Dialog>
      <Button variant="ghost" onClick={() => void del.run({ gardenId, ticketId })} disabled={del.pending}>{t('delete')}</Button>
    </Row>
  );
}
