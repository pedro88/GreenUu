'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogActions } from '@/components/ui/Dialog';
import { ChipGroup, Field, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { archiveGroupAction, createGroupAction, updateGroupAction } from '../actions';

export function GroupDialog({ gardenId, members, group }: {
  gardenId: string; members: { id: string; pseudo: string }[]; group?: { id: string; name: string; memberIds: string[] };
}) {
  const t = useTranslations('groups');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group?.name ?? '');
  const [memberIds, setMemberIds] = useState<string[]>(group?.memberIds ?? []);
  const done = { onSuccess: () => setOpen(false) };
  const create = useAction(createGroupAction, done);
  const update = useAction(updateGroupAction, done);
  const archive = useAction(archiveGroupAction, done);
  const action = group ? update : create;
  return (
    <Dialog open={open} onOpenChange={setOpen} title={group ? t('editTitle') : t('newTitle')}
      trigger={<Button variant={group ? 'secondary' : 'primary'} data-testid={group ? `group-edit-${group.id}` : 'group-new'}>{group ? t('edit') : t('new')}</Button>}>
      <form onSubmit={(e) => {
        e.preventDefault();
        if (group) void update.run({ gardenId, groupId: group.id, name, memberIds, color: 'green' });
        else void create.run({ gardenId, name, memberIds, color: 'green' });
      }}>
        <Stack>
          <FormError error={action.error && !Object.keys(action.fieldErrors).length ? action.error : null} />
          <Field label={t('name')} errors={action.fieldErrors.name}>{(p) => <TextInput {...p} name="name" required value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <ChipGroup legend={t('members')} name="memberIds" value={memberIds} onChange={setMemberIds} errors={action.fieldErrors.memberIds}
            options={members.map((m) => ({ value: m.id, label: m.pseudo }))} />
          <DialogActions>
            {group ? <Button variant="danger" disabled={archive.pending} onClick={() => void archive.run({ gardenId, groupId: group.id })}>{t('archive')}</Button> : null}
            <Button type="submit" disabled={action.pending}>{t('save')}</Button>
          </DialogActions>
        </Stack>
      </form>
    </Dialog>
  );
}
