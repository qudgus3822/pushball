import { createClient } from '@supabase/supabase-js'

// Supabase 프로젝트 URL과 API 키를 여기에 입력하세요
// https://supabase.com/dashboard 에서 확인 가능
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'

// Supabase 클라이언트 생성 - 2025-11-14, 김병현 수정
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
