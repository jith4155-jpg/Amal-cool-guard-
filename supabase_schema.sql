-- ============================================================================
-- AMAL COOLGUARD - SUPABASE DATABASE SCHEMA, RLS POLICIES & STORAGE POLICIES
-- Bucket Name: Amalcoolguard (Public)
-- Admin Email: libinvincent310@gmail.com
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Helper Function: Check if signed-in user is the store Admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(lower(auth.jwt() ->> 'email') = 'libinvincent310@gmail.com', false);
$$;

-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- Customer Profiles
CREATE TABLE IF NOT EXISTS public.users (
  uid text PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  photo_url text NOT NULL DEFAULT '',
  mobile text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  pincode text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Storefront Product Catalog
CREATE TABLE IF NOT EXISTS public.products (
  id text PRIMARY KEY,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
  discount_price numeric NOT NULL DEFAULT 0 CHECK (discount_price >= 0),
  description text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  gallery_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  category text NOT NULL DEFAULT 'Coats',
  rating numeric NOT NULL DEFAULT 4.8,
  reviews_count integer NOT NULL DEFAULT 1,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  stock integer NOT NULL DEFAULT 25,
  gst_percent numeric NOT NULL DEFAULT 0 CHECK (gst_percent >= 0),
  delivery_charge numeric NOT NULL DEFAULT 0 CHECK (delivery_charge >= 0),
  estimated_delivery_days text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Customer Bookings / Orders
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text UNIQUE NOT NULL,
  user_id text NOT NULL,
  user_email text NOT NULL DEFAULT '',
  user_name text NOT NULL DEFAULT '',
  user_photo text NOT NULL DEFAULT '',
  customer_name text NOT NULL,
  phone_number text NOT NULL,
  address text NOT NULL DEFAULT '',
  pincode text NOT NULL DEFAULT '',
  product_id text NOT NULL,
  product_name text NOT NULL DEFAULT '',
  product_image text NOT NULL DEFAULT '',
  product_price numeric NOT NULL DEFAULT 0,
  gst_percent numeric NOT NULL DEFAULT 0,
  gst_amount numeric NOT NULL DEFAULT 0,
  gst_number text NOT NULL DEFAULT '',
  delivery_charge numeric NOT NULL DEFAULT 0,
  estimated_delivery_days text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'UPI',
  payment_screenshot text,
  referral_code text,
  promoter_id text,
  promoter_user_id text NOT NULL DEFAULT '',
  promoter_email text NOT NULL DEFAULT '',
  promoter_commission numeric NOT NULL DEFAULT 0,
  tracking_id text NOT NULL DEFAULT '',
  tracking_url text NOT NULL DEFAULT '',
  courier_name text NOT NULL DEFAULT '',
  delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'shipped', 'delivered')),
  dispatched_at text NOT NULL DEFAULT '',
  delivered_at text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending', 'pending_verification', 'confirmed', 'rejected', 'cancelled', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_order_id ON public.bookings (order_id);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON public.bookings (created_at DESC);

-- Affiliate / Promoter Profiles
CREATE TABLE IF NOT EXISTS public.promoters (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  channel_name text NOT NULL DEFAULT 'YouTuber / Influencer',
  payment_type text NOT NULL DEFAULT 'upi' CHECK (payment_type IN ('upi', 'bank')),
  upi_id text NOT NULL DEFAULT '',
  bank_name text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  ifsc_code text NOT NULL DEFAULT '',
  account_holder_name text NOT NULL DEFAULT '',
  commission_per_sale numeric NOT NULL DEFAULT 100,
  paid_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promoters_user_id ON public.promoters (user_id);
CREATE INDEX IF NOT EXISTS idx_promoters_email ON public.promoters (lower(email));

-- PII-free Referral Sales Summary (for Promoter Portal & Live Courier Tracking)
CREATE TABLE IF NOT EXISTS public.promoter_sales (
  order_id text PRIMARY KEY,
  booking_doc_id text NOT NULL DEFAULT '',
  buyer_user_id text NOT NULL,
  promoter_id text NOT NULL,
  promoter_user_id text NOT NULL DEFAULT '',
  promoter_email text NOT NULL DEFAULT '',
  product_id text NOT NULL,
  product_name text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  commission numeric NOT NULL DEFAULT 100,
  delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'shipped', 'delivered')),
  courier_name text NOT NULL DEFAULT '',
  tracking_id text NOT NULL DEFAULT '',
  dispatched_at text NOT NULL DEFAULT '',
  delivered_at text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending', 'pending_verification', 'confirmed', 'rejected', 'cancelled', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promoter_sales_prom_uid ON public.promoter_sales (promoter_user_id);
CREATE INDEX IF NOT EXISTS idx_promoter_sales_prom_email ON public.promoter_sales (lower(promoter_email));

