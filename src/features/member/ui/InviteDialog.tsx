'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ChipGroup, Field, NativeSelect, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { inviteAction } from '../actions';

export function InviteDialog({ gardenId, roles, groups }: { gardenId: string; roles: ('admin' | 'member' | 'observer')[]; groups: { id: string; name: string }[] }) {
  const t = useTranslations('members');
  const tr = useTranslations('roles');
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member' | 'observer'>('member');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const action = useAction(inviteAction, { onSuccess: () => { setSentTo(email); setEmail(''); setGroupIds([]); } });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSentTo(null); }} title={t('inviteTitle')}
      trigger={<Button size="large" block data-testid="invite-open">{t('invite')}</Button>}>
      <form onSubmit={(e) => { e.preventDefault(); void action.run({ gardenId, email, role, groupIds }); }}>
        <Stack>
          {sentTo ? <Alert tone="success">{t('inviteSent', { email: sentTo })}</Alert> : null}
          <FormError error={action.error && !Object.keys(action.fieldErrors).length ? action.error : null} />
          <Field label={t('email')} errors={action.fieldErrors.email}>{(p) => <TextInput {...p} type="email" name="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Field label={t('role')}>{(p) => (
            <NativeSelect {...p} name="role" value={role} onChange={(e) => setRole(roles.find((r) => r === e.target.value) ?? 'member')}>
              {roles.map((r) => <option key={r} value={r}>{tr(r)}</option>)}
            </NativeSelect>
          )}</Field>
          {groups.length > 0 ? <ChipGroup legend={t('groups')} name="groupIds" value={groupIds} onChange={setGroupIds} options={groups.map((g) => ({ value: g.id, label: g.name }))} /> : null}
          <Button type="submit" size="large" block disabled={action.pending}>{t('send')}</Button>
        </Stack>
      </form>
    </Dialog>
  );
}
