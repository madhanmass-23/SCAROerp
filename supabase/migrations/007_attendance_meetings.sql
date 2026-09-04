-- Attendance and Meetings structure

CREATE TABLE public.attendance_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    clock_in_time TIMESTAMPTZ NOT NULL,
    clock_out_time TIMESTAMPTZ,
    status public.attendance_status_type DEFAULT 'Present',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent multiple active sessions for the same user
CREATE UNIQUE INDEX idx_active_session ON public.attendance_sessions(user_id) WHERE clock_out_time IS NULL;

CREATE TABLE public.meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    organizer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    meeting_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    meeting_type VARCHAR(100),
    external_meeting_url TEXT,
    status VARCHAR(50) DEFAULT 'Scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.meeting_participants (
    meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (meeting_id, participant_id)
);

CREATE TABLE public.meeting_attendance (
    meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    status public.meeting_attendance_status_type,
    delay_minutes INTEGER DEFAULT 0 CHECK (delay_minutes >= 0),
    PRIMARY KEY (meeting_id, participant_id)
);

-- Indexes
CREATE INDEX idx_attendance_sessions_user_id ON public.attendance_sessions(user_id);

CREATE INDEX idx_attendance_sessions_session_date ON public.attendance_sessions(session_date);

CREATE INDEX idx_meetings_meeting_date ON public.meetings(meeting_date);

CREATE INDEX idx_meetings_organizer_id ON public.meetings(organizer_id);

CREATE INDEX idx_meeting_participants_participant_id ON public.meeting_participants(participant_id);