-- Store Settings (payment, categories, catalog, order_counter)
CREATE TABLE IF NOT EXISTS public.store_settings (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. SECURITY TRIGGERS (Protect Admin-Only & Financial Fields)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_booking_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id <> OLD.user_id OR NEW.order_id <> OLD.order_id THEN
    RAISE EXCEPTION 'Cannot change order ownership fields';
  END IF;

  -- Customers can only cancel or re-upload payment screenshot
  IF NEW.status NOT IN ('cancelled', 'pending_verification', OLD.status) THEN
    RAISE EXCEPTION 'Only admin can confirm or reject orders';
  END IF;

  -- Preserve admin-managed delivery, tracking, pricing & commission fields
  NEW.delivery_status := OLD.delivery_status;
  NEW.dispatched_at := OLD.dispatched_at;
  NEW.delivered_at := OLD.delivered_at;
  NEW.tracking_id := OLD.tracking_id;
  NEW.tracking_url := OLD.tracking_url;
  NEW.courier_name := OLD.courier_name;
  NEW.estimated_delivery_days := OLD.estimated_delivery_days;
  NEW.promoter_commission := OLD.promoter_commission;
  NEW.price := OLD.price;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_booking_admin_fields ON public.bookings;
CREATE TRIGGER trg_protect_booking_admin_fields
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.protect_booking_admin_fields();

CREATE OR REPLACE FUNCTION public.protect_promoter_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  NEW.id := OLD.id;
  NEW.commission_per_sale := OLD.commission_per_sale;
  NEW.paid_amount := OLD.paid_amount;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_promoter_admin_fields ON public.promoters;
CREATE TRIGGER trg_protect_promoter_admin_fields
BEFORE UPDATE ON public.promoters
FOR EACH ROW EXECUTE FUNCTION public.protect_promoter_admin_fields();

-- ============================================================================
-- 4. RPC HELPERS (Sequential Order IDs & Safe Referral Lookup)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.next_order_number()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_val integer;
BEGIN
  INSERT INTO public.store_settings (id, data, updated_at)
  VALUES ('order_counter', '{"nextVal": 2}'::jsonb, now())
  ON CONFLICT (id) DO NOTHING;

  IF FOUND THEN
    RETURN 1;
  END IF;

  UPDATE public.store_settings
  SET
    data = jsonb_set(
      coalesce(data, '{}'::jsonb),
      '{nextVal}',
      to_jsonb(coalesce((data ->> 'nextVal')::integer, 1) + 1),
      true
    ),
    updated_at = now()
  WHERE id = 'order_counter'
  RETURNING coalesce((data ->> 'nextVal')::integer, 2) - 1 INTO current_val;

  RETURN coalesce(current_val, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_order_number() TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_promoter_referral(ref_code text)
RETURNS TABLE (
  id text,
  user_id text,
  email text,
  commission_per_sale numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.user_id, p.email, p.commission_per_sale
  FROM public.promoters p
  WHERE upper(p.id) = upper(trim(ref_code))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_promoter_referral(text) TO anon, authenticated;

-- ============================================================================
-- 5. ENABLE ROW LEVEL SECURITY (RLS) & POLICIES
-- ============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promoters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promoter_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- users policies
DROP POLICY IF EXISTS "users_select_own_or_admin" ON public.users;
CREATE POLICY "users_select_own_or_admin" ON public.users
  FOR SELECT USING (public.is_admin() OR auth.uid()::text = uid);

DROP POLICY IF EXISTS "users_insert_own" ON public.users;
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid()::text = uid);

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (public.is_admin() OR auth.uid()::text = uid)
  WITH CHECK (public.is_admin() OR auth.uid()::text = uid);

DROP POLICY IF EXISTS "users_delete_own_or_admin" ON public.users;
CREATE POLICY "users_delete_own_or_admin" ON public.users
  FOR DELETE USING (public.is_admin() OR auth.uid()::text = uid);

-- products policies (public catalog read, admin write)
DROP POLICY IF EXISTS "products_public_read" ON public.products;
CREATE POLICY "products_public_read" ON public.products
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "products_admin_insert" ON public.products;
CREATE POLICY "products_admin_insert" ON public.products
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "products_admin_update" ON public.products;
CREATE POLICY "products_admin_update" ON public.products
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "products_admin_delete" ON public.products;
CREATE POLICY "products_admin_delete" ON public.products
  FOR DELETE USING (public.is_admin());

-- bookings policies
DROP POLICY IF EXISTS "bookings_select_owner_or_admin" ON public.bookings;
CREATE POLICY "bookings_select_owner_or_admin" ON public.bookings
  FOR SELECT USING (public.is_admin() OR auth.uid()::text = user_id);

DROP POLICY IF EXISTS "bookings_insert_owner" ON public.bookings;
CREATE POLICY "bookings_insert_owner" ON public.bookings
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND auth.uid()::text = user_id
    AND status IN ('pending', 'pending_verification')
  );

DROP POLICY IF EXISTS "bookings_update_owner_or_admin" ON public.bookings;
CREATE POLICY "bookings_update_owner_or_admin" ON public.bookings
  FOR UPDATE USING (public.is_admin() OR auth.uid()::text = user_id)
  WITH CHECK (public.is_admin() OR auth.uid()::text = user_id);

DROP POLICY IF EXISTS "bookings_delete_owner_or_admin" ON public.bookings;
CREATE POLICY "bookings_delete_owner_or_admin" ON public.bookings
  FOR DELETE USING (public.is_admin() OR auth.uid()::text = user_id);

-- promoters policies
DROP POLICY IF EXISTS "promoters_select_owner_or_admin" ON public.promoters;
CREATE POLICY "promoters_select_owner_or_admin" ON public.promoters
  FOR SELECT USING (
    public.is_admin()
    OR auth.uid()::text = user_id
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = lower(email)
  );

DROP POLICY IF EXISTS "promoters_insert_owner_or_admin" ON public.promoters;
CREATE POLICY "promoters_insert_owner_or_admin" ON public.promoters
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR (
      auth.role() = 'authenticated'
      AND auth.uid()::text = user_id
      AND lower(coalesce(auth.jwt() ->> 'email', '')) = lower(email)
    )
  );

