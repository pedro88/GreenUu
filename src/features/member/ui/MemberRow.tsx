'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogActions, DialogClose } from '@/components/ui/Dialog';
import { NativeSelect } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { useAction } from '@/components/ui/useAction';
import type { AvatarView } from '../../avatar/service';
import { AvatarThumb } from '../../avatar/ui/AvatarThumb';
import { changeRoleAction, removeMemberAction } from '../actions';
import styles from './Members.module.scss';

type Role = 'owner' | 'admin' | 'member' | 'observer';

export function MemberRow({ gardenId, member, avatar, assignable, manageable, isSelf }: {
  gardenId: string; member: { id: string; pseudo: string; role: Role }; avatar: AvatarView | undefined; assignable: ('admin' | 'member' | 'observer')[]; manageable: boolean; isSelf: boolean;
}) {
  const t = useTranslations('members');
  const tr = useTranslations('roles');
  const [confirm, setConfirm] = useState(false);
  const change = useAction(changeRoleAction);
  const remove = useAction(removeMemberAction, { onSuccess: () => setConfirm(false) });
  return (
    <li className={styles.item} data-testid={`member-${member.pseudo}`}>
      {avatar ? <AvatarThumb userId={avatar.userId} config={avatar.config} configHash={avatar.configHash} pseudo={member.pseudo} size={48} />
        : <span className={styles.avatar} aria-hidden>{member.pseudo.slice(0, 1)}</span>}
      <span><span className={styles.who}>{member.pseudo}</span> · <span data-testid="member-role">{tr(member.role)}</span>{isSelf ? ` (${t('you')})` : ''}</span>
      {manageable && !isSelf ? (
        <span className={styles.actions}>
          <label className="visually-hidden" htmlFor={`role-${member.id}`}>{t('changeRole')}</label>
          <NativeSelect id={`role-${member.id}`} value={member.role} disabled={change.pending}
            onChange={(e) => { const role = assignable.find((r) => r === e.target.value); if (role) void change.run({ gardenId, memberId: member.id, role }); }}>
            {assignable.map((r) => <option key={r} value={r}>{tr(r)}</option>)}
          </NativeSelect>
          <Dialog open={confirm} onOpenChange={setConfirm} title={t('removeTitle', { name: member.pseudo })} description={t('removeDescription')}
            trigger={<Button variant="secondary">{t('remove')}</Button>}>
            <FormError error={remove.error} />
            <DialogActions>
              <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
              <Button variant="danger" onClick={() => void remove.run({ gardenId, memberId: member.id })} disabled={remove.pending}>{t('removeConfirm')}</Button>
            </DialogActions>
          </Dialog>
        </span>
      ) : null}
      <FormError error={change.error} />
    </li>
  );
}
