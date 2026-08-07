-- Grant StudioLayer administrator privileges to the designated internal account.
UPDATE users
SET is_admin = TRUE,
    updated_at = NOW()
WHERE LOWER(email) = LOWER('neerajtri19@gmail.com');
