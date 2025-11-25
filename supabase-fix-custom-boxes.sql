-- =====================================================
-- FIX: Permitir a usuarios crear cajas personalizadas
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- Paso 1: Eliminar políticas existentes conflictivas para box_catalog
DROP POLICY IF EXISTS "Anyone can view active boxes" ON box_catalog;
DROP POLICY IF EXISTS "Admins can manage boxes" ON box_catalog;
DROP POLICY IF EXISTS "Anyone can view standard boxes" ON box_catalog;
DROP POLICY IF EXISTS "Users can view own custom boxes" ON box_catalog;
DROP POLICY IF EXISTS "Users can create custom boxes" ON box_catalog;
DROP POLICY IF EXISTS "Users can update own custom boxes" ON box_catalog;
DROP POLICY IF EXISTS "Users can delete own custom boxes" ON box_catalog;

-- Paso 2: Crear políticas claras y sin conflictos

-- SELECT: Cualquier usuario autenticado puede ver cajas estándar activas
CREATE POLICY "select_standard_boxes" ON box_catalog
  FOR SELECT
  USING (is_standard = TRUE AND active = TRUE);

-- SELECT: Usuarios pueden ver sus propias cajas personalizadas
CREATE POLICY "select_own_custom_boxes" ON box_catalog
  FOR SELECT
  USING (
    is_standard = FALSE AND
    created_by = auth.uid()
  );

-- SELECT: Admins pueden ver todas las cajas
CREATE POLICY "admin_select_all_boxes" ON box_catalog
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- INSERT: Usuarios autenticados pueden crear cajas personalizadas
-- IMPORTANTE: Debe coincidir created_by con el usuario actual
CREATE POLICY "insert_custom_boxes" ON box_catalog
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    is_standard = FALSE AND
    created_by = auth.uid()
  );

-- INSERT: Admins pueden crear cualquier caja (incluidas estándar)
CREATE POLICY "admin_insert_boxes" ON box_catalog
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- UPDATE: Usuarios pueden actualizar sus propias cajas personalizadas
CREATE POLICY "update_own_custom_boxes" ON box_catalog
  FOR UPDATE
  USING (
    is_standard = FALSE AND
    created_by = auth.uid()
  )
  WITH CHECK (
    is_standard = FALSE AND
    created_by = auth.uid()
  );

-- UPDATE: Admins pueden actualizar cualquier caja
CREATE POLICY "admin_update_boxes" ON box_catalog
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- DELETE: Usuarios pueden eliminar sus propias cajas personalizadas
CREATE POLICY "delete_own_custom_boxes" ON box_catalog
  FOR DELETE
  USING (
    is_standard = FALSE AND
    created_by = auth.uid()
  );

-- DELETE: Admins pueden eliminar cualquier caja
CREATE POLICY "admin_delete_boxes" ON box_catalog
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Paso 3: Asegurar que RLS está habilitado
ALTER TABLE box_catalog ENABLE ROW LEVEL SECURITY;

-- Paso 4: Verificar que la tabla profiles permite a usuarios ver su propio perfil
-- (necesario para que las políticas de admin funcionen)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Paso 5: Verificar políticas existentes
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'box_catalog';
