-- =====================================================
-- SCHEMA DE BASE DE DATOS PARA SISTEMA DE CAJAS
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- Habilitar UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLA: profiles (extiende auth.users)
-- =====================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  company_name TEXT,
  address TEXT,
  city TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para crear profile automáticamente al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- TABLA: box_catalog (catálogo de cajas)
-- =====================================================
CREATE TABLE box_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  l_mm INTEGER NOT NULL, -- largo en mm
  w_mm INTEGER NOT NULL, -- ancho en mm
  h_mm INTEGER NOT NULL, -- alto en mm
  unfolded_w INTEGER NOT NULL, -- largo desplegado
  unfolded_h INTEGER NOT NULL, -- alto desplegado
  is_doble_chapeton BOOLEAN DEFAULT FALSE,
  plancha_w INTEGER, -- para doble chapetón
  is_standard BOOLEAN DEFAULT TRUE, -- true = catálogo estándar
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN DEFAULT TRUE
);

-- Insertar cajas estándar
INSERT INTO box_catalog (name, l_mm, w_mm, h_mm, unfolded_w, unfolded_h, is_standard) VALUES
  ('20×20×10', 200, 200, 100, 850, 300, TRUE),
  ('20×20×20', 200, 200, 200, 850, 400, TRUE),
  ('30×20×15', 300, 200, 150, 1050, 350, TRUE),
  ('30×20×20', 300, 200, 200, 1050, 400, TRUE),
  ('40×30×20', 400, 300, 200, 1450, 500, TRUE),
  ('40×30×30', 400, 300, 300, 1450, 600, TRUE),
  ('50×40×30', 500, 400, 300, 1850, 700, TRUE),
  ('50×40×40', 500, 400, 400, 1850, 800, TRUE),
  ('60×40×30', 600, 400, 300, 2050, 700, TRUE),
  ('60×40×40', 600, 400, 400, 2050, 800, TRUE),
  ('70×50×50 (2P)', 700, 500, 500, 1250, 1000, TRUE);

-- Actualizar doble chapetón
UPDATE box_catalog SET is_doble_chapeton = TRUE, plancha_w = 1250 WHERE name = '70×50×50 (2P)';

-- =====================================================
-- TABLA: client_boxes (cajas preferidas por cliente)
-- =====================================================
CREATE TABLE client_boxes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  box_id UUID NOT NULL REFERENCES box_catalog(id) ON DELETE CASCADE,
  nickname TEXT, -- nombre personalizado del cliente para esta caja
  typical_quantity INTEGER DEFAULT 100,
  notes TEXT,
  last_ordered_at TIMESTAMPTZ,
  order_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, box_id)
);

-- =====================================================
-- TABLA: orders (órdenes de compra)
-- =====================================================
CREATE TYPE order_status AS ENUM (
  'pending',      -- Pendiente de aprobación
  'approved',     -- Aprobada
  'in_production',-- En producción
  'ready',        -- Lista para entrega
  'delivered',    -- Entregada
  'cancelled'     -- Cancelada
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number SERIAL UNIQUE,
  client_id UUID NOT NULL REFERENCES profiles(id),
  status order_status DEFAULT 'pending',
  requested_date DATE NOT NULL, -- Fecha solicitada de entrega
  approved_date DATE, -- Fecha aprobada de entrega
  delivery_date DATE, -- Fecha real de entrega
  notes TEXT, -- Notas del cliente
  admin_notes TEXT, -- Notas internas
  total_boxes INTEGER DEFAULT 0,
  total_planchas INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id)
);

