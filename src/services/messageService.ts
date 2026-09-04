import { supabase } from '../lib/supabase';

export interface ContactProfile {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  designation?: string;
  department?: string;
  role?: string;
  can_message?: boolean;
  last_message?: {
    id: string;
    content: string;
    created_at: string;
    is_read: boolean;
    sender_id: string;
  };
  unread_count?: number;
}

export interface MessageItem {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  recipient_id: string;
  is_read: boolean;
  sender?: { full_name: string; avatar_url?: string };
}

/**
 * Evaluates directional messaging permissions based on sender and recipient roles.
 * 
 * Rules:
 * - Intern -> Admin/Super Admin: DENIED (false)
 * - Intern -> Employee/Intern: ALLOWED (true)
 * - Employee -> Everyone: ALLOWED (true)
 * - Admin -> Everyone (including Interns): ALLOWED (true)
 * - Super Admin -> Everyone (including Interns): ALLOWED (true)
 */
export function canMessageUser(senderRole?: string | null, recipientRole?: string | null): boolean {
  if (!senderRole || !recipientRole) return true;

  if (senderRole === 'Intern') {
    if (recipientRole === 'Admin' || recipientRole === 'Super Admin') {
      return false;
    }
    return true;
  }

  // Employee, Admin, Super Admin can message anyone
  return true;
}

/**
 * Fetches authorized contacts according to the current user's role:
 * - Intern: sees Employees, Interns, and any Admin/Super Admin who already initiated a conversation.
 * - Employee: sees Everyone (Employees, Interns, Admins, Super Admins).
 * - Admin: sees Everyone.
 * - Super Admin: sees Everyone.
 */
export async function fetchAuthorizedContacts(
  currentUserId: string,
  currentUserRole?: string | null
): Promise<ContactProfile[]> {
  // 1. Fetch active company profiles (excluding current user)
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url, designation, is_active, department:departments!profiles_department_id_fkey(name)')
    .eq('is_active', true)
    .neq('id', currentUserId);

  if (pErr) throw pErr;

  // 2. Fetch roles for all users
  const { data: userRolesData, error: rErr } = await supabase
    .from('user_roles')
    .select('user_id, roles ( name )');

  if (rErr) console.warn('Could not load user roles for contacts:', rErr);

  const rolesMap = new Map<string, string>();
  userRolesData?.forEach((ur: any) => {
    const roleName = Array.isArray(ur.roles) ? ur.roles[0]?.name : ur.roles?.name;
    if (roleName) rolesMap.set(ur.user_id, roleName);
  });

  // 3. Fetch recent direct messages for the current user to build snippets, unread state, and active conversations
  const { data: msgsData, error: mErr } = await supabase
    .from('messages')
    .select('id, sender_id, recipient_id, content, created_at, is_read')
    .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
    .order('created_at', { ascending: false })
    .limit(300);

  if (mErr) console.warn('Could not load message summaries:', mErr);

  const lastMsgMap = new Map<string, { id: string; content: string; created_at: string; is_read: boolean; sender_id: string }>();
  const unreadCountMap = new Map<string, number>();

  (msgsData || []).forEach((m: any) => {
    const partnerId = m.sender_id === currentUserId ? m.recipient_id : m.sender_id;
    if (!partnerId) return;

    if (!lastMsgMap.has(partnerId)) {
      lastMsgMap.set(partnerId, {
        id: m.id,
        content: m.content,
        created_at: m.created_at,
        is_read: m.is_read,
        sender_id: m.sender_id,
      });
    }

    if (m.recipient_id === currentUserId && !m.is_read) {
      unreadCountMap.set(partnerId, (unreadCountMap.get(partnerId) || 0) + 1);
    }
  });

  // 4. Filter according to role visibility rules
  const role = currentUserRole || 'Employee';
  const filteredProfiles = (profiles || []).filter((p: any) => {
    const contactRole = rolesMap.get(p.id) || 'Employee';

    // If current user is Intern:
    if (role === 'Intern') {
      // Allow Employees and Interns by default
      if (contactRole === 'Employee' || contactRole === 'Intern') {
        return true;
      }
      // If Admin or Super Admin, only allow if they have already initiated a conversation
      if (lastMsgMap.has(p.id)) {
        return true;
      }
      // Otherwise hide Admin/Super Admin from Intern's directory & search
      return false;
    }

    // Employee, Admin, Super Admin see everyone
    return true;
  });

  // 5. Map to ContactProfile
  const contactList: ContactProfile[] = filteredProfiles.map((p: any) => {
    const contactRole = rolesMap.get(p.id) || 'Member';
    const canMessage = canMessageUser(role, contactRole);

    return {
      id: p.id,
      full_name: p.full_name || p.email.split('@')[0],
      email: p.email,
      avatar_url: p.avatar_url || undefined,
      designation: p.designation || undefined,
      department: (p.department as any)?.name || undefined,
      role: contactRole,
      can_message: canMessage,
      last_message: lastMsgMap.get(p.id),
      unread_count: unreadCountMap.get(p.id) || 0,
    };
  });

  // 6. Sort: active conversations first (newest message first), then alphabetical by name
  contactList.sort((a, b) => {
    if (a.last_message && b.last_message) {
      return new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime();
    }
    if (a.last_message) return -1;
    if (b.last_message) return 1;
    return a.full_name.localeCompare(b.full_name);
  });

  return contactList;
}

/**
 * Sends a direct 1-to-1 message with client and server permission checks.
 */
export async function sendDirectMessage(
  senderId: string,
  recipientId: string,
  content: string,
  senderRole?: string | null,
  recipientRole?: string | null
): Promise<MessageItem> {
  if (!canMessageUser(senderRole, recipientRole)) {
    throw new Error('Unauthorized: Interns are not permitted to message Admins or Super Admins');
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      content: content.trim(),
      sender_id: senderId,
      recipient_id: recipientId,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to send direct message:', error);
    throw error;
  }

  return data as MessageItem;
}
