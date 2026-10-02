/** Gabarits d'e-mails typés (HTML + texte), en français (SPEC §3.1). */

export type Mail = { to: string; subject: string; html: string; text: string };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="background:#3c8848;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${esc(cta.label)}</a></p>
       <p style="font-size:13px;color:#6b5b5e">Si le bouton ne fonctionne pas, copie ce lien : <br><a href="${esc(cta.url)}">${esc(cta.url)}</a></p>`
    : '';
  return `<!doctype html><html lang="fr"><body style="font-family:system-ui,sans-serif;background:#fbf7ef;color:#2e222f;padding:24px">
<div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>${bodyHtml}${button}
<p style="font-size:12px;color:#6b5b5e;margin-top:32px">GreenU — tes jardins, saison après saison.</p></div></body></html>`;
}

export function verifyEmailMail(p: { to: string; name: string; url: string }): Mail {
  return {
    to: p.to,
    subject: 'Confirme ton adresse e-mail — GreenU',
    html: layout(`Bienvenue ${p.name} !`, '<p>Confirme ton adresse e-mail pour créer ton premier jardin.</p>', {
      label: 'Confirmer mon adresse',
      url: p.url,
    }),
    text: `Bienvenue ${p.name} !\n\nConfirme ton adresse e-mail : ${p.url}\n`,
  };
}

export function resetPasswordMail(p: { to: string; url: string }): Mail {
  return {
    to: p.to,
    subject: 'Réinitialise ton mot de passe — GreenU',
    html: layout(
      'Réinitialisation du mot de passe',
      "<p>Ce lien est valable une heure. Si tu n'as rien demandé, ignore cet e-mail.</p>",
      { label: 'Choisir un nouveau mot de passe', url: p.url },
    ),
    text: `Réinitialise ton mot de passe (lien valable une heure) : ${p.url}\n`,
  };
}

export function invitationMail(p: { to: string; gardenName: string; inviterName: string; roleLabel: string; url: string }): Mail {
  return {
    to: p.to,
    subject: `${p.inviterName} t'invite à rejoindre « ${p.gardenName} » sur GreenU`,
    html: layout(
      `Invitation au jardin « ${p.gardenName} »`,
      `<p>${esc(p.inviterName)} t'invite à rejoindre le jardin <strong>${esc(p.gardenName)}</strong> en tant que ${esc(p.roleLabel)}.</p><p>L'invitation est valable 7 jours.</p>`,
      { label: "Voir l'invitation", url: p.url },
    ),
    text: `${p.inviterName} t'invite à rejoindre le jardin « ${p.gardenName} » (${p.roleLabel}).\nInvitation valable 7 jours : ${p.url}\n`,
  };
}

export function gardenDeletedMail(p: { to: string; gardenName: string }): Mail {
  return {
    to: p.to,
    subject: `Le jardin « ${p.gardenName} » a été supprimé`,
    html: layout(
      'Jardin supprimé',
      `<p>Le jardin <strong>${esc(p.gardenName)}</strong> a été supprimé par son propriétaire. Ses données seront définitivement effacées dans 30 jours.</p>`,
    ),
    text: `Le jardin « ${p.gardenName} » a été supprimé par son propriétaire. Ses données seront effacées dans 30 jours.\n`,
  };
}

export function memberLeftMail(p: { to: string; gardenName: string; memberName: string; ticketCount: number; url: string }): Mail {
  const tickets = p.ticketCount > 0 ? `<p>${p.ticketCount} ticket(s) ne sont plus assignés.</p>` : '';
  return {
    to: p.to,
    subject: `${p.memberName} a quitté « ${p.gardenName} »`,
    html: layout(`${p.memberName} a quitté le jardin`, tickets, { label: 'Voir les membres', url: p.url }),
    text: `${p.memberName} a quitté « ${p.gardenName} ». ${p.ticketCount} ticket(s) ne sont plus assignés.\n${p.url}\n`,
  };
}

const SUBJECTS: Record<string, (p: { title: string; gardenName: string; actorName: string }) => string> = {
  assigned: (p) => `Nouvelle tâche pour toi : ${p.title}`,
  due_soon: (p) => `À faire demain : ${p.title}`,
  overdue: (p) => `En retard : ${p.title}`,
  mentioned: (p) => `${p.actorName} t'a mentionné·e : ${p.title}`,
  commented: (p) => `Nouveau commentaire : ${p.title}`,
  member_left_unassigned: (p) => `Tickets à réassigner dans « ${p.gardenName} »`,
  group_archived_unassigned: (p) => `Tickets à réassigner dans « ${p.gardenName} »`,
  digest: (p) => `Tes tâches du jour — ${p.gardenName}`,
};

/** E-mail de notification (RG-NTF-01) avec lien de désinscription du type (RG-NTF-04). */
export function notificationMail(p: { to: string; type: string; gardenName: string; title: string; actorName: string; excerpt: string; url: string; unsubscribeUrl: string }): Mail {
  const subject = (SUBJECTS[p.type] ?? ((x: { title: string }) => x.title))(p);
  const excerpt = p.excerpt ? `<blockquote style="border-left:3px solid #e3cca6;margin:12px 0;padding-left:12px">${esc(p.excerpt)}</blockquote>` : '';
  const footer = `<p style="font-size:12px;color:#6e5a50">Tu reçois cet e-mail pour le jardin « ${esc(p.gardenName)} ». <a href="${esc(p.unsubscribeUrl)}">Ne plus recevoir ce type d'e-mail</a>.</p>`;
  return {
    to: p.to,
    subject,
    html: layout(subject, `<p>${esc(p.title)}</p>${excerpt}${footer}`, { label: 'Voir', url: p.url }),
    text: `${subject}\n\n${p.excerpt ? `« ${p.excerpt} »\n\n` : ''}${p.url}\n\nNe plus recevoir ce type d'e-mail : ${p.unsubscribeUrl}\n`,
  };
}

export function dataExportMail(p: { to: string; url: string }): Mail {
  return {
    to: p.to,
    subject: 'Ton export de données est prêt — GreenU',
    html: layout('Ton export est prêt', '<p>Le lien est valable 7 jours et ne fonctionne que connecté·e à ton compte.</p>', { label: "Télécharger l'archive", url: p.url }),
    text: `Ton export de données est prêt (lien valable 7 jours, connecté·e à ton compte) : ${p.url}\n`,
  };
}

export function accountDeletionMail(p: { to: string; url: string; purgeOn: string }): Mail {
  return {
    to: p.to,
    subject: 'Ton compte sera supprimé — GreenU',
    html: layout('Suppression de ton compte', `<p>Ton compte est désactivé. Il sera supprimé définitivement le ${esc(p.purgeOn)}. Tu peux le rétablir d'ici là.</p>`, { label: 'Rétablir mon compte', url: p.url }),
    text: `Ton compte est désactivé et sera supprimé le ${p.purgeOn}. Pour le rétablir : ${p.url}\n`,
  };
}