-- =====================================================
-- TABLA: order_items (items de cada orden)
-- =====================================================
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  box_id UUID NOT NULL REFERENCES box_catalog(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABLA: order_history (historial de cambios)
-- =====================================================
CREATE TABLE order_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES profiles(id),
  old_status order_status,
  new_status order_status,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- VISTAS ÚTILES
-- =====================================================

-- Vista de órdenes con info del cliente
CREATE VIEW orders_with_client AS
SELECT 
  o.*,
  p.full_name as client_name,
  p.company_name,
  p.email as client_email,
  p.phone as client_phone
FROM orders o
JOIN profiles p ON o.client_id = p.id;

-- Vista de análisis de clientes (corregida con CTE)
CREATE VIEW client_analytics AS
WITH order_diffs AS (
  SELECT 
    o.client_id,
    o.created_at,
    EXTRACT(EPOCH FROM (o.created_at - LAG(o.created_at) OVER (PARTITION BY o.client_id ORDER BY o.created_at))) / 86400.0 AS days_since_prev
  FROM orders o
  WHERE o.status != 'cancelled'
),
client_order_stats AS (
  SELECT 
    client_id,
    ROUND(AVG(days_since_prev))::INTEGER AS avg_days_between_orders
  FROM order_diffs
  WHERE days_since_prev IS NOT NULL
  GROUP BY client_id
)
SELECT 
  p.id as client_id,
  p.full_name,
  p.company_name,
  p.email,
  COUNT(DISTINCT o.id) as total_orders,
  COALESCE(SUM(o.total_boxes), 0) as total_boxes_ordered,
  MAX(o.created_at) as last_order_date,
  MIN(o.created_at) as first_order_date,
  cos.avg_days_between_orders
FROM profiles p
LEFT JOIN orders o ON p.id = o.client_id AND o.status != 'cancelled'
LEFT JOIN client_order_stats cos ON p.id = cos.client_id
WHERE p.role = 'client'
GROUP BY p.id, p.full_name, p.company_name, p.email, cos.avg_days_between_orders;

-- =====================================================
-- FUNCIONES
-- =====================================================

-- Función para actualizar totales de orden
CREATE OR REPLACE FUNCTION update_order_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE orders SET 
    total_boxes = (
      SELECT COALESCE(SUM(quantity), 0) 
      FROM order_items WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
    ),
    total_planchas = (
      SELECT COALESCE(SUM(
        CASE WHEN b.is_doble_chapeton THEN oi.quantity * 2 ELSE oi.quantity END
      ), 0)
      FROM order_items oi
      JOIN box_catalog b ON oi.box_id = b.id
      WHERE oi.order_id = COALESCE(NEW.order_id, OLD.order_id)
    ),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_order_item_change
  AFTER INSERT OR UPDATE OR DELETE ON order_items
  FOR EACH ROW EXECUTE FUNCTION update_order_totals();

-- Función para registrar cambios de estado
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO order_history (order_id, old_status, new_status)
    VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_order_status_change
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION log_order_status_change();

-- Función para actualizar client_boxes al hacer orden
CREATE OR REPLACE FUNCTION update_client_box_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO client_boxes (client_id, box_id, last_ordered_at, order_count)
  SELECT 
    o.client_id,
    NEW.box_id,
    NOW(),
    1
  FROM orders o WHERE o.id = NEW.order_id
  ON CONFLICT (client_id, box_id) DO UPDATE SET
    last_ordered_at = NOW(),
    order_count = client_boxes.order_count + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_order_item_insert
  AFTER INSERT ON order_items
  FOR EACH ROW EXECUTE FUNCTION update_client_box_stats();

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE box_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_history ENABLE ROW LEVEL SECURITY;

-- Policies para profiles
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update all profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Policies para box_catalog
-- SELECT: Cajas estándar activas visibles para todos los usuarios autenticados
CREATE POLICY "select_standard_boxes" ON box_catalog
  FOR SELECT USING (is_standard = TRUE AND active = TRUE);

-- SELECT: Usuarios pueden ver sus propias cajas personalizadas
CREATE POLICY "select_own_custom_boxes" ON box_catalog
  FOR SELECT USING (is_standard = FALSE AND created_by = auth.uid());

-- SELECT: Admins pueden ver todas las cajas
CREATE POLICY "admin_select_all_boxes" ON box_catalog
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- INSERT: Usuarios pueden crear cajas personalizadas (created_by debe ser el usuario actual)
CREATE POLICY "insert_custom_boxes" ON box_catalog
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    is_standard = FALSE AND
    created_by = auth.uid()
  );

-- INSERT: Admins pueden crear cualquier caja
CREATE POLICY "admin_insert_boxes" ON box_catalog
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- UPDATE: Usuarios pueden actualizar sus propias cajas personalizadas
CREATE POLICY "update_own_custom_boxes" ON box_catalog
  FOR UPDATE
  USING (is_standard = FALSE AND created_by = auth.uid())
  WITH CHECK (is_standard = FALSE AND created_by = auth.uid());

-- UPDATE: Admins pueden actualizar cualquier caja
CREATE POLICY "admin_update_boxes" ON box_catalog
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- DELETE: Usuarios pueden eliminar sus propias cajas personalizadas
CREATE POLICY "delete_own_custom_boxes" ON box_catalog
  FOR DELETE USING (is_standard = FALSE AND created_by = auth.uid());

-- DELETE: Admins pueden eliminar cualquier caja
CREATE POLICY "admin_delete_boxes" ON box_catalog
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Policies para client_boxes
CREATE POLICY "Clients can view own boxes" ON client_boxes
  FOR SELECT USING (client_id = auth.uid());

CREATE POLICY "Admins can view all client boxes" ON client_boxes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Policies para orders
CREATE POLICY "Clients can view own orders" ON orders
  FOR SELECT USING (client_id = auth.uid());

CREATE POLICY "Clients can create orders" ON orders
  FOR INSERT WITH CHECK (client_id = auth.uid());

CREATE POLICY "Admins can view all orders" ON orders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update orders" ON orders
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Policies para order_items
CREATE POLICY "Users can view own order items" ON order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.client_id = auth.uid())
  );

CREATE POLICY "Users can create order items for own orders" ON order_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.client_id = auth.uid())
  );

CREATE POLICY "Admins can manage all order items" ON order_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =====================================================
-- ÍNDICES
-- =====================================================
CREATE INDEX idx_orders_client ON orders(client_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_requested_date ON orders(requested_date);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_client_boxes_client ON client_boxes(client_id);

-- =====================================================
-- NOTA: Las políticas RLS para box_catalog están definidas
-- arriba junto con las otras políticas de tablas
-- =====================================================
