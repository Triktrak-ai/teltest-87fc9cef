
UPDATE auth.users
SET email_confirmed_at = now(),
    updated_at = now()
WHERE id = '0c7fc011-e0ff-4876-990f-6ac1504f30fe';
