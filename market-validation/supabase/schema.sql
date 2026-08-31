-- ============================================
-- MARKET VALIDATION PLATFORM — SUPABASE SCHEMA
-- ============================================
-- Execute this SQL in your Supabase SQL Editor
-- Dashboard → SQL Editor → New query → Paste → Run

-- 1. Table principale des réponses au sondage
CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Étape 1 : Problème
  problem_type VARCHAR(20) NOT NULL CHECK (problem_type IN ('free_text', 'category')),
  problem_category VARCHAR(50) CHECK (problem_category IN ('mode', 'tech', 'beaute')),
  problem_text TEXT,
  
  -- Étape 2 : Produit / Solution
  product_type VARCHAR(20) NOT NULL CHECK (product_type IN ('free_text', 'category')),
  product_category VARCHAR(50) CHECK (product_category IN ('mode', 'tech', 'beaute')),
  product_text TEXT,
  
  -- Étape 3 : Contact (facultatif)
  wants_contact BOOLEAN NOT NULL DEFAULT false,
  country VARCHAR(100),
  country_code VARCHAR(10),
  contact_method VARCHAR(20) CHECK (contact_method IN ('whatsapp', 'phone', 'email')),
  phone VARCHAR(30),
  email VARCHAR(255),
  contact_consent BOOLEAN NOT NULL DEFAULT false,
  
  -- Métadonnées anti-spam
  ip_hash VARCHAR(64),
  user_agent_hash VARCHAR(64),
  
  -- Lien vers opportunité (rempli plus tard, manuellement ou par IA)
  opportunity_id UUID,
  
  -- Contraintes de validation
  CONSTRAINT valid_problem CHECK (
    (problem_type = 'free_text' AND problem_text IS NOT NULL AND length(problem_text) > 0)
    OR
    (problem_type = 'category' AND problem_category IS NOT NULL)
  ),
  CONSTRAINT valid_product CHECK (
    (product_type = 'free_text' AND product_text IS NOT NULL AND length(product_text) > 0)
    OR
    (product_type = 'category' AND product_category IS NOT NULL)
  ),
  CONSTRAINT valid_contact CHECK (
    (wants_contact = false)
    OR
    (wants_contact = true AND contact_consent = true AND contact_method IS NOT NULL AND country IS NOT NULL
      AND (
        (contact_method IN ('whatsapp', 'phone') AND phone IS NOT NULL AND length(phone) > 0)
        OR
        (contact_method = 'email' AND email IS NOT NULL AND length(email) > 0)
      )
    )
  )
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_responses_created_at ON survey_responses(created_at DESC);
CREATE INDEX idx_responses_problem_category ON survey_responses(problem_category);
CREATE INDEX idx_responses_product_category ON survey_responses(product_category);
CREATE INDEX idx_responses_country_code ON survey_responses(country_code);
CREATE INDEX idx_responses_wants_contact ON survey_responses(wants_contact);
CREATE INDEX idx_responses_opportunity ON survey_responses(opportunity_id);
CREATE INDEX idx_responses_ip_hash ON survey_responses(ip_hash);

-- 2. Table des opportunités (regroupements de réponses)
CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Identité
  name VARCHAR(255) NOT NULL,
  problem_summary TEXT,
  product_summary TEXT,
  category VARCHAR(50) CHECK (category IN ('mode', 'tech', 'beaute', 'mixte')),
  
  -- Statut de suivi
  status VARCHAR(30) NOT NULL DEFAULT 'nouvelle' CHECK (status IN (
    'nouvelle', 'a_analyser', 'a_tester', 'test_en_cours', 
    'prometteuse', 'produit_lance', 'abandonnee'
  )),
  
  -- Métriques calculées
  opportunity_score DECIMAL(5,2) DEFAULT 0,
  demand_count INTEGER DEFAULT 0,
  interest_count INTEGER DEFAULT 0,
  contact_count INTEGER DEFAULT 0,
  interest_rate DECIMAL(5,2) DEFAULT 0,
  contact_rate DECIMAL(5,2) DEFAULT 0,
  growth_rate DECIMAL(5,2) DEFAULT 0,
  
  -- Données géographiques
  countries JSONB DEFAULT '[]'::jsonb,
  
  -- Champs pour future analyse IA
  ai_summary TEXT,
  ai_keywords JSONB DEFAULT '[]'::jsonb,
  ai_analyzed_at TIMESTAMPTZ,
  
  -- Métadonnées extensibles
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_opportunities_status ON opportunities(status);
CREATE INDEX idx_opportunities_score ON opportunities(opportunity_score DESC);
CREATE INDEX idx_opportunities_category ON opportunities(category);

