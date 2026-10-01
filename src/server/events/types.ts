/** Catalogue typé des événements de domaine émis au lot 1 (SPEC §3.5). */

type E<TType extends string, TSubject extends string, TPayload extends Record<string, unknown>> = {
  type: TType;
  subjectType: TSubject;
  subjectId: string;
  gardenId: string | null;
  actorId: string | null;
  payload: TPayload;
};

export type DomainEvent =
  | E<'garden.created', 'garden', { orgType: string }>
  | E<'garden.updated', 'garden', { fields: string[] }>
  | E<'garden.archived', 'garden', Record<string, never>>
  | E<'garden.unarchived', 'garden', Record<string, never>>
  | E<'garden.deleted', 'garden', Record<string, never>>
  | E<'garden.ownership_transferred', 'garden', { fromUserId: string; toUserId: string }>
  | E<'member.joined', 'member', { userId: string; role: string; via: 'creation' | 'invitation' }>
  | E<'member.left', 'member', { userId: string; removedBy: string | null; unassignedTicketIds: string[] }>
  | E<'member.role_changed', 'member', { userId: string; from: string; to: string }>
  | E<'invitation.sent', 'invitation', { role: string }>
  | E<'invitation.revoked', 'invitation', Record<string, never>>
  | E<'invitation.accepted', 'invitation', { userId: string }>
  | E<'group.created', 'group', Record<string, never>>
  | E<'group.archived', 'group', Record<string, never>>
  | E<'zone.created', 'zone', { zoneTypeCode: string; depth: number }>
  | E<'zone.updated', 'zone', { fields: string[] }>
  | E<'zone.moved', 'zone', { fromParentId: string | null; toParentId: string | null }>
  | E<'zone.archived', 'zone', { archivedIds: string[] }>
  | E<'zone.geometry_changed', 'zone', Record<string, never>>
  | E<'user.registered', 'user', Record<string, never>>;

export type DomainEventType = DomainEvent['type'];
