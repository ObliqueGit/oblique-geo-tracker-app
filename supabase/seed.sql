-- ============================================================
-- Seed: example client for testing
-- Run after migrations in Supabase SQL editor
-- ============================================================

-- Example client
INSERT INTO public.clients (
  name, website, industry, contact_name, contact_email,
  brand_aliases, target_keywords,
  monthly_report_enabled, report_day, report_recipient_emails
) VALUES (
  'Petico Malaysia',
  'https://petico.my',
  'Pet Care E-commerce',
  'Marketing Team',
  'marketing@petico.my',
  ARRAY['Petico', 'Petico.my'],
  ARRAY['pet food malaysia', 'online pet shop', 'dog food delivery', 'cat food malaysia'],
  true,
  1,
  ARRAY['marketing@petico.my']
) ON CONFLICT DO NOTHING;

-- Store the client ID for prompt inserts
DO $$
DECLARE
  client_id UUID;
  comp1_id  UUID;
  comp2_id  UUID;
BEGIN
  SELECT id INTO client_id FROM public.clients WHERE name = 'Petico Malaysia' LIMIT 1;

  -- Competitors
  INSERT INTO public.competitors (client_id, name, website, brand_aliases)
  VALUES
    (client_id, 'PetBacker', 'https://petbacker.com', ARRAY['PetBacker']),
    (client_id, 'Pawsome', 'https://pawsome.my', ARRAY['Pawsome Malaysia']);

  -- Prompts — spread across categories
  INSERT INTO public.prompts (client_id, text, category, platforms, sort_order) VALUES
    -- Brand
    (client_id, 'Tell me about Petico Malaysia and what they sell', 'brand', ARRAY['chatgpt','gemini','claude'], 1),
    (client_id, 'Is Petico a good place to buy pet food online in Malaysia?', 'brand', ARRAY['chatgpt','gemini','claude'], 2),
    -- Category
    (client_id, 'What are the best online pet shops in Malaysia?', 'category', ARRAY['chatgpt','gemini','claude'], 3),
    (client_id, 'Where can I buy premium dog food online in Malaysia?', 'category', ARRAY['chatgpt','gemini','claude'], 4),
    (client_id, 'Best cat food delivery service in Malaysia', 'category', ARRAY['chatgpt','gemini','claude'], 5),
    -- Comparison
    (client_id, 'Compare Petico vs PetBacker for buying pet supplies online in Malaysia', 'comparison', ARRAY['chatgpt','gemini','claude'], 6),
    (client_id, 'Which online pet store in Malaysia has the best prices?', 'comparison', ARRAY['chatgpt','claude'], 7),
    -- Local
    (client_id, 'Best pet food brands available for delivery in Kuala Lumpur', 'local', ARRAY['chatgpt','gemini','claude'], 8),
    (client_id, 'Online pet shops that ship to Johor Bahru Malaysia', 'local', ARRAY['gemini','claude'], 9),
    -- Problem
    (client_id, 'My dog has a sensitive stomach, where can I buy specialist food online in Malaysia?', 'problem', ARRAY['chatgpt','gemini','claude'], 10);

END $$;
