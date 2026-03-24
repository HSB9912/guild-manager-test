import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://luglshrfkkeacmefnvlm.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1Z2xzaHJma2tlYWNtZWZudmxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNjE0NTIsImV4cCI6MjA4NzYzNzQ1Mn0.LrJ-ejXJGqVGzrJyL5nFW45J92-MxrcKuEpE2EGNsIo'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
