
-- Set admin profile as approved and update name
UPDATE public.profiles
SET approved = true,
    full_name = 'Johnny Admin',
    updated_at = now()
WHERE id = '0c7fc011-e0ff-4876-990f-6ac1504f30fe';

-- Grant admin role
INSERT INTO public.user_roles (user_id, role)
VALUES ('0c7fc011-e0ff-4876-990f-6ac1504f30fe', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
