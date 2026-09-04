-- Profiles structure extending auth.users

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    phone VARCHAR(50),
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    designation VARCHAR(255),
    joining_date DATE,
    employment_status public.employment_status_type DEFAULT 'Employee',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add the missing foreign key to departments now that profiles exists
ALTER TABLE public.departments 
ADD CONSTRAINT fk_department_manager 
FOREIGN KEY (manager_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Index for RLS and fast queries
CREATE INDEX idx_profiles_department_id ON public.profiles(department_id);

CREATE INDEX idx_profiles_email ON public.profiles(email);