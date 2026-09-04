-- ============================================================================
-- Migration 026: Direct Messaging Permissions & Directional Restrictions
--
-- Enforce role-based contact visibility and directional message security:
-- - Interns cannot initiate or reply to messages with Admin or Super Admin.
-- - Employees, Admins, and Super Admins can message anyone.
-- - Interns can message other Interns and Employees.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_message_user(sender_id UUID, recipient_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    sender_role TEXT;
    recipient_role TEXT;
BEGIN
    -- If recipient_id is NULL (e.g. task context message), allow
    IF recipient_id IS NULL THEN
        RETURN TRUE;
    END IF;

    -- Look up sender role
    SELECT r.name INTO sender_role
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = sender_id
    LIMIT 1;

    -- Look up recipient role
    SELECT r.name INTO recipient_role
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = recipient_id
    LIMIT 1;

    -- Rule: Interns cannot send messages to Admin or Super Admin
    IF sender_role = 'Intern' AND (recipient_role = 'Admin' OR recipient_role = 'Super Admin') THEN
        RETURN FALSE;
    END IF;

    -- All other combinations are permitted
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Before-insert trigger to enforce permissions and provide helpful error
CREATE OR REPLACE FUNCTION public.handle_message_insert_security()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        IF NOT public.can_message_user(auth.uid(), NEW.recipient_id) THEN
            RAISE EXCEPTION 'Unauthorized: Interns are not permitted to message Admins or Super Admins'
                USING ERRCODE = '42501';
        END IF;

        IF NEW.sender_id IS NULL THEN
            NEW.sender_id := auth.uid();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_message_insert_security ON public.messages;
CREATE TRIGGER enforce_message_insert_security
    BEFORE INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.handle_message_insert_security();

-- Update RLS Policy for messages INSERT
DROP POLICY IF EXISTS "Send messages" ON public.messages;
CREATE POLICY "Send messages" ON public.messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND
  public.can_message_user(auth.uid(), recipient_id) AND
  (task_id IS NULL OR EXISTS (
    SELECT 1 FROM public.tasks t 
    WHERE t.id = task_id AND (
      public.is_project_member(auth.uid(), t.project_id) OR 
      public.is_super_admin(auth.uid()) OR 
      public.has_permission(auth.uid(), 'tasks.view')
    )
  ))
);
