-- =====================================================
-- LIMPIEZA COMPLETA DE POLÍTICAS RLS para box_catalog
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- Paso 1: Ver todas las políticas actuales de box_catalog
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'box_catalog';

-- Paso 2: Eliminar TODAS las políticas existentes de box_catalog
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE tablename = 'box_catalog'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON box_catalog', pol.policyname);
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END $$;

-- Paso 3: Crear políticas limpias

-- SELECT: Cajas estándar activas
CREATE POLICY "select_standard_boxes" ON box_catalog
  FOR SELECT USING (is_standard = TRUE AND active = TRUE);

-- SELECT: Usuarios ven sus propias cajas personalizadas
CREATE POLICY "select_own_custom_boxes" ON box_catalog
  FOR SELECT USING (is_standard = FALSE AND created_by = auth.uid());

-- SELECT: Admins ven todo
CREATE POLICY "admin_select_all_boxes" ON box_catalog
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- INSERT: Usuarios crean cajas personalizadas
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

-- UPDATE: Usuarios actualizan sus cajas
CREATE POLICY "update_own_custom_boxes" ON box_catalog
  FOR UPDATE
  USING (is_standard = FALSE AND created_by = auth.uid())
  WITH CHECK (is_standard = FALSE AND created_by = auth.uid());

-- UPDATE: Admins actualizan cualquier caja
CREATE POLICY "admin_update_boxes" ON box_catalog
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- DELETE: Usuarios eliminan sus cajas
CREATE POLICY "delete_own_custom_boxes" ON box_catalog
  FOR DELETE USING (is_standard = FALSE AND created_by = auth.uid());

-- DELETE: Admins eliminan cualquier caja
CREATE POLICY "admin_delete_boxes" ON box_catalog
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Paso 4: Verificar RLS habilitado
ALTER TABLE box_catalog ENABLE ROW LEVEL SECURITY;

-- Paso 5: Mostrar políticas finales
SELECT policyname, cmd, permissive FROM pg_policies WHERE tablename = 'box_catalog' ORDER BY cmd, policyname;
