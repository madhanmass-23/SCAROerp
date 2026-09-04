-- Fix infinite recursion in meetings RLS policy using SECURITY DEFINER function
-- (following the exact pattern of is_project_member in migration 014)

CREATE OR REPLACE FUNCTION public.is_meeting_participant(user_id UUID, target_meeting_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.meeting_participants mp
    WHERE mp.meeting_id = target_meeting_id AND mp.participant_id = $1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "View meetings" ON public.meetings;
CREATE POLICY "View meetings" ON public.meetings FOR SELECT USING (
  organizer_id = auth.uid() OR 
  public.is_meeting_participant(auth.uid(), id) OR
  public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'meetings.view')
);

DROP POLICY IF EXISTS "View meeting participants" ON public.meeting_participants;
CREATE POLICY "View meeting participants" ON public.meeting_participants FOR SELECT USING (
  participant_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (m.organizer_id = auth.uid() OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'meetings.view')))
);