DROP POLICY IF EXISTS "promoters_update_owner_or_admin" ON public.promoters;
CREATE POLICY "promoters_update_owner_or_admin" ON public.promoters
  FOR UPDATE USING (
    public.is_admin()
    OR auth.uid()::text = user_id
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = lower(email)
  )
  WITH CHECK (
    public.is_admin()
    OR auth.uid()::text = user_id
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = lower(email)
  );

DROP POLICY IF EXISTS "promoters_delete_admin" ON public.promoters;
CREATE POLICY "promoters_delete_admin" ON public.promoters
  FOR DELETE USING (public.is_admin());

-- promoter_sales policies
DROP POLICY IF EXISTS "promoter_sales_select" ON public.promoter_sales;
CREATE POLICY "promoter_sales_select" ON public.promoter_sales
  FOR SELECT USING (
    public.is_admin()
    OR auth.uid()::text = promoter_user_id
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = lower(promoter_email)
    OR auth.uid()::text = buyer_user_id
  );

DROP POLICY IF EXISTS "promoter_sales_insert" ON public.promoter_sales;
CREATE POLICY "promoter_sales_insert" ON public.promoter_sales
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR (
      auth.role() = 'authenticated'
      AND auth.uid()::text = buyer_user_id
      AND status IN ('pending', 'pending_verification')
    )
  );

DROP POLICY IF EXISTS "promoter_sales_update" ON public.promoter_sales;
CREATE POLICY "promoter_sales_update" ON public.promoter_sales
  FOR UPDATE USING (
    public.is_admin() OR auth.uid()::text = buyer_user_id
  )
  WITH CHECK (
    public.is_admin() OR (auth.uid()::text = buyer_user_id AND status = 'cancelled')
  );

DROP POLICY IF EXISTS "promoter_sales_delete" ON public.promoter_sales;
CREATE POLICY "promoter_sales_delete" ON public.promoter_sales
  FOR DELETE USING (public.is_admin() OR auth.uid()::text = buyer_user_id);

-- store_settings policies
DROP POLICY IF EXISTS "store_settings_read" ON public.store_settings;
CREATE POLICY "store_settings_read" ON public.store_settings
  FOR SELECT USING (
    id IN ('payment', 'categories', 'catalog')
    OR auth.role() = 'authenticated'
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "store_settings_admin_write" ON public.store_settings;
CREATE POLICY "store_settings_admin_write" ON public.store_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================================
-- 6. REALTIME PUBLICATION
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products', 'bookings', 'promoters', 'promoter_sales', 'store_settings'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 7. STORAGE BUCKET ('Amalcoolguard') & STORAGE POLICIES
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('Amalcoolguard', 'Amalcoolguard', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public read Amalcoolguard" ON storage.objects;
CREATE POLICY "Public read Amalcoolguard"
ON storage.objects FOR SELECT
USING (bucket_id = 'Amalcoolguard');

DROP POLICY IF EXISTS "Admin insert Amalcoolguard" ON storage.objects;
CREATE POLICY "Admin insert Amalcoolguard"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'Amalcoolguard' AND public.is_admin());

DROP POLICY IF EXISTS "Admin update Amalcoolguard" ON storage.objects;
CREATE POLICY "Admin update Amalcoolguard"
ON storage.objects FOR UPDATE
USING (bucket_id = 'Amalcoolguard' AND public.is_admin())
WITH CHECK (bucket_id = 'Amalcoolguard' AND public.is_admin());

DROP POLICY IF EXISTS "Admin delete Amalcoolguard" ON storage.objects;
CREATE POLICY "Admin delete Amalcoolguard"
ON storage.objects FOR DELETE
USING (bucket_id = 'Amalcoolguard' AND public.is_admin());

DROP POLICY IF EXISTS "Customer upload payment screenshot" ON storage.objects;
CREATE POLICY "Customer upload payment screenshot"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'Amalcoolguard'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'screenshots'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