-- Ajouter la clé étrangère sur survey_responses
ALTER TABLE survey_responses 
  ADD CONSTRAINT fk_opportunity 
  FOREIGN KEY (opportunity_id) 
  REFERENCES opportunities(id) 
  ON DELETE SET NULL;

-- 3. Table des tests produits
CREATE TABLE IF NOT EXISTS product_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Infos test
  test_start_date DATE,
  test_end_date DATE,
  product_name VARCHAR(255),
  supplier VARCHAR(255),
  
  -- Finances
  purchase_cost DECIMAL(10,2),
  selling_price DECIMAL(10,2),
  ad_budget DECIMAL(10,2),
  
  -- Métriques pré-test (snapshot du sondage)
  pre_test_interested INTEGER DEFAULT 0,
  pre_test_contacts INTEGER DEFAULT 0,
  
  -- Résultats réels
  actual_orders INTEGER DEFAULT 0,
  actual_revenue DECIMAL(10,2) DEFAULT 0,
  actual_profit DECIMAL(10,2) DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  
  -- Statut
  status VARCHAR(30) NOT NULL DEFAULT 'en_cours' CHECK (status IN (
    'en_cours', 'termine', 'abandonne'
  )),
  
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_product_tests_opportunity ON product_tests(opportunity_id);

-- 4. Table de rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
  ip_hash VARCHAR(64) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (ip_hash, window_start)
);

CREATE INDEX idx_rate_limits_window ON rate_limits(window_start);

-- 5. Row Level Security (RLS)
-- Les participants peuvent UNIQUEMENT insérer des réponses
-- Les admins peuvent tout lire/modifier

ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Politique : Insertion publique pour les réponses au sondage
CREATE POLICY "Allow public insert on survey_responses"
  ON survey_responses
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Politique : Lecture admin uniquement
CREATE POLICY "Allow admin read on survey_responses"
  ON survey_responses
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow admin update on survey_responses"
  ON survey_responses
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow admin delete on survey_responses"
  ON survey_responses
  FOR DELETE
  TO authenticated
  USING (true);

-- Opportunités : admin uniquement
CREATE POLICY "Allow admin all on opportunities"
  ON opportunities
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Tests produits : admin uniquement
CREATE POLICY "Allow admin all on product_tests"
  ON product_tests
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Rate limits : insertion publique, lecture admin
CREATE POLICY "Allow public insert on rate_limits"
  ON rate_limits
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow public update on rate_limits"
  ON rate_limits
  FOR UPDATE
  TO anon
  USING (true);

CREATE POLICY "Allow public select on rate_limits"
  ON rate_limits
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow admin all on rate_limits"
  ON rate_limits
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 6. Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_opportunities_updated_at
  BEFORE UPDATE ON opportunities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_product_tests_updated_at
  BEFORE UPDATE ON product_tests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 7. Fonction pour vérifier le rate limiting
CREATE OR REPLACE FUNCTION check_rate_limit(p_ip_hash VARCHAR, p_max_requests INTEGER DEFAULT 5, p_window_minutes INTEGER DEFAULT 60)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  v_window_start := now() - (p_window_minutes || ' minutes')::interval;
  
  SELECT COALESCE(SUM(request_count), 0)
  INTO v_count
  FROM rate_limits
  WHERE ip_hash = p_ip_hash
    AND window_start >= v_window_start;
  
  RETURN v_count < p_max_requests;
END;
$$ LANGUAGE plpgsql;
