/** Catalogue typé des événements de domaine (SPEC §3.5). */

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
  | E<'user.registered', 'user', Record<string, never>>
  | E<'variety.proposed', 'variety', Record<string, never>>
  | E<'variety.approved' | 'variety.rejected' | 'variety.merged', 'variety', { proposedBy: string | null }>
  | E<'culture.created', 'culture', { speciesId: string; method: string; rotationOverride: boolean }>
  | E<'culture.updated', 'culture', { fields: string[] }>
  | E<'culture.deleted' | 'culture.restored', 'culture', Record<string, never>>
  | E<'culture.ended', 'culture', { status: string }>
  | E<'culture.moved', 'culture', { fromZoneId: string; toZoneId: string }>
  | E<'culture.stage_recorded', 'culture', { stage: string; actualOn: string | null; plannedOn: string | null }>
  | E<'journal.entry_created', 'journal_entry', { kind: string; hasPhoto: boolean; structured: boolean; cultureId: string | null }>
  | E<'journal.entry_deleted', 'journal_entry', Record<string, never>>
  | E<'harvest.recorded', 'harvest', { cultureId: string; quantityKg: number | null; unit: string; seedSaving: boolean }>
  | E<'harvest.deleted', 'harvest', { cultureId: string }>
  | E<'season.closed' | 'season.reopened', 'season', { year: number }>
  | E<'ticket.created', 'ticket', { source: string }>
  | E<'ticket.completed', 'ticket', { firstTime: boolean; assignedToGroup: boolean; createdBy: string }>
  | E<'ticket.reopened' | 'ticket.deleted', 'ticket', Record<string, never>>
  | E<'ticket.assigned', 'ticket', { memberIds: string[]; groupIds: string[] }>
  | E<'comment.created', 'ticket', { mentions: string[] }>
  | E<'guide.published', 'guide', { number: number; visibility: string; words: number; firstPublication: boolean }>
  | E<'guide.forked', 'guide', { fromVersionId: string; fromAuthorId: string; visibility: string }>
  | E<'guide.applied', 'guide', { versionId: string; cultureId: string; authorId: string; tickets: number }>
  | E<'tip.created', 'tip', { tags: string[] }>
  | E<'tip.voted', 'tip', { value: number; previous: number; voterId: string; authorId: string }>
  | E<'content.reported', 'guide' | 'tip' | 'user', { reason: string; openReports: number; autoHidden: boolean }>
  | E<'result.submitted' | 'result.updated', 'result', { cultureId: string; completeness: number }>
  | E<'privacy.export_requested' | 'privacy.deletion_requested' | 'privacy.deletion_cancelled' | 'privacy.purged', 'user', Record<string, unknown>>
  | E<'moderation.decided', 'guide' | 'tip' | 'user', { decision: 'dismissed' | 'actioned'; reports: number }>;

export type DomainEventType = DomainEvent['type'];